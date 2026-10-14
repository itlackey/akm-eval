"""Shared OpenCode setup for both benchmark arms; no AKM plugin or configuration."""
from typing import override
from harbor.agents.installed.opencode import OpenCode
from harbor.environments.base import BaseEnvironment

class EvalOpenCode(OpenCode):
    """Use Harbor's nvm Node on glibc; only musl needs distro Node packages."""

    @override
    async def ensure_system_dependencies(self, environment: BaseEnvironment, dependencies: tuple[str, ...]) -> None:
        musl = await environment.exec(command="test -f /etc/alpine-release || ldd --version 2>&1 | grep -qi musl")
        if musl.return_code != 0:
            dependencies = tuple(p for p in dependencies if p not in ("nodejs", "npm"))
            # Debian #1147093: the live Bullseye security index references removed packages.
            # Only these frozen task images use the archive; apt still verifies signatures.
            await self.exec_as_root(environment, command=(
                'if [ -r /etc/os-release ] && . /etc/os-release && [ "${VERSION_CODENAME:-}" = bullseye ]; then '
                'for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do '
                '[ -f "$source" ] || continue; '
                "sed -i 's@deb.debian.org/debian-security@archive.debian.org/debian-security@g;"
                "s@security.debian.org/debian-security@archive.debian.org/debian-security@g' \"$source\"; done; fi"
            ))
        await super().ensure_system_dependencies(environment, dependencies)
