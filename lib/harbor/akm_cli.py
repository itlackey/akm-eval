# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""The agents of evals/cli-ratification: opencode with the real akm CLI and no plugin, and two agents that call no model.

`AkmCli` is `AkmOpenCode` (akm_opencode.py) without the plugin: the same Harbor setup, the same akm-cli install and the same seeded,
indexed bundle, and nothing else. There is no plugin in opencode's config, so nothing is injected at session start and no tool is
added; no warm-up session runs and no plugin check follows the run. The only thing between the agent and akm is the shell it
already has. The prompt is Harbor's own `prompt_template_path` (a Jinja file with `{{ instruction }}`), set by the arm.

What a library may hold besides its asset folders, as hidden files in its root (the seed skips them and counts none of them as assets):

- `.plant.sh` runs once after the seed, as the agent's user, with the arm's AKM_* settings: it plants the fault a task is about
  (a stale index, a bad config, a workflow stopped half-way).
- `.solve.sh` is the informed reference's recipe. It is copied to `SOLVE` only when `script` is `reference`; no other arm ever has it.

`script` makes the agent call no model: `reference` runs the recipe, `noop` does nothing. They exist to check a task and its verifier
before any model runs: the reference must pass, the no-op must fail. They are in the same container, with the same install, as the
arms that call a model.
"""

from __future__ import annotations

import re
import shlex
from pathlib import Path
from typing import Literal, override

from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext
from pydantic import field_validator

import akm_opencode as base
from akm_opencode import AKM_ENV, AKM_ROOT, CLI_PREFIX, INSTALL_FILE, LIBRARIES, NVM, PACKAGES, PLUGIN_PREFIX, AkmOpenCode, AkmOpenCodeOptions
from eval_opencode import EvalOpenCode

SOLVE = f"{AKM_ROOT}/solve.sh"
# The settings the CLI arm runs with: the five directories, and background learning off. The plugin's own settings are not set.
CLI_ENV = {k: v for k, v in AKM_ENV.items() if k.endswith("_DIR") or k.startswith("AKM_AUTO_") or k == "AKM_INDEX_ON_SESSION_END"}
SETUP_PLANTED = "AKM-SETUP planted="


class AkmCliOptions(AkmOpenCodeOptions):
    # There is no plugin; the field is only here because the parent requires it, and the cache name carries it.
    akm_plugin_version: str = "none"
    script: Literal["reference", "noop"] | None = None

    @field_validator("akm_plugin_version")
    @classmethod
    def _no_plugin(cls, version: str) -> str:
        if version != "none":
            raise ValueError("the CLI arm installs no plugin")
        return version


def cli_install_record(seeded: str, checked: str, planted: str, env: dict[str, str], tree: str, lockfile: str | None) -> dict:
    """What the setup printed, as the record kept with the trial. Like akm_opencode.install_record, with no plugin."""
    version = re.search(r"^AKM-SETUP akm=(\S*)$", checked, re.MULTILINE)
    assets = re.search(r"^AKM-SETUP assets=(\d+)$", seeded, re.MULTILINE)
    found = re.search(r"^AKM-SETUP tree_akm_cli=([0-9a-f]{64})$", tree, re.MULTILINE)
    plant = re.search(rf"^{SETUP_PLANTED}(yes|no)$", planted, re.MULTILINE)
    return {
        "akm_version": version.group(1) if version else None,
        "plugin": None,
        "assets_indexed": int(assets.group(1)) if assets else None,
        "planted": plant.group(1) == "yes" if plant else None,
        "env": dict(env),
        "lockfiles": {"akm_cli": lockfile, "plugin": None},
        "dependency_trees": {"akm_cli": found.group(1)} if found else None,
        "dependency_tree_sha256": base.tree_sha256({"akm_cli": found.group(1)}) if found else None,
    }


class AkmCli(AkmOpenCode):
    options_model = AkmCliOptions
    options: AkmCliOptions

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._plugin_lock = None
        self._opencode_config = {k: v for k, v in self._opencode_config.items() if k != "plugin"}

    @staticmethod
    @override
    def name() -> str:
        return "akm-cli"

    @override
    def version(self) -> str | None:
        return f"{super(AkmOpenCode, self).version() or 'unknown'}+akm-cli@{self.options.akm_cli_version}"

    @override
    async def exec_as_agent(self, environment, command, env=None, cwd=None, timeout_sec=None):
        # The arm's settings, then the job's `akm_env`, then the caller's env, which wins.
        return await super(AkmOpenCode, self).exec_as_agent(environment, command=command, env={**CLI_ENV, **self.options.akm_env, **(env or {})}, cwd=cwd, timeout_sec=timeout_sec)

    # -- setup ---------------------------------------------------------------

    @override
    async def _install_dependencies(self, environment):
        if self._akm_lock:
            await environment.upload_dir(self._akm_lock, CLI_PREFIX)
            await self.exec_as_root(environment, command=f"chown -R {shlex.quote(str(environment.default_user or 'root'))} {CLI_PREFIX}")
        await self.exec_as_agent(environment, command=self._install_akm_command())
        await self._link_cli(environment)

    def _tree_command(self) -> str:
        """Prints the digest of the dependency tree under the akm-cli prefix: what `npm ls --all --json` says is installed there."""
        return (
            f"set -euo pipefail; {NVM}"
            # npm ls exits 1 for a tree with a problem, such as an optional package this platform skips, and still prints it.
            f'out="$(npm ls --all --json --prefix {CLI_PREFIX} || true)"; '
            '[ -n "$out" ] || { echo "AKM-SETUP FATAL: npm ls printed nothing" >&2; exit 1; }; '
            'echo "AKM-SETUP tree_akm_cli=$(printf "%s" "$out" | sha256sum | cut -d" " -f1)"'
        )

    def _plant_command(self) -> str:
        """Runs the library's `.plant.sh`, and copies `.solve.sh` where the reference finds it, when this agent is the reference. Then the library is removed."""
        keep = f'if [ -f "{LIBRARIES}/$stash/.solve.sh" ]; then install -m 0755 "{LIBRARIES}/$stash/.solve.sh" {SOLVE}; fi; ' if self.options.script == "reference" else ""
        return (
            "set -euo pipefail; " + NVM + 'stash="$(printenv AKM_TASK_STASH || true)"; '
            '[[ "$stash" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "AKM-SETUP FATAL: AKM_TASK_STASH=$stash is not a library name" >&2; exit 1; }; '
            f'planted=no; if [ -f "{LIBRARIES}/$stash/.plant.sh" ]; then bash "{LIBRARIES}/$stash/.plant.sh" >&2; planted=yes; fi; '
            + keep + f'rm -rf {LIBRARIES}; echo "{SETUP_PLANTED}$planted"'
        )

    def _check_command(self) -> str:
        return f'set -euo pipefail; {NVM}version="$(akm --version | tr -d "[:space:]")"; [ -n "$version" ] || {{ echo "AKM-SETUP FATAL: akm printed no version" >&2; exit 1; }}; echo "AKM-SETUP akm=$version"'

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await EvalOpenCode.install(self, environment)  # Node and the pinned opencode
        owner = shlex.quote(str(environment.default_user or "root"))
        dirs = " ".join(shlex.quote(v) for k, v in CLI_ENV.items() if k.endswith("_DIR"))
        await self.exec_as_root(environment, command=f"install -d -m 0755 {dirs} {CLI_PREFIX} {PLUGIN_PREFIX} {LIBRARIES} {PACKAGES} && chown -R {owner} {AKM_ROOT}")
        if self.options.packages_dir:
            await environment.upload_dir(Path(self.options.packages_dir), PACKAGES)
            await self.exec_as_root(environment, command=f"chown -R {owner} {PACKAGES}")
        await self._prepare_dependencies(environment)
        tree = await self.exec_as_agent(environment, command=self._tree_command())  # before the tarballs go
        await self.exec_as_agent(environment, command=f"rm -rf {PACKAGES}")
        await environment.upload_dir(Path(self.options.libraries_dir), LIBRARIES)
        await self.exec_as_root(environment, command=f"chown -R {owner} {LIBRARIES}")
        semantic_files = await self._restore_semantic_files(environment)
        seeded = await self.exec_as_agent(environment, command=self._seed_command())  # removes LIBRARIES
        if semantic_files:
            await self._save_semantic_files(environment, semantic_files)
        # The seed removed the upload; the plant script and the reference's recipe are in it, so it goes up once more.
        await environment.upload_dir(Path(self.options.libraries_dir), LIBRARIES)
        await self.exec_as_root(environment, command=f"chown -R {owner} {LIBRARIES}")
        planted = await self.exec_as_agent(environment, command=self._plant_command())
        # akm's launcher finds node on the PATH; a later command, such as the verifier's, does not source nvm.
        await self.exec_as_root(environment, command=f'{NVM}ln -sf "$(command -v node)" /usr/local/bin/node')
        checked = await self.exec_as_agent(environment, command=self._check_command())
        self._installed = cli_install_record(seeded.stdout or "", checked.stdout or "", planted.stdout or "", {**CLI_ENV, **self.options.akm_env}, tree.stdout or "", base.lock_sha256(self._akm_lock))
        if semantic_files:
            self._installed["semantic_files"] = semantic_files[1]
        self._record(INSTALL_FILE, self._installed)

    # -- the run ---------------------------------------------------------------

    @override
    async def run(self, instruction, environment, context) -> None:
        if self.options.script is None:
            await super(AkmOpenCode, self).run(instruction, environment, context)
            return
        self._instruction = instruction
        if self.options.script == "reference":
            await self.exec_as_agent(environment, command=f"{NVM}bash {SOLVE}")

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        # No plugin, so no proof of one: the parent's check is the plugin's.
        super(AkmOpenCode, self).populate_context_post_run(context)
        if self._installed is not None:
            context.metadata = {**(context.metadata or {}), "akm": self._installed}
