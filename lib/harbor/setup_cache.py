"""Local archives of installed tools only; never a trial's config, index or workspace."""
import asyncio
import re
import tempfile
from pathlib import Path

_LOCKS: dict[str, asyncio.Lock] = {}
REMOTE_ARCHIVE = "/tmp/akm-eval-setup.tgz"


async def runtime_id(environment) -> str | None:
    result = await environment.exec(command="uname -m; cat /etc/os-release; ldd --version 2>&1 || true")
    text = result.stdout or ""
    arch = re.search(r"^(x86_64|aarch64|arm64)$", text, re.M)
    distro = re.search(r'^ID=[\"\']?([^\"\'\n]+)', text, re.M)
    version = re.search(r'^VERSION_ID=[\"\']?([^\"\'\n]+)', text, re.M)
    libc = re.search(r"Version\s+([\d.]+)", text) if "musl" in text.lower() else re.search(r"(?:GLIBC|GNU libc|GNU C Library).*?(\d+\.\d+)", text)
    if not all((arch, distro, version, libc)):
        return None  # An unknown runtime keeps Harbor's normal installer.
    family = "musl" if "musl" in text.lower() else "glibc"
    return re.sub(r"[^A-Za-z0-9._-]", "_", f"{arch[1]}-{distro[1]}-{version[1]}-{family}-{libc[1]}")


class SetupCache:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def path(self, name: str) -> Path:
        return self.root / (re.sub(r"[^A-Za-z0-9._-]", "_", name) + ".tgz")

    def lock(self, name: str) -> asyncio.Lock:
        return _LOCKS.setdefault(str(self.path(name)), asyncio.Lock())

    async def restore(self, name, agent, environment, into, *, root=False) -> bool:
        path = self.path(name)
        if not path.is_file():
            return False
        await environment.upload_file(path, REMOTE_ARCHIVE)
        execute = agent.exec_as_root if root else agent.exec_as_agent
        await execute(environment, command=f"tar -xzf {REMOTE_ARCHIVE} -C {into} && rm -f {REMOTE_ARCHIVE}")
        return True

    async def save(self, name, agent, environment, source, members, *, root=False):
        execute = agent.exec_as_root if root else agent.exec_as_agent
        await execute(environment, command=f"tar -czf {REMOTE_ARCHIVE} -C {source} {members}")
        # Publish only a complete archive, including when other collector processes share this cache.
        with tempfile.TemporaryDirectory(dir=self.root, prefix="prepare-") as temporary:
            target = Path(temporary) / "tools.tgz"
            await environment.download_file(REMOTE_ARCHIVE, target)
            target.replace(self.path(name))
        await execute(environment, command=f"rm -f {REMOTE_ARCHIVE}")

    async def restore_npm(self, agent, environment):
        await self.restore("npm-downloads", agent, environment, '"$HOME"')

    async def save_npm(self, agent, environment):
        # No npmrc, authentication configuration, or command logs enter the cache.
        await agent.exec_as_agent(environment, command='mkdir -p "$HOME/.npm/_cacache" "$HOME/.npm/_prebuilds"')
        await self.save("npm-downloads", agent, environment, '"$HOME"', ".npm/_cacache .npm/_prebuilds")
