# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Tests for the akm arm. No Docker and no network. Run them with the Harbor release the eval pins:

    PYTHONPATH=evals/agent-ab/agent uv run --no-project --python 3.12 --with harbor==0.24.0 --with pytest \
        pytest evals/agent-ab/agent
"""

import asyncio
import subprocess
from types import SimpleNamespace

import pytest
from harbor.models.agent.context import AgentContext

import akm_opencode as m

CONFIG = {"$schema": "https://opencode.ai/config.json", "autoupdate": False}


def make(tmp_path):
    return m.AkmOpenCode(
        logs_dir=tmp_path,
        model_name="openai/gpt-6-luna",
        version="1.18.34",
        akm_cli_version="0.9.26",
        akm_plugin_version="0.9.26202610051302",
        libraries_dir="/libraries",
        opencode_config=dict(CONFIG),
    )


def test_the_arm_has_its_own_name_and_says_which_plugin(tmp_path):
    agent = make(tmp_path)
    assert agent.name() == "akm-opencode"
    assert agent.to_agent_info().name == "akm-opencode"
    assert agent.version().endswith("+akm-opencode@0.9.26202610051302")


def test_the_plugin_is_the_only_thing_added_to_the_config(tmp_path):
    agent = make(tmp_path)
    assert agent._opencode_config == {**CONFIG, "plugin": ["akm-opencode@0.9.26202610051302"]}
    assert CONFIG == {"$schema": "https://opencode.ai/config.json", "autoupdate": False}


def test_a_missing_option_is_an_error(tmp_path):
    with pytest.raises(ValueError, match="akm_plugin_version"):
        m.AkmOpenCode(logs_dir=tmp_path, model_name="openai/x", akm_cli_version="0.9.26", libraries_dir="/l")


def test_the_five_directories_move_together():
    dirs = {k: v for k, v in m.AKM_ENV.items() if k.endswith("_DIR")}
    assert set(dirs) == {"AKM_BUNDLE_DIR", "AKM_CONFIG_DIR", "AKM_DATA_DIR", "AKM_CACHE_DIR", "AKM_STATE_DIR"}
    assert all(v.startswith(m.AKM_ROOT + "/") and not v.startswith("/tmp") for v in dirs.values())
    assert m.AKM_ENV["AKM_OPENCODE_CLI"] == m.AKM_CLI


class FakeEnvironment:
    default_user = None

    def __init__(self):
        self.calls = []

    async def exec(self, command, user=None, env=None, cwd=None, timeout_sec=None):
        self.calls.append({"command": command, "env": env})
        return SimpleNamespace(return_code=0, stdout="", stderr="")


def test_every_command_gets_the_akm_settings_and_the_callers_env_wins(tmp_path):
    agent = make(tmp_path)
    env = FakeEnvironment()
    asyncio.run(agent.exec_as_agent(env, command="true", env={"XDG_DATA_HOME": "/logs", "AKM_CURATE_TIMEOUT": "99"}))
    sent = env.calls[0]["env"]
    assert sent["AKM_BUNDLE_DIR"] == m.BUNDLE
    assert sent["XDG_DATA_HOME"] == "/logs"
    assert sent["AKM_CURATE_TIMEOUT"] == "99"
    asyncio.run(agent.exec_as_agent(env, command="true"))
    assert env.calls[1]["env"]["AKM_CURATE_TIMEOUT"] == "15"


def test_the_shell_commands_are_valid_bash(tmp_path):
    agent = make(tmp_path)
    for command in (agent._install_akm_command(), agent._seed_command(), agent._warm_command(), agent._check_command()):
        done = subprocess.run(["bash", "-n", "-c", command], capture_output=True, text=True)
        assert done.returncode == 0, done.stderr


def test_the_warm_up_boots_opencode_with_the_plugin_in_the_config(tmp_path):
    command = make(tmp_path)._warm_command()
    assert '"akm-opencode@0.9.26202610051302"' in command
    assert "--model=openai/gpt-6-luna" in command


def test_the_failure_pattern_reads_the_same_in_grep_and_in_python():
    failed = [
        "AKM synchronous helper failed",
        "AKM command resolution failed",
        "AKM chat.message hook failed",
        "AKM experimental.chat.system.transform hook failed",
    ]
    fine = ["AKM user feedback recorded", "AKM background curate failed"]
    for line in failed:
        assert subprocess.run(["grep", "-Eq", m.PLUGIN_FAILED], input=line, text=True).returncode == 0
        assert m.plugin_log_problem([f"{m.PLUGIN_ACTIVE}\n{line}"])
    for line in fine:
        assert subprocess.run(["grep", "-Eq", m.PLUGIN_FAILED], input=line, text=True).returncode == 1


def test_a_live_plugin_is_accepted_and_the_other_cases_are_named():
    assert m.plugin_log_problem([f"level=INFO message={m.PLUGIN_ACTIVE!r} text=hi"]) is None
    assert "no opencode log" in m.plugin_log_problem([])
    assert "never logged" in m.plugin_log_problem(["level=INFO message=started"])
    assert "AKM synchronous helper failed" in m.plugin_log_problem([f"{m.PLUGIN_ACTIVE}", "level=WARN message=AKM synchronous helper failed"])


def write_log(tmp_path, text):
    log = tmp_path / m.RUN_LOG_DIR
    log.mkdir(parents=True)
    (log / "opencode.log").write_text(text)


def test_a_trial_whose_plugin_was_not_shown_to_be_live_is_not_scored(tmp_path):
    agent = make(tmp_path)
    write_log(tmp_path, "level=INFO message=started\n")
    with pytest.raises(m.AkmPluginNotLoadedError, match="never logged"):
        agent.populate_context_post_run(AgentContext())
    agent.populate_context_post_run(AgentContext())  # Harbor calls it again when it recovers a failed trial: no second raise


def test_a_trial_with_no_log_is_not_scored(tmp_path):
    with pytest.raises(m.AkmPluginNotLoadedError, match="no opencode log"):
        make(tmp_path).populate_context_post_run(AgentContext())


def test_a_trial_with_a_live_plugin_is_scored(tmp_path):
    write_log(tmp_path, f"level=INFO message={m.PLUGIN_ACTIVE!r}\n")
    make(tmp_path).populate_context_post_run(AgentContext())
