"""Shared OpenCode setup for both benchmark arms; no AKM plugin or configuration."""
import shlex
from pathlib import Path
from typing import override
from setup_cache import SetupCache, runtime_id
from harbor.agents.installed.opencode import OpenCode
from harbor.environments.base import BaseEnvironment

class EvalOpenCode(OpenCode):
    """Use Harbor's nvm Node on glibc; only musl needs distro Node packages."""

    def __init__(self, *args, setup_cache_dir: str | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self._setup_cache_dir = Path(setup_cache_dir) if setup_cache_dir else None
        self._setup_cache = None

    @override
    async def exec_as_root(self, environment, command, **kwargs):
        if self._setup_cache_dir:
            command = command.replace("apk add --no-cache ", "mkdir -p /var/cache/apk && apk --cache-dir /var/cache/apk add ")
        return await super().exec_as_root(environment, command=command, **kwargs)

    @override
    async def install(self, environment):
        runtime = await runtime_id(environment) if self._setup_cache_dir else None
        if runtime is None or not self._version:
            await super().install(environment)
            return
        cache = self._setup_cache = SetupCache(self._setup_cache_dir / runtime)
        name = f"node-opencode-{self._version}"
        musl = "-musl-" in runtime
        async with cache.lock(name):
            if musl:
                await cache.restore("apk-downloads", self, environment, "/", root=True)
            if cache.path(name).is_file():
                dependencies = ("curl", "bash", "coreutils", "nodejs", "npm") if musl else ("curl", "bash", "coreutils")
                await self.ensure_system_dependencies(environment, dependencies)
                await cache.restore(name, self, environment, "/" if musl else '"$HOME"', root=musl)
            else:
                await cache.restore_npm(self, environment)
                await super().install(environment)
                if musl:
                    prefix = await self.exec_as_agent(environment, command="npm prefix -g")
                    folder = prefix.stdout.strip().lstrip("/")
                    members = " ".join(shlex.quote(folder + part) for part in ["/lib/node_modules/opencode-ai", "/bin/opencode"])
                    await cache.save(name, self, environment, "/", members, root=True)
                else:
                    await cache.save(name, self, environment, '"$HOME"', ".nvm")
                await cache.save_npm(self, environment)
            if musl:
                await self.exec_as_root(environment, command="mkdir -p /var/cache/apk")
                await cache.save("apk-downloads", self, environment, "/", "var/cache/apk", root=True)
            await self.exec_as_agent(environment, command='[ -f ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh; node --version && opencode --version')

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
