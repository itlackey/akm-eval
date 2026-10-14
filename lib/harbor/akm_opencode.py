# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""The treatment arm of the evals that run an agent in Harbor with and without akm (evals/agent-ab, benchmarks/terminal-bench):
opencode with the akm-opencode plugin.

The control arm is Harbor's own `opencode` agent. This class is that agent plus four things, and nothing else:

1. The plugin, named in opencode's config.
2. akm itself: akm-cli installed, and an akm bundle seeded from the library `AKM_TASK_STASH` names (set in the task's
   `[environment.env]`, or for a task that is not ours in this agent's own `env` in the job), indexed, and left where
   the plugin looks for it.
3. The AKM_* settings, on every command the agent runs: the arm's own, then the ones the job adds with `akm_env`.
4. A check after the run that the plugin was live. Without it a trial where the plugin failed to load scores like a
   trial where the model chose not to call akm, and the treatment arm quietly becomes a second control arm. Such a
   trial is an error, not a score.

The versions come from the job config (`run.ts` writes it): opencode as Harbor's own `version` option, the plugin and
akm-cli as `akm_plugin_version` and `akm_cli_version`. By default both are npm releases, and the plugin depends on that
exact akm-cli. A release is installed from the lockfile committed for it in `locks/` (`npm ci`), so every container gets
the same dependency tree: neither package pins its own dependencies, and `npm install` would take the newest that each
caret range allows. A release with no lockfile is installed by `npm install`, and says so in what it records. A job that
tests a checkout of akm gives `packages_dir` instead: a folder of the tarballs that `npm pack` made on the host, which
`install` uploads with `environment.upload_dir` (Harbor 0.24.0 has no job setting for it) and installs from, as
`akm_package` and, when the checkout holds the plugin, `plugin_package` name them. A checkout has no lockfile.

What was installed is recorded, not required to be a version: the install writes `akm_install.json` into the trial's
agent folder and into the trial's context (`metadata["akm"]`), with what `akm --version` printed, the akm-cli the
plugin carries, how many assets the index holds, the AKM_* settings the arm ran with, the lockfile each install came
from and a digest of the dependency tree each one holds (`npm ls --all --json`). After the run,
`akm_plugin_status.json` holds the verdict on the plugin; Harbor keeps only the first exception of a trial, so an
`AgentTimeoutError` hides the error raised here, and the file is how run.ts finds the plugin failure.
"""

from __future__ import annotations

import hashlib
import json
import re
import shlex
from pathlib import Path
from typing import override

from pydantic import Field, field_validator, model_validator

from harbor.agents.installed.opencode import OpenCode, OpenCodeOptions
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

# akm lives under /opt, not /tmp: akm treats a bundle under /tmp as transient and moves its config.
AKM_ROOT = "/opt/akm"
BUNDLE = f"{AKM_ROOT}/bundle"
LIBRARIES = f"{AKM_ROOT}/libraries"  # uploaded for the seed, removed after it
PACKAGES = f"{AKM_ROOT}/packages"  # the tarballs of a checkout, uploaded for the install, removed after it
CLI_PREFIX = f"{AKM_ROOT}/cli"  # where akm-cli is installed: npm puts the package and its dependencies in node_modules under it
CLI_BIN = f"{CLI_PREFIX}/node_modules/.bin/akm"
PLUGIN_PREFIX = f"{AKM_ROOT}/plugin"  # where the plugin is installed, the same way
PLUGIN_DIR = f"{PLUGIN_PREFIX}/node_modules/akm-opencode"
# The lockfiles committed for the pinned releases: one folder per release, named <package>-<version>, with the package.json and the
# package-lock.json that `npm ci` reads. evals/agent-ab/README.md ("Dependencies") says how one is made.
LOCKS = Path(__file__).resolve().parent / "locks"
WARM_DATA = f"{AKM_ROOT}/opencode-warm"  # the warm-up session's XDG_DATA_HOME, so its log is at a known path

# The akm the plugin shells out to. Without this it runs the akm-cli it carries, which is installed without install
# scripts, so on Node that copy has no SQLite binding and every command it runs fails. It is a link to the akm-cli
# installed here, which is also the `akm` the agent's own shell finds.
AKM_CLI = "/usr/local/bin/akm"

# What the agent's commands run with. The five directories are one setting: with only some of them set, the index
# built in the setup is not the one the plugin reads, and every akm call returns nothing and no error. The rest
# keeps background work out of a single-turn run, which has no later turn to learn for. Session-start curation and
# the hints are the treatment and stay on; the two timeouts (seconds) only give them room in a loaded container.
AKM_ENV = {
    "AKM_BUNDLE_DIR": BUNDLE,
    "AKM_CONFIG_DIR": f"{AKM_ROOT}/config",
    "AKM_DATA_DIR": f"{AKM_ROOT}/data",
    "AKM_CACHE_DIR": f"{AKM_ROOT}/cache",
    "AKM_STATE_DIR": f"{AKM_ROOT}/state",
    "AKM_OPENCODE_CLI": AKM_CLI,
    "AKM_AUTO_FEEDBACK": "0",
    "AKM_AUTO_LEARNING": "0",
    "AKM_AUTO_MEMORY": "0",
    "AKM_INDEX_ON_SESSION_END": "0",
    "AKM_CURATE_TIMEOUT": "15",
    "AKM_PENDING_PROPOSAL_TIMEOUT": "5",
}

# What a job may not change with `akm_env`: the five directories are one setting (see above), and the plugin must keep
# running the akm this arm installed.
FIXED_AKM_ENV = frozenset([k for k in AKM_ENV if k.endswith("_DIR")] + ["AKM_OPENCODE_CLI"])

# Files the arm leaves in a trial's agent folder, for run.ts to read. Both hold JSON.
INSTALL_FILE = "akm_install.json"
PLUGIN_STATUS_FILE = "akm_plugin_status.json"

# The plugin writes one of these to opencode's log for every user message, so one is proof it loaded in that session.
PLUGIN_ACTIVE = "AKM user feedback recorded"
# And these when a hook or a helper command fails. The plugin logs them and carries on, so the exit status stays 0.
PLUGIN_FAILED = r"AKM (synchronous helper failed|command resolution failed|[^ ]+ hook failed)"  # grep -E and re both read it
# opencode's log directory under a trial's agent logs: XDG_DATA_HOME is /logs/agent/opencode/xdg-data in the run.
RUN_LOG_DIR = "opencode/xdg-data/opencode/log"

NVM = "[ -f ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh; "


def check_akm_env(env: dict[str, str]) -> dict[str, str]:
    """The AKM_* settings a job adds to the arm's, or a ValueError that names the one that does not belong."""
    for key in env:
        if not re.fullmatch(r"AKM_[A-Z0-9_]+", key):
            raise ValueError(f"akm_env: {key!r} is not an AKM_* setting")
        if key in FIXED_AKM_ENV:
            raise ValueError(f"akm_env: {key} is fixed by the arm. The directories move together and the plugin must run the akm installed here")
    return env


class AkmOpenCodeOptions(OpenCodeOptions):
    akm_cli_version: str
    akm_plugin_version: str
    libraries_dir: str  # one folder per library, each laid out as an akm bundle
    # How many assets akm indexes in the library. Without it, one for every file in it, which holds when each file is an asset.
    library_assets: int | None = None
    # Extra AKM_* settings for every command the akm arm runs, over the arm's own. A sweep of one setting goes here.
    akm_env: dict[str, str] = Field(default_factory=dict)
    # A checkout of akm, packed on the host: a folder of tarballs and the names of the ones to install. `akm_package`
    # replaces the npm release of akm-cli, `plugin_package` the npm release of the plugin. Each needs `packages_dir`.
    packages_dir: str | None = None
    akm_package: str | None = None
    plugin_package: str | None = None

    @field_validator("akm_env")
    @classmethod
    def _akm_env_is_akm(cls, env: dict[str, str]) -> dict[str, str]:
        return check_akm_env(env)

    @field_validator("akm_package", "plugin_package")
    @classmethod
    def _package_is_a_file_name(cls, name: str | None) -> str | None:
        if name is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*\.tgz", name):
            raise ValueError(f"{name!r} is not the name of a tarball in packages_dir")
        return name

    @model_validator(mode="after")
    def _packages_come_from_a_folder(self) -> "AkmOpenCodeOptions":
        if (self.akm_package or self.plugin_package) and not self.packages_dir:
            raise ValueError("akm_package and plugin_package are files in packages_dir, which is not set")
        return self


class AkmPluginNotLoadedError(RuntimeError):
    """The measured run shows no sign that the plugin was live, or that it ran degraded."""


def plugin_log_problem(logs: list[str]) -> str | None:
    """What is wrong with the plugin's showing in these opencode logs, or None when it was live and healthy."""
    if not logs:
        return "there is no opencode log"
    for text in logs:
        if failure := re.search(PLUGIN_FAILED, text):
            return f"the plugin logged {failure.group(0)!r}"
    if not any(PLUGIN_ACTIVE in text for text in logs):
        return f"the plugin never logged {PLUGIN_ACTIVE!r}"
    return None


def lock_folder(package: str, version: str) -> Path | None:
    """The folder of the lockfile committed for this release of `package`, or None when there is none."""
    folder = LOCKS / f"{package}-{version}"
    return folder if (folder / "package-lock.json").is_file() else None


def lock_sha256(folder: Path | None) -> str | None:
    """The digest of a lockfile, for the record of an install. None for an install that has none."""
    return hashlib.sha256((folder / "package-lock.json").read_bytes()).hexdigest() if folder else None


def tree_sha256(trees: dict[str, str]) -> str:
    """One digest over the dependency trees of the installs, so a run can compare its trials by one value."""
    return hashlib.sha256("".join(f"{name}={trees[name]}\n" for name in sorted(trees)).encode()).hexdigest()


def install_record(seeded: str, checked: str, env: dict[str, str], trees: str = "", lockfiles: dict[str, str | None] | None = None) -> dict:
    """What the setup printed, as the record kept with the trial: `akm --version`, the akm-cli the plugin carries, the assets indexed,
    the lockfile each install came from (None: it came from no lockfile) and the digest of the dependency tree each one holds."""
    check = re.search(r"^AKM-SETUP akm=(\S*) plugin_akm_cli=(\S*)$", checked, re.MULTILINE)
    assets = re.search(r"^AKM-SETUP assets=(\d+)$", seeded, re.MULTILINE)
    tree = re.search(r"^AKM-SETUP tree_akm_cli=([0-9a-f]{64}) tree_plugin=([0-9a-f]{64})$", trees, re.MULTILINE)
    found = {"akm_cli": tree.group(1), "plugin": tree.group(2)} if tree else None
    embeddings = re.search(r"^AKM-SETUP embeddings=(\d+)$", seeded, re.MULTILINE)
    semantic = re.search(r"^AKM-SETUP search_mode=semantic$", seeded, re.MULTILINE)
    return {
        "akm_version": check.group(1) if check else None,
        "plugin_akm_cli": check.group(2) if check else None,
        "assets_indexed": int(assets.group(1)) if assets else None,
        "env": dict(env),
        "lockfiles": dict(lockfiles or {"akm_cli": None, "plugin": None}),
        "dependency_trees": found,
        "dependency_tree_sha256": tree_sha256(found) if found else None,
        **({"search_mode": "semantic", "embeddings_indexed": int(embeddings.group(1)) if embeddings else None} if semantic else {}),
    }


class AkmOpenCode(OpenCode):
    options_model = AkmOpenCodeOptions
    options: AkmOpenCodeOptions

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._plugin_name = f"akm-opencode@{self.options.akm_plugin_version}"
        # The lockfile each install comes from, or None when the release has none or a tarball replaces it.
        self._akm_lock = None if self.options.akm_package else lock_folder("akm-cli", self.options.akm_cli_version)
        self._plugin_lock = None if self.options.plugin_package else lock_folder("akm-opencode", self.options.akm_plugin_version)
        # The plugin is installed under PLUGIN_PREFIX, from its lockfile, its release or its tarball, and named as the folder it
        # is in, which opencode loads as it does a local plugin. opencode's own install of a plugin by name would resolve the
        # plugin's dependencies when each container starts.
        self._plugin = f"file://{PLUGIN_DIR}"
        # The plugin is the only config the two arms differ in. The rest of the config comes from the job.
        self._opencode_config = {**self._opencode_config, "plugin": [self._plugin]}
        self._proof_checked = False
        self._installed: dict | None = None  # what install saw, for the trial's context

    @staticmethod
    @override
    def name() -> str:
        # Harbor tells the arms apart by this name alone. Inherited, it would put this arm in the control's bucket.
        return "akm-opencode"

    @override
    def version(self) -> str | None:
        return f"{super().version() or 'unknown'}+{self._plugin_name}"

    @override
    async def exec_as_agent(self, environment, command, env=None, cwd=None, timeout_sec=None):
        # The arm's settings, then the job's `akm_env` over them, then the caller's env, which wins, so the model key and
        # the XDG paths Harbor sets for the run are not overwritten.
        return await super().exec_as_agent(environment, command=command, env={**AKM_ENV, **self.options.akm_env, **(env or {})}, cwd=cwd, timeout_sec=timeout_sec)

    def _record(self, name: str, data: dict) -> None:
        """Leaves `data` as JSON in the trial's agent folder, where run.ts reads it. A folder that cannot be written is only logged."""
        try:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            (self.logs_dir / name).write_text(f"{json.dumps(data, indent=2)}\n")
        except OSError as exc:
            self.logger.debug(f"Could not write {name}: {exc}")

    # -- setup ---------------------------------------------------------------

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)  # Node and the pinned opencode
        owner = shlex.quote(str(environment.default_user or "root"))
        dirs = " ".join(shlex.quote(v) for k, v in AKM_ENV.items() if k.endswith("_DIR"))
        await self.exec_as_root(environment, command=f"install -d -m 0755 {dirs} {CLI_PREFIX} {PLUGIN_PREFIX} {LIBRARIES} {PACKAGES} && chown -R {owner} {AKM_ROOT}")
        if self.options.packages_dir:
            await environment.upload_dir(Path(self.options.packages_dir), PACKAGES)
            await self.exec_as_root(environment, command=f"chown -R {owner} {PACKAGES}")
        for lock, prefix in ((self._akm_lock, CLI_PREFIX), (self._plugin_lock, PLUGIN_PREFIX)):
            if lock:
                await environment.upload_dir(lock, prefix)
                await self.exec_as_root(environment, command=f"chown -R {owner} {prefix}")
        await self.exec_as_agent(environment, command=self._install_akm_command())
        found = await self.exec_as_agent(environment, command=f"{NVM}readlink -f {CLI_BIN}")
        await self.exec_as_root(environment, command=f"ln -sf {shlex.quote(found.stdout.strip().splitlines()[-1])} {AKM_CLI}")
        await self.exec_as_agent(environment, command=self._install_plugin_command())
        # Before the tarballs go: `npm ls` reads a package installed from one against the file it names.
        trees = await self.exec_as_agent(environment, command=self._trees_command())
        await self.exec_as_agent(environment, command=f"rm -rf {PACKAGES}")
        await environment.upload_dir(Path(self.options.libraries_dir), LIBRARIES)
        await self.exec_as_root(environment, command=f"chown -R {owner} {LIBRARIES}")
        seeded = await self.exec_as_agent(environment, command=self._seed_command())
        # Boot opencode once with the real config and model, so the plugin is fetched now, not in the measured run.
        # No provider key is passed, so the model call fails and costs nothing: only the start-up is wanted.
        await self.exec_as_agent(
            environment,
            command=self._warm_command(),
            env={"XDG_DATA_HOME": WARM_DATA, "XDG_STATE_HOME": f"{AKM_ROOT}/opencode-warm-state"},
        )
        checked = await self.exec_as_agent(environment, command=self._check_command())
        locks = {"akm_cli": lock_sha256(self._akm_lock), "plugin": lock_sha256(self._plugin_lock)}
        self._installed = install_record(seeded.stdout or "", checked.stdout or "", {**AKM_ENV, **self.options.akm_env}, trees.stdout or "", locks)
        self._record(INSTALL_FILE, self._installed)

    def _akm_target(self) -> str:
        """What `npm install` puts in as akm-cli when there is no lockfile: the tarball of a checkout, or the release the job names."""
        if self.options.akm_package:
            return f"{PACKAGES}/{self.options.akm_package}"
        return f"akm-cli@{self.options.akm_cli_version}"

    def _install_akm_command(self) -> str:
        # Under a prefix of its own, not `npm i -g`, which ignores a lockfile. With one, `npm ci` installs exactly what it holds.
        if self._akm_lock:
            npm = f"npm ci --prefix {CLI_PREFIX} --no-audit --no-fund"
        else:
            npm = f"npm install --prefix {CLI_PREFIX} --no-audit --no-fund {shlex.quote(self._akm_target())}"
        return f"set -euo pipefail; {NVM}{npm} && {CLI_BIN} --version"

    def _install_plugin_command(self) -> str:
        if self._plugin_lock:
            # opencode installs a plugin's dependencies without their install scripts, and so does this.
            npm = f"npm ci --prefix {PLUGIN_PREFIX} --ignore-scripts --no-audit --no-fund"
        else:
            # Beside the plugin goes the akm-cli tarball, if there is one, so the akm-cli the plugin depends on is the one under
            # test when the versions agree, and not a release from the registry.
            targets = [f"{PACKAGES}/{name}" for name in (self.options.plugin_package, self.options.akm_package) if name] or [self._plugin_name]
            npm = f"npm install --prefix {PLUGIN_PREFIX} --no-audit --no-fund {' '.join(shlex.quote(t) for t in targets)}"
        return f"set -euo pipefail; {NVM}{npm} && test -d {PLUGIN_DIR}"

    def _trees_command(self) -> str:
        """Prints the digest of the dependency tree under each prefix: what `npm ls --all --json` says is installed there."""
        return (
            f"set -euo pipefail; {NVM}"
            # npm ls exits 1 for a tree with a problem, such as an optional package this platform skips, and still prints it.
            'tree(){ local out; out="$(npm ls --all --json --prefix "$1" || true)"; '
            '[ -n "$out" ] || { echo "AKM-SETUP FATAL: npm ls printed nothing for $1" >&2; exit 1; }; printf "%s" "$out" | sha256sum | cut -d" " -f1; }; '
            f'cli="$(tree {CLI_PREFIX})"; plugin="$(tree {PLUGIN_PREFIX})"; '
            'echo "AKM-SETUP tree_akm_cli=$cli tree_plugin=$plugin"'
        )

    def _seed_command(self) -> str:
        # A bundle with the fact templates akm scaffolds, then the library's type folders copied in (never loose files
        # such as a README), then a full index. No registry: the agent searches the library and nothing else. Every
        # asset of the library must be in the index, apart from the scaffold's facts. It prints how many are.
        semantic = self.options.akm_env.get("AKM_EVAL_SEMANTIC_SEARCH") == "1"
        semantic_config = (
            "akm config set semanticSearchMode auto --silent && "
            "akm config set embedding.localModel Xenova/bge-small-en-v1.5 --silent && "
            "akm config set embedding.queryTimeoutMs 600000 --silent && "
        ) if semantic else ""
        index = "akm index --full >/dev/null && "
        if semantic:
            index = (
                f"akm index --full >{AKM_ROOT}/index-result.json && "
                "node -e 'const r=JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"));"
                "if(!Number.isInteger(r.totalEntries)||r.totalEntries<1||r.verification?.embeddingCount!==r.totalEntries){console.error(\"AKM-SETUP FATAL: incomplete semantic index\");process.exit(1)};"
                "console.log(\"AKM-SETUP embeddings=\"+r.verification.embeddingCount)' "
                f"<{AKM_ROOT}/index-result.json && "
                "akm search --limit 1 --format json -- 'service backup configuration healthcheck' | "
                "node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{"
                "if(JSON.parse(s).searchMode!==\"semantic\"){console.error(\"AKM-SETUP FATAL: search is not semantic\");process.exit(1)};"
                "console.log(\"AKM-SETUP search_mode=semantic\")})' && "
            )
        assets = self.options.library_assets
        want = f'"$(find {LIBRARIES}/"$stash" -type f -not -name ".*" | wc -l)"' if assets is None else str(assets)
        return (
            "set -euo pipefail; " + NVM + 'stash="$(printenv AKM_TASK_STASH || true)"; '
            '[[ "$stash" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "AKM-SETUP FATAL: AKM_TASK_STASH=$stash is not a library name" >&2; exit 1; }; '
            f'[ -d {LIBRARIES}/"$stash" ] || {{ echo "AKM-SETUP FATAL: no library named $stash" >&2; exit 1; }}; '
            f"akm bundle create --dir {BUNDLE} --set-default && akm config set registries '[]' && "
            + semantic_config +
            f'for d in {LIBRARIES}/"$stash"/*/; do cp -a "$d" {BUNDLE}/; done; '
            f"want={want}; rm -rf {LIBRARIES}; "
            + index +
            "got=$(akm info --format json -q | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{"
            "const t=JSON.parse(s).indexStats.byType;console.log(Object.entries(t).reduce((n,[k,v])=>n+(k===\"fact\"?0:v),0))})') && "
            '[ "$got" -ge "$want" ] || { echo "AKM-SETUP FATAL: $got of the $want library assets are indexed" >&2; exit 1; }; '
            'echo "AKM-SETUP assets=$got"'
        )

    def _warm_command(self) -> str:
        config = self._build_register_config_command()
        return (
            f"set -euo pipefail; {NVM}{config} && mkdir -p /tmp/akm-warm && cd /tmp/akm-warm && "
            f"timeout 600 opencode --model={shlex.quote(self.model_name or '')} run --format=json "
            "--dangerously-skip-permissions -- warmup >/dev/null 2>&1 || true"
        )

    def _check_command(self) -> str:
        """Fail the setup if akm or the plugin did not come up. What came up is printed, not compared with a version."""
        failed = shlex.quote(PLUGIN_FAILED)
        return (
            f"set -euo pipefail; {NVM}"
            'fail(){ echo "AKM-SETUP FATAL: $*" >&2; exit 1; }; '
            'version="$(akm --version | tr -d "[:space:]")"; [ -n "$version" ] || fail "akm printed no version"; '
            # The akm-cli the plugin carries is the one it runs in process. It may differ from the akm installed here, so it is recorded.
            f'hoisted="$(find {PLUGIN_PREFIX} -path "*/node_modules/akm-cli/package.json" -print -quit)"; '
            '[ -n "$hoisted" ] || fail "the plugin is not installed"; '
            'carried="$(node -p "require(process.argv[1]).version" "$hoisted")"; '
            f"log={WARM_DATA}/opencode/log; "
            f'grep -Fqh {shlex.quote(PLUGIN_ACTIVE)} "$log"/*.log || fail "the plugin did not load in the warm-up session"; '
            f'! grep -Eqh {failed} "$log"/*.log || fail "the plugin logged a failure in the warm-up session"; '
            'echo "akm setup ok"; echo "AKM-SETUP akm=$version plugin_akm_cli=$carried"'
        )

    # -- the proof that the plugin ran ----------------------------------------

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        # The parent first: a trial that is about to be rejected still used tokens, and they belong in its result.
        super().populate_context_post_run(context)
        if self._installed is not None:
            context.metadata = {**(context.metadata or {}), "akm": self._installed}
        if self._proof_checked:  # Harbor calls this again when it recovers the outputs of a failed trial
            return
        self._proof_checked = True
        logs = [p.read_text(errors="replace") for p in sorted((self.logs_dir / RUN_LOG_DIR).glob("*.log"))]
        problem = plugin_log_problem(logs)
        # Before the raise: Harbor keeps only the first exception of a trial, so after an AgentTimeoutError this one is
        # lost. The file is what lets the reader of the trial see it.
        self._record(PLUGIN_STATUS_FILE, {"live": problem is None, "problem": problem})
        if problem:
            raise AkmPluginNotLoadedError(f"not scored, the plugin was not shown to be live in the measured run: {problem}")
