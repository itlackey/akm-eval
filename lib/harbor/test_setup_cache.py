"""Setup caches reuse tools without sharing a trial's writable state. No model calls."""
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from harbor.agents.installed.opencode import OpenCode
from eval_opencode import EvalOpenCode
from setup_cache import SetupCache, runtime_id
import eval_opencode
import akm_opencode


class Environment:
    default_user = None

    async def exec(self, command, **kwargs):
        return SimpleNamespace(return_code=0, stdout='x86_64\nID=debian\nVERSION_ID="12"\nldd (Debian GLIBC 2.36-9) 2.36\n', stderr="")

    async def upload_file(self, source_path, target_path):
        pass

    async def download_file(self, source_path, target_path):
        Path(target_path).write_bytes(b"complete archive")


class Agent:
    exec_as_agent = AsyncMock()
    exec_as_root = AsyncMock()


def test_runtime_identity_separates_native_libraries():
    env = Environment()
    assert asyncio.run(runtime_id(env)) == "x86_64-debian-12-glibc-2.36"
    env.exec = AsyncMock(return_value=SimpleNamespace(stdout='x86_64\nID=alpine\nVERSION_ID=3.22\nmusl libc (x86_64)\nVersion 1.2.5\n'))
    assert asyncio.run(runtime_id(env)) == "x86_64-alpine-3.22-musl-1.2.5"
    env.exec = AsyncMock(return_value=SimpleNamespace(stdout="unknown platform"))
    assert asyncio.run(runtime_id(env)) is None


def test_failed_download_never_publishes_a_prepared_install(tmp_path):
    cache = SetupCache(tmp_path)
    env = Environment()
    env.download_file = AsyncMock(side_effect=OSError("copy interrupted"))
    with pytest.raises(OSError):
        asyncio.run(cache.save("tools", Agent(), env, "/tools", "node_modules"))
    assert not cache.path("tools").exists()
    assert list(tmp_path.iterdir()) == []


def test_two_trials_prepare_node_opencode_only_once(tmp_path, monkeypatch):
    async def scenario():
        installed = []
        async def install(agent, environment):
            installed.append(agent)
        monkeypatch.setattr(OpenCode, "install", install)
        monkeypatch.setattr(EvalOpenCode, "ensure_system_dependencies", AsyncMock())
        monkeypatch.setattr(EvalOpenCode, "exec_as_agent", AsyncMock())
        monkeypatch.setattr(SetupCache, "restore_npm", AsyncMock())
        monkeypatch.setattr(SetupCache, "save_npm", AsyncMock())
        agents = [EvalOpenCode(logs_dir=tmp_path / str(i), version="1.18.34", setup_cache_dir=str(tmp_path / "cache")) for i in range(2)]
        await asyncio.gather(*(a.install(Environment()) for a in agents))
        assert len(installed) == 1
        assert len(list((tmp_path / "cache").rglob("node-opencode-1.18.34.tgz"))) == 1
    asyncio.run(scenario())


def test_prepared_akm_is_reused_but_another_build_is_prepared(tmp_path, monkeypatch):
    async def scenario():
        cache = SetupCache(tmp_path / "runtime")
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "_install_dependencies", AsyncMock())
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "_link_cli", AsyncMock())
        monkeypatch.setattr(SetupCache, "restore_npm", AsyncMock())
        monkeypatch.setattr(SetupCache, "save_npm", AsyncMock())
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "exec_as_agent", AsyncMock(return_value=SimpleNamespace(stdout="127\n")))
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "exec_as_root", AsyncMock())
        agents = [akm_opencode.AkmOpenCode(logs_dir=tmp_path / str(i), version="1.18.34", akm_cli_version=v, akm_plugin_version="0.10.261002-beta", libraries_dir="/libraries") for i, v in enumerate(["0.9.32", "0.9.32", "0.10.261005-beta"])]
        for a in agents:
            a._setup_cache = cache
            await a._prepare_dependencies(Environment())
        assert akm_opencode.AkmOpenCode._install_dependencies.await_count == 2
        assert akm_opencode.AkmOpenCode._link_cli.await_count == 1
        assert len(list(cache.root.glob("akm--*.tgz"))) == 2
    asyncio.run(scenario())


def test_checkout_builds_keep_separate_prepared_dependencies(tmp_path, monkeypatch):
    async def scenario():
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "_install_dependencies", AsyncMock())
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "_link_cli", AsyncMock())
        monkeypatch.setattr(SetupCache, "restore_npm", AsyncMock())
        monkeypatch.setattr(SetupCache, "save_npm", AsyncMock())
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "exec_as_agent", AsyncMock(return_value=SimpleNamespace(stdout="127\n")))
        monkeypatch.setattr(akm_opencode.AkmOpenCode, "exec_as_root", AsyncMock())
        for build in ["build-a", "build-a", "build-b"]:
            packages = tmp_path / build / "akm-packages"
            packages.mkdir(parents=True, exist_ok=True)
            agent = akm_opencode.AkmOpenCode(logs_dir=tmp_path / "logs", version="1.18.34", akm_cli_version="0.9.32", akm_plugin_version="0.10.261002-beta", libraries_dir="/libraries", packages_dir=str(packages), akm_package="akm-cli.tgz")
            agent._setup_cache = SetupCache(tmp_path / "runtime")
            await agent._prepare_dependencies(Environment())
            assert list(packages.iterdir()) == []  # Future uploads contain tarballs, not prepared archives.
        assert akm_opencode.AkmOpenCode._install_dependencies.await_count == 2
        assert akm_opencode.AkmOpenCode._link_cli.await_count == 1
    asyncio.run(scenario())


@pytest.mark.parametrize("import_path,extra", [
    ("eval_opencode:EvalOpenCode", {}),
    ("akm_opencode:AkmOpenCode", {"akm_cli_version": "0.9.32", "akm_plugin_version": "0.10.261002-beta", "libraries_dir": "/libraries"}),
])
def test_harbor_preflight_and_factory_accept_the_cache_option(tmp_path, import_path, extra):
    from harbor.agents.factory import AgentFactory
    from harbor.models.trial.config import AgentConfig
    cache = str(tmp_path / "cache")
    config = AgentConfig(import_path=import_path, kwargs={"version": "1.18.34", "setup_cache_dir": cache, **extra})
    AgentFactory.run_preflight(config)
    agent = AgentFactory.create_agent_from_config(config, logs_dir=tmp_path / "logs")
    assert agent._setup_cache_dir == Path(cache)
    assert agent.options.setup_cache_dir == cache
