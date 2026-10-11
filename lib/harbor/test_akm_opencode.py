# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

"""Tests for the akm arm. No Docker and no network. Run them with the Harbor release the eval pins:

    PYTHONPATH=lib/harbor uv run --no-project --python 3.12 --with harbor==0.24.0 --with pytest pytest lib/harbor
"""

import asyncio
import json
import os
import stat
import subprocess
from types import SimpleNamespace

import pytest
from harbor.agents.installed.opencode import OpenCode
from harbor.models.agent.context import AgentContext

import akm_opencode as m

CONFIG = {"$schema": "https://opencode.ai/config.json", "autoupdate": False}


def make(tmp_path, **options):
    defaults = dict(
        logs_dir=tmp_path,
        model_name="openai/gpt-6-luna",
        version="1.18.34",
        akm_cli_version="0.9.26",
        akm_plugin_version="0.9.26202610051302",
        libraries_dir="/libraries",
        opencode_config=dict(CONFIG),
    )
    return m.AkmOpenCode(**{**defaults, **options})


def checkout(tmp_path, **options):
    """The arm for a checkout of akm and its plugin, packed on the host."""
    return make(
        tmp_path,
        akm_cli_version="0.9.27",
        akm_plugin_version="0.9.27",
        packages_dir="/packages",
        akm_package="akm-cli-0.9.27.tgz",
        plugin_package="akm-opencode-0.9.27.tgz",
        **options,
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
    tarballs = checkout(tmp_path)
    for command in (tarballs._install_akm_command(), tarballs._install_plugin_command(), tarballs._check_command()):
        done = subprocess.run(["bash", "-n", "-c", command], capture_output=True, text=True)
        assert done.returncode == 0, done.stderr


def test_the_seed_checks_one_asset_per_file_unless_told_how_many_the_library_has(tmp_path):
    assert 'want="$(find /opt/akm/libraries/"$stash" -type f' in make(tmp_path)._seed_command()
    counted = make(tmp_path, library_assets=259)._seed_command()
    assert "want=259;" in counted
    assert "find /opt/akm/libraries" not in counted
    assert subprocess.run(["bash", "-n", "-c", counted], capture_output=True, text=True).returncode == 0


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


# -- an akm that is not an npm release, and what is recorded of the install ------------------------------------------


def test_a_release_is_installed_by_name_and_a_checkout_from_its_tarball(tmp_path):
    assert make(tmp_path)._install_akm_command().endswith("npm i -g akm-cli@0.9.26 && akm --version")
    assert make(tmp_path, akm_cli_version="0.9.27")._install_akm_command().endswith("npm i -g akm-cli@0.9.27 && akm --version")
    command = checkout(tmp_path)._install_akm_command()
    assert command.endswith("npm i -g /opt/akm/packages/akm-cli-0.9.27.tgz && akm --version")
    assert "akm-cli@" not in command


def test_a_plugin_tarball_is_installed_under_a_prefix_and_named_by_its_folder(tmp_path):
    agent = checkout(tmp_path)
    assert agent._opencode_config == {**CONFIG, "plugin": [f"file://{m.PLUGIN_DIR}"]}
    assert agent.version().endswith("+akm-opencode@0.9.27")  # what Harbor records of the arm still names the plugin's version
    command = agent._install_plugin_command()
    assert f"npm install --prefix {m.PLUGIN_PREFIX}" in command
    assert command.index("akm-opencode-0.9.27.tgz") < command.index("akm-cli-0.9.27.tgz")  # both, so the plugin's akm-cli is the one under test
    assert command.endswith(f"test -d {m.PLUGIN_DIR}")
    only_akm = make(tmp_path, akm_cli_version="0.9.27", packages_dir="/p", akm_package="akm-cli-0.9.27.tgz")
    assert only_akm._opencode_config["plugin"] == ["akm-opencode@0.9.26202610051302"]  # a checkout without the plugin keeps the pinned one


def test_akm_env_is_added_to_every_command_and_the_callers_env_still_wins(tmp_path):
    agent = make(tmp_path, akm_env={"AKM_CURATE_TIMEOUT": "30", "AKM_CURATE_LIMIT": "3"})
    env = FakeEnvironment()
    asyncio.run(agent.exec_as_agent(env, command="true"))
    sent = env.calls[0]["env"]
    assert sent["AKM_CURATE_TIMEOUT"] == "30"  # the job's value over the arm's 15
    assert sent["AKM_CURATE_LIMIT"] == "3"
    assert sent["AKM_AUTO_FEEDBACK"] == "0"  # what the job leaves alone stays as the arm sets it
    asyncio.run(agent.exec_as_agent(env, command="true", env={"AKM_CURATE_TIMEOUT": "99"}))
    assert env.calls[1]["env"]["AKM_CURATE_TIMEOUT"] == "99"
    assert m.AKM_ENV["AKM_CURATE_TIMEOUT"] == "15"  # the arm's own table is not changed by a job


def test_akm_env_may_not_move_what_the_arm_fixes(tmp_path):
    for key in ("AKM_BUNDLE_DIR", "AKM_CONFIG_DIR", "AKM_DATA_DIR", "AKM_CACHE_DIR", "AKM_STATE_DIR", "AKM_OPENCODE_CLI"):
        assert key in m.FIXED_AKM_ENV
        with pytest.raises(ValueError, match=f"{key} is fixed"):
            make(tmp_path, akm_env={key: "/elsewhere"})
    with pytest.raises(ValueError, match="not an AKM_"):
        make(tmp_path, akm_env={"OPENAI_API_KEY": "x"})
    with pytest.raises(ValueError, match="not an AKM_"):
        make(tmp_path, akm_env={"akm_lower": "x"})
    assert "AKM_CURATE_TIMEOUT" not in m.FIXED_AKM_ENV


def test_the_tarballs_are_plain_file_names_in_a_folder(tmp_path):
    with pytest.raises(ValueError, match="packages_dir"):
        make(tmp_path, akm_package="akm-cli-0.9.27.tgz")
    for name in ("../akm-cli.tgz", "/etc/passwd", "akm-cli.zip", "a b.tgz", "x/y.tgz"):
        with pytest.raises(ValueError, match="not the name of a tarball"):
            make(tmp_path, packages_dir="/p", akm_package=name)


def run_check(tmp_path, agent, akm_prints, carried, warm_log):
    """Runs the agent's check in bash, with an akm and a node that answer as told and the logs of a warm-up session."""
    tmp_path.mkdir(parents=True, exist_ok=True)
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "akm").write_text(f"#!/bin/bash\necho '{akm_prints}'\n")
    (bin_dir / "node").write_text('#!/bin/bash\nsed -n \'s/.*"version": *"\\([^"]*\\)".*/\\1/p\' "$3"\n')  # node -p "require(argv[1]).version" FILE
    for tool in ("akm", "node"):
        (bin_dir / tool).chmod(0o755)
    home = tmp_path / "home"
    package = home / ".cache" / "opencode" / "x" / "node_modules" / "akm-cli"
    package.mkdir(parents=True)
    (package / "package.json").write_text(json.dumps({"version": carried}))
    log = tmp_path / "warm" / "opencode" / "log"
    log.mkdir(parents=True)
    (log / "a.log").write_text(warm_log)
    env = {**os.environ, "HOME": str(home), "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    return subprocess.run(["bash", "-c", agent._check_command()], capture_output=True, text=True, env=env)


def test_the_check_records_what_was_installed_and_does_not_compare_it_with_a_version(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "WARM_DATA", str(tmp_path / "warm"))
    # An akm that is not the pinned one, and a plugin that carries the pinned one: the setup used to stop on both.
    agent = make(tmp_path / "logs", akm_cli_version="0.9.27")
    done = run_check(tmp_path, agent, "0.9.27-7-gabc123", "0.9.26", f"{m.PLUGIN_ACTIVE}\n")
    assert done.returncode == 0, done.stderr
    assert "AKM-SETUP akm=0.9.27-7-gabc123 plugin_akm_cli=0.9.26" in done.stdout
    assert "akm is not" not in agent._check_command()


def test_the_check_still_stops_for_a_plugin_that_did_not_load_or_an_akm_with_no_version(tmp_path, monkeypatch):
    agent = make(tmp_path / "logs")
    for name, prints, warm_log, said in (
        ("a", "0.9.26", "level=INFO started\n", "the plugin did not load"),
        ("b", "0.9.26", f"{m.PLUGIN_ACTIVE}\nAKM synchronous helper failed\n", "the plugin logged a failure"),
        ("c", "", f"{m.PLUGIN_ACTIVE}\n", "akm printed no version"),
    ):
        monkeypatch.setattr(m, "WARM_DATA", str(tmp_path / name / "warm"))
        done = run_check(tmp_path / name, agent, prints, "0.9.26", warm_log)
        assert done.returncode == 1 and said in done.stderr, done.stderr


def test_the_check_finds_the_akm_cli_a_plugin_tarball_carries_under_its_prefix(tmp_path, monkeypatch):
    prefix = tmp_path / "plugin"
    monkeypatch.setattr(m, "PLUGIN_PREFIX", str(prefix))
    monkeypatch.setattr(m, "WARM_DATA", str(tmp_path / "warm"))
    package = prefix / "node_modules" / "akm-opencode" / "node_modules" / "akm-cli"
    package.mkdir(parents=True)
    (package / "package.json").write_text(json.dumps({"version": "0.9.27"}))
    agent = checkout(tmp_path / "logs")
    assert str(prefix) in agent._check_command() and ".cache/opencode" not in agent._check_command()
    done = run_check(tmp_path, agent, "0.9.27", "0.9.99", f"{m.PLUGIN_ACTIVE}\n")  # the opencode cache has another one, which this arm must not read
    assert done.returncode == 0, done.stderr
    assert "plugin_akm_cli=0.9.27" in done.stdout


def test_the_seed_prints_how_many_assets_are_indexed(tmp_path):
    assert make(tmp_path, library_assets=259)._seed_command().endswith('echo "AKM-SETUP assets=$got"')


def test_the_install_record_reads_what_the_setup_printed():
    seen = m.install_record("noise\nAKM-SETUP assets=259\n", "akm setup ok\nAKM-SETUP akm=0.9.27 plugin_akm_cli=0.9.26\n", {"AKM_A": "1"})
    assert seen == {"akm_version": "0.9.27", "plugin_akm_cli": "0.9.26", "assets_indexed": 259, "env": {"AKM_A": "1"}}
    assert m.install_record("", "", {}) == {"akm_version": None, "plugin_akm_cli": None, "assets_indexed": None, "env": {}}


class ScriptedEnvironment(FakeEnvironment):
    """Answers a command that holds a key with the text for it, and keeps the uploads."""

    def __init__(self, replies):
        super().__init__()
        self.replies = replies
        self.uploads = []

    async def exec(self, command, user=None, env=None, cwd=None, timeout_sec=None):
        self.calls.append({"command": command, "env": env})
        stdout = next((text for key, text in self.replies if key in command), "")
        return SimpleNamespace(return_code=0, stdout=stdout, stderr="")

    async def upload_dir(self, source_dir, target_dir):
        self.uploads.append((str(source_dir), target_dir))
        self.calls.append({"command": f"UPLOAD {source_dir} {target_dir}", "env": None})


REPLIES = [
    ("readlink", "/usr/lib/node/bin/akm\n"),
    ("akm bundle create", "AKM-SETUP assets=259\n"),
    ('echo "akm setup ok"', "akm setup ok\nAKM-SETUP akm=0.9.27 plugin_akm_cli=0.9.26\n"),
]


def no_opencode_install(monkeypatch):
    """Node and opencode are Harbor's to install, and need a container."""

    async def nothing(self, environment):
        return None

    monkeypatch.setattr(OpenCode, "install", nothing)


def test_a_checkout_is_uploaded_and_installed_before_the_library_and_the_install_is_recorded(tmp_path, monkeypatch):
    no_opencode_install(monkeypatch)
    agent = checkout(tmp_path, akm_env={"AKM_CURATE_TIMEOUT": "30"}, library_assets=259)
    env = ScriptedEnvironment(REPLIES)
    asyncio.run(agent.install(env))
    commands = [c["command"] for c in env.calls]

    def at(text):
        return next(i for i, c in enumerate(commands) if text in c)

    assert env.uploads == [("/packages", m.PACKAGES), ("/libraries", m.LIBRARIES)]
    assert at("UPLOAD /packages") < at("npm i -g /opt/akm/packages/akm-cli-0.9.27.tgz") < at("npm install --prefix") < at(f"rm -rf {m.PACKAGES}") < at("UPLOAD /libraries")
    assert at("UPLOAD /libraries") < at("akm bundle create") < at("opencode --model")
    record = json.loads((tmp_path / m.INSTALL_FILE).read_text())
    assert record["akm_version"] == "0.9.27" and record["plugin_akm_cli"] == "0.9.26" and record["assets_indexed"] == 259
    assert record["env"]["AKM_CURATE_TIMEOUT"] == "30" and record["env"]["AKM_BUNDLE_DIR"] == m.BUNDLE
    # The same record goes into the trial's context, so Harbor keeps it in the trial's result.
    write_log(tmp_path, m.PLUGIN_ACTIVE)
    context = AgentContext()
    agent.populate_context_post_run(context)
    assert context.metadata == {"akm": record}


def test_a_release_install_uploads_no_packages(tmp_path, monkeypatch):
    no_opencode_install(monkeypatch)
    env = ScriptedEnvironment(REPLIES)
    asyncio.run(make(tmp_path).install(env))
    assert env.uploads == [("/libraries", m.LIBRARIES)]
    assert any("npm i -g akm-cli@0.9.26" in c["command"] for c in env.calls)
    assert not any("npm install --prefix" in c["command"] for c in env.calls)


# -- the verdict on the plugin, kept where a masking exception cannot hide it -------------------------------------------


def test_the_verdict_on_the_plugin_is_written_before_it_is_raised(tmp_path):
    agent = make(tmp_path)
    write_log(tmp_path, "level=INFO message=started\n")
    with pytest.raises(m.AkmPluginNotLoadedError):
        agent.populate_context_post_run(AgentContext())
    status = json.loads((tmp_path / m.PLUGIN_STATUS_FILE).read_text())
    assert status["live"] is False and "never logged" in status["problem"]
    (tmp_path / m.RUN_LOG_DIR / "opencode.log").write_text(m.PLUGIN_ACTIVE)
    agent.populate_context_post_run(AgentContext())  # the second call, from the recovery of a failed trial, leaves the verdict as it was
    assert json.loads((tmp_path / m.PLUGIN_STATUS_FILE).read_text()) == status


def test_a_live_plugin_is_written_down_too(tmp_path):
    write_log(tmp_path, f"level=INFO message={m.PLUGIN_ACTIVE!r}\n")
    make(tmp_path).populate_context_post_run(AgentContext())
    assert json.loads((tmp_path / m.PLUGIN_STATUS_FILE).read_text()) == {"live": True, "problem": None}


def test_a_trial_with_no_log_leaves_a_verdict_as_well(tmp_path):
    with pytest.raises(m.AkmPluginNotLoadedError, match="no opencode log"):
        make(tmp_path).populate_context_post_run(AgentContext())
    assert json.loads((tmp_path / m.PLUGIN_STATUS_FILE).read_text())["live"] is False
