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
3. The AKM_* settings, on every command the agent runs.
4. A check after the run that the plugin was live. Without it a trial where the plugin failed to load scores like a
   trial where the model chose not to call akm, and the treatment arm quietly becomes a second control arm. Such a
   trial is an error, not a score.

The versions come from the job config (`run.ts` writes it): opencode as Harbor's own `version` option, the plugin and
akm-cli as `akm_plugin_version` and `akm_cli_version`. The plugin depends on that exact akm-cli.
"""

from __future__ import annotations

import re
import shlex
from pathlib import Path
from typing import override

from harbor.agents.installed.opencode import OpenCode, OpenCodeOptions
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

# akm lives under /opt, not /tmp: akm treats a bundle under /tmp as transient and moves its config.
AKM_ROOT = "/opt/akm"
BUNDLE = f"{AKM_ROOT}/bundle"
LIBRARIES = f"{AKM_ROOT}/libraries"  # uploaded for the seed, removed after it
WARM_DATA = f"{AKM_ROOT}/opencode-warm"  # the warm-up session's XDG_DATA_HOME, so its log is at a known path

# The akm the plugin shells out to. Without this it runs the akm-cli it carries, which opencode installs without
# install scripts, so on Node that copy has no SQLite binding and every command it runs fails. It is a link to the
# akm-cli installed here, which is also the `akm` the agent's own shell finds.
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

# The plugin writes one of these to opencode's log for every user message, so one is proof it loaded in that session.
PLUGIN_ACTIVE = "AKM user feedback recorded"
# And these when a hook or a helper command fails. The plugin logs them and carries on, so the exit status stays 0.
PLUGIN_FAILED = r"AKM (synchronous helper failed|command resolution failed|[^ ]+ hook failed)"  # grep -E and re both read it
# opencode's log directory under a trial's agent logs: XDG_DATA_HOME is /logs/agent/opencode/xdg-data in the run.
RUN_LOG_DIR = "opencode/xdg-data/opencode/log"

NVM = "[ -f ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh; "


class AkmOpenCodeOptions(OpenCodeOptions):
    akm_cli_version: str
    akm_plugin_version: str
    libraries_dir: str  # one folder per library, each laid out as an akm bundle
    # How many assets akm indexes in the library. Without it, one for every file in it, which holds when each file is an asset.
    library_assets: int | None = None


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


class AkmOpenCode(OpenCode):
    options_model = AkmOpenCodeOptions
    options: AkmOpenCodeOptions

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._plugin = f"akm-opencode@{self.options.akm_plugin_version}"
        # The plugin is the only config the two arms differ in. The rest of the config comes from the job.
        self._opencode_config = {**self._opencode_config, "plugin": [self._plugin]}
        self._proof_checked = False

    @staticmethod
    @override
    def name() -> str:
        # Harbor tells the arms apart by this name alone. Inherited, it would put this arm in the control's bucket.
        return "akm-opencode"

    @override
    def version(self) -> str | None:
        return f"{super().version() or 'unknown'}+{self._plugin}"

    @override
    async def exec_as_agent(self, environment, command, env=None, cwd=None, timeout_sec=None):
        # The caller's env wins, so the model key and the XDG paths Harbor sets for the run are not overwritten.
        return await super().exec_as_agent(environment, command=command, env={**AKM_ENV, **(env or {})}, cwd=cwd, timeout_sec=timeout_sec)

    # -- setup ---------------------------------------------------------------

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)  # Node and the pinned opencode
        owner = shlex.quote(str(environment.default_user or "root"))
        dirs = " ".join(shlex.quote(v) for k, v in AKM_ENV.items() if k.endswith("_DIR"))
        await self.exec_as_root(environment, command=f"install -d -m 0755 {dirs} {LIBRARIES} && chown -R {owner} {AKM_ROOT}")
        await self.exec_as_agent(environment, command=self._install_akm_command())
        found = await self.exec_as_agent(environment, command=f'{NVM}readlink -f "$(command -v akm)"')
        await self.exec_as_root(environment, command=f"ln -sf {shlex.quote(found.stdout.strip().splitlines()[-1])} {AKM_CLI}")
        await environment.upload_dir(Path(self.options.libraries_dir), LIBRARIES)
        await self.exec_as_root(environment, command=f"chown -R {owner} {LIBRARIES}")
        await self.exec_as_agent(environment, command=self._seed_command())
        # Boot opencode once with the real config and model, so the plugin is fetched now, not in the measured run.
        # No provider key is passed, so the model call fails and costs nothing: only the start-up is wanted.
        await self.exec_as_agent(
            environment,
            command=self._warm_command(),
            env={"XDG_DATA_HOME": WARM_DATA, "XDG_STATE_HOME": f"{AKM_ROOT}/opencode-warm-state"},
        )
        await self.exec_as_agent(environment, command=self._check_command())

    def _install_akm_command(self) -> str:
        return f"set -euo pipefail; {NVM}npm i -g akm-cli@{shlex.quote(self.options.akm_cli_version)} && akm --version"

    def _seed_command(self) -> str:
        # A bundle with the fact templates akm scaffolds, then the library's type folders copied in (never loose files
        # such as a README), then a full index. No registry: the agent searches the library and nothing else. Every
        # asset of the library must be in the index, apart from the scaffold's facts.
        assets = self.options.library_assets
        want = f'"$(find {LIBRARIES}/"$stash" -type f -not -name ".*" | wc -l)"' if assets is None else str(assets)
        return (
            "set -euo pipefail; " + NVM + 'stash="$(printenv AKM_TASK_STASH || true)"; '
            '[[ "$stash" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "AKM-SETUP FATAL: AKM_TASK_STASH=$stash is not a library name" >&2; exit 1; }; '
            f'[ -d {LIBRARIES}/"$stash" ] || {{ echo "AKM-SETUP FATAL: no library named $stash" >&2; exit 1; }}; '
            f"akm bundle create --dir {BUNDLE} --set-default && akm config set registries '[]' && "
            f'for d in {LIBRARIES}/"$stash"/*/; do cp -a "$d" {BUNDLE}/; done; '
            f"want={want}; rm -rf {LIBRARIES}; "
            "akm index --full >/dev/null && "
            "got=$(akm info --format json -q | node -e 'let s=\"\";process.stdin.on(\"data\",d=>s+=d).on(\"end\",()=>{"
            "const t=JSON.parse(s).indexStats.byType;console.log(Object.entries(t).reduce((n,[k,v])=>n+(k===\"fact\"?0:v),0))})') && "
            '[ "$got" -ge "$want" ] || { echo "AKM-SETUP FATAL: $got of the $want library assets are indexed" >&2; exit 1; }'
        )

    def _warm_command(self) -> str:
        config = self._build_register_config_command()
        return (
            f"set -euo pipefail; {NVM}{config} && mkdir -p /tmp/akm-warm && cd /tmp/akm-warm && "
            f"timeout 600 opencode --model={shlex.quote(self.model_name or '')} run --format=json "
            "--dangerously-skip-permissions -- warmup >/dev/null 2>&1 || true"
        )

    def _check_command(self) -> str:
        """Fail the setup if akm or the plugin did not come up as pinned."""
        cli = shlex.quote(self.options.akm_cli_version)
        failed = shlex.quote(PLUGIN_FAILED)
        return (
            f"set -euo pipefail; {NVM}"
            'fail(){ echo "AKM-SETUP FATAL: $*" >&2; exit 1; }; '
            f'[ "$(akm --version | tr -d "[:space:]")" = {cli} ] || fail "akm is not {self.options.akm_cli_version}"; '
            # The akm-cli the plugin carries is the one it runs in process. It must be the pinned one too.
            'hoisted="$(find "$HOME/.cache/opencode" -path "*/node_modules/akm-cli/package.json" -print -quit)"; '
            '[ -n "$hoisted" ] || fail "the plugin is not in the opencode cache"; '
            f'[ "$(node -p "require(process.argv[1]).version" "$hoisted")" = {cli} ] || fail "the plugin carries another akm-cli: $hoisted"; '
            f"log={WARM_DATA}/opencode/log; "
            f'grep -Fqh {shlex.quote(PLUGIN_ACTIVE)} "$log"/*.log || fail "the plugin did not load in the warm-up session"; '
            f'! grep -Eqh {failed} "$log"/*.log || fail "the plugin logged a failure in the warm-up session"; '
            'echo "akm setup ok"'
        )

    # -- the proof that the plugin ran ----------------------------------------

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        # The parent first: a trial that is about to be rejected still used tokens, and they belong in its result.
        super().populate_context_post_run(context)
        if self._proof_checked:  # Harbor calls this again when it recovers the outputs of a failed trial
            return
        self._proof_checked = True
        logs = [p.read_text(errors="replace") for p in sorted((self.logs_dir / RUN_LOG_DIR).glob("*.log"))]
        if problem := plugin_log_problem(logs):
            raise AkmPluginNotLoadedError(f"not scored, the plugin was not shown to be live in the measured run: {problem}")
