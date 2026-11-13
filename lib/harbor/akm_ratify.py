# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""The model agents of evals/ratification. All three get the same container, the same akm-cli and the same seeded, indexed bundle; the task's
`.plant.sh` has run in each. What differs is only what the agent is given:

- `AkmRatifyCli` (arm `minimal`): opencode with the real akm CLI and no plugin, and nothing else.
- `AkmRatifyCli` with `guide` (arm `guided`): the same, and `akm hints` (the guide akm ships for agents) written to /work/AGENTS.md, which
  opencode reads as the project's instructions.
- arm `plugin`: agent-ab's `AkmOpenCode` itself (akm_opencode.py), opencode with the akm-opencode plugin loaded and shown live. It runs the task's `.plant.sh` as the CLI arms do.

The reference and no-op arms of akm_cli.py (`AkmCli`, `script`) validate the tasks and verifiers with no model.
"""

from __future__ import annotations

from typing import override

from harbor.environments.base import BaseEnvironment

from akm_cli import AkmCli, AkmCliOptions
from akm_opencode import NVM

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
