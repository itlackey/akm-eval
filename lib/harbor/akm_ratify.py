# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""The model agents of evals/ratification. All three get the same container, the same akm-cli and the same seeded, indexed bundle; the task's
`.plant.sh` has run in each. What differs is only what the agent is given:

- `AkmRatifyCli` (arm `minimal`): opencode with the real akm CLI and no plugin, and nothing else.
- `AkmRatifyCli` with `guide` (arm `guided`): the same, and `akm hints` (the guide akm ships for agents) written to /work/AGENTS.md, which
  opencode reads as the project's instructions.
- `AkmRatifyPlugin` (arm `plugin`): opencode with the akm-opencode plugin, loaded and shown live the way agent-ab's akm arm does it (akm_opencode.py).

The reference and no-op arms of akm_cli.py (`AkmCli`, `script`) validate the tasks and verifiers with no model.
"""

from __future__ import annotations

import shlex
from pathlib import Path
from typing import override

from harbor.environments.base import BaseEnvironment

from akm_cli import AkmCli, AkmCliOptions
from akm_opencode import LIBRARIES, NVM, AkmOpenCode, AkmOpenCodeOptions

AGENTS_FILE = "/work/AGENTS.md"


class AkmRatifyCliOptions(AkmCliOptions):
    # Write the guide akm ships for agents to /work/AGENTS.md after the setup.
    guide: bool = False


class AkmRatifyCli(AkmCli):
    options_model = AkmRatifyCliOptions
    options: AkmRatifyCliOptions

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)
        if self.options.guide:
            # akm's own text, as `akm hints` prints it: no wording of ours.
            await self.exec_as_agent(environment, command=f"set -euo pipefail; {NVM}akm hints > {AGENTS_FILE} && test -s {AGENTS_FILE}")


class AkmRatifyPlugin(AkmOpenCode):
    """AkmOpenCode, with the library's `.plant.sh` run after the seed (as AkmCli does) so every arm starts from the same state."""

    options_model = AkmOpenCodeOptions

    @staticmethod
    @override
    def name() -> str:
        return "akm-opencode"

    def _plant_command(self) -> str:
        return (
            "set -euo pipefail; " + NVM + 'stash="$(printenv AKM_TASK_STASH || true)"; '
            '[[ "$stash" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "AKM-SETUP FATAL: AKM_TASK_STASH=$stash is not a library name" >&2; exit 1; }; '
            f'if [ -f "{LIBRARIES}/$stash/.plant.sh" ]; then bash "{LIBRARIES}/$stash/.plant.sh" >&2; fi; rm -rf {LIBRARIES}'
        )

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await super().install(environment)  # Node, opencode, akm-cli, the plugin, the seed, the warm-up and the plugin check
        owner = shlex.quote(str(environment.default_user or "root"))
        # The seed removed the uploaded library, and the plant script is in it: it goes up once more.
        await environment.upload_dir(Path(self.options.libraries_dir), LIBRARIES)
        await self.exec_as_root(environment, command=f"chown -R {owner} {LIBRARIES}")
        await self.exec_as_agent(environment, command=self._plant_command())
        # akm's launcher finds node on the PATH; the verifier, which does not source nvm, needs it too.
        await self.exec_as_root(environment, command=f'{NVM}ln -sf "$(command -v node)" /usr/local/bin/node')
