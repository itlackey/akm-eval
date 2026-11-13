# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Tests for the CLI arm of evals/cli-ratification. No Docker and no network. See test_akm_opencode.py for how to run them."""

import asyncio
import json
import subprocess

import pytest
from harbor.agents.installed.opencode import OpenCode
from harbor.models.agent.context import AgentContext

import akm_cli as c
import akm_opencode as m
from test_akm_opencode import CONFIG, FakeEnvironment, ScriptedEnvironment, no_opencode_install

CLI_TREE = "3" * 64
REPLIES = [
    ("readlink", "/usr/lib/node/bin/akm\n"),
    ("akm bundle create", "AKM-SETUP assets=12\n"),
    ('AKM-SETUP tree_akm_cli=$(', f"AKM-SETUP tree_akm_cli={CLI_TREE}\n"),
    (c.SETUP_PLANTED, f"{c.SETUP_PLANTED}yes\n"),
    ('echo "AKM-SETUP akm=$version"', "AKM-SETUP akm=0.10.261111-beta\n"),
]


def make(tmp_path, **options):
    defaults = dict(
        logs_dir=tmp_path,
        model_name="openai/gpt-6-luna",
        version="1.18.34",
        akm_cli_version="0.10.261111-beta",
        libraries_dir="/libraries",
        opencode_config=dict(CONFIG, plugin=["should-not-survive"]),
        arm="minimal",
    )
    return c.AkmCli(**{**defaults, **options})


def test_there_is_no_plugin_in_the_config_and_the_agent_is_recorded_under_its_arm(tmp_path):
    agent = make(tmp_path)
    assert "plugin" not in agent._opencode_config
    assert agent._opencode_config == CONFIG
    assert agent.name() == "akm-cli" and agent.to_agent_info().name == "akm-cli-minimal"
    assert agent.version().endswith("+akm-cli@0.10.261111-beta") and "akm-opencode" not in agent.version()


def test_a_plugin_version_is_refused(tmp_path):
    with pytest.raises(ValueError, match="installs no plugin"):
        make(tmp_path, akm_plugin_version="0.10.261110-beta")


def test_commands_run_with_the_directories_and_background_learning_off_and_none_of_the_plugins_settings(tmp_path):
    agent = make(tmp_path, akm_env={"AKM_VERBOSE": "1"})
    env = FakeEnvironment()
    asyncio.run(agent.exec_as_agent(env, command="akm --version", env={"AKM_AUTO_LEARNING": "1"}))
    got = env.calls[0]["env"]
    assert got["AKM_BUNDLE_DIR"] == m.BUNDLE and got["AKM_STATE_DIR"] == f"{m.AKM_ROOT}/state"
    assert got["AKM_AUTO_LEARNING"] == "1"  # the caller's env wins
    assert got["AKM_AUTO_FEEDBACK"] == "0" and got["AKM_AUTO_MEMORY"] == "0" and got["AKM_INDEX_ON_SESSION_END"] == "0"
    assert got["AKM_VERBOSE"] == "1"
    assert not {"AKM_OPENCODE_CLI", "AKM_CURATE_TIMEOUT", "AKM_PENDING_PROPOSAL_TIMEOUT"} & set(got)


def test_the_shell_commands_are_valid_bash(tmp_path):
    agent = make(tmp_path, script="reference")
    for command in (agent._tree_command(), agent._plant_command(), agent._check_command(), agent._seed_command()):
        assert subprocess.run(["bash", "-n", "-c", command], capture_output=True, text=True).returncode == 0


def test_only_the_reference_gets_the_recipe_and_every_arm_gets_the_plant_script(tmp_path):
    assert f"install -m 0755 \"{m.LIBRARIES}/$stash/.solve.sh\" {c.SOLVE}" in make(tmp_path, script="reference")._plant_command()
    for script in (None, "noop"):
        plant = make(tmp_path, script=script)._plant_command()
        assert ".solve.sh" not in plant and c.SOLVE not in plant
        assert f'bash "{m.LIBRARIES}/$stash/.plant.sh"' in plant and f"rm -rf {m.LIBRARIES}" in plant


def test_the_install_has_no_plugin_and_no_warm_up_and_the_library_is_uploaded_once_for_the_seed_and_the_plant_script(tmp_path, monkeypatch):
    no_opencode_install(monkeypatch)
    agent = make(tmp_path, akm_env={"AKM_VERBOSE": "1"})
    env = ScriptedEnvironment(REPLIES)
    asyncio.run(agent.install(env))
    commands = [call["command"] for call in env.calls]
    joined = "\n".join(commands)
    assert "opencode --model" not in joined and "warmup" not in joined  # no warm-up session
    assert "akm-opencode" not in joined and "npm install --prefix " + m.PLUGIN_PREFIX not in joined and "npm ci --prefix " + m.PLUGIN_PREFIX not in joined
    assert [u[1] for u in env.uploads] == [m.LIBRARIES]
    at = lambda text: next(i for i, cmd in enumerate(commands) if text in cmd)
    assert at(f"npm install --prefix {m.CLI_PREFIX}") < at("npm ls") < at(f"rm -rf {m.PACKAGES}") < at("akm bundle create") < at(c.SETUP_PLANTED)
    assert at(c.SETUP_PLANTED) < at("/usr/local/bin/node") < at('echo "AKM-SETUP akm=$version"')
    record = json.loads((tmp_path / m.INSTALL_FILE).read_text())
    assert record["akm_version"] == "0.10.261111-beta" and record["plugin"] is None and record["assets_indexed"] == 12 and record["planted"] is True
    assert record["dependency_trees"] == {"akm_cli": CLI_TREE}
    assert record["dependency_tree_sha256"] == m.tree_sha256({"akm_cli": CLI_TREE})
    assert record["lockfiles"] == {"akm_cli": None, "plugin": None}
    assert record["env"]["AKM_VERBOSE"] == "1" and "AKM_OPENCODE_CLI" not in record["env"]


def test_after_the_run_there_is_no_plugin_to_prove(tmp_path):
    agent = make(tmp_path)
    agent._installed = {"akm_version": "x"}
    context = AgentContext()
    agent.populate_context_post_run(context)  # no log, no plugin: nothing is raised
    assert context.metadata == {"akm": {"akm_version": "x"}}
    assert not (tmp_path / m.PLUGIN_STATUS_FILE).exists()


def test_the_scripted_agents_call_no_model(tmp_path, monkeypatch):
    called = []

    async def model_run(self, instruction, environment, context):
        called.append(instruction)

    monkeypatch.setattr(OpenCode, "run", model_run)
    for script, expect in (("noop", 0), ("reference", 1), (None, None)):
        agent = make(tmp_path, model_name=None if script else "openai/gpt-6-luna", script=script)
        env = FakeEnvironment()
        asyncio.run(agent.run("do it", env, AgentContext()))
        if script is None:
            assert called == ["do it"]
        else:
            assert len(env.calls) == expect and all(call["command"].endswith(f"bash {c.SOLVE}") for call in env.calls)


def test_the_prompt_template_is_harbors_own_and_wraps_the_task_card(tmp_path):
    template = tmp_path / "t.md"
    template.write_text("WRAPPER\n\n{{ instruction }}")
    agent = make(tmp_path, prompt_template_path=str(template))
    assert agent.render_instruction("the card") == "WRAPPER\n\nthe card"


def test_web_tools_can_be_denied_with_harbors_own_option(tmp_path):
    agent = make(tmp_path, disable_web_search=True)
    command = agent._build_register_config_command()
    assert "webfetch" in command and "plugin" not in command
