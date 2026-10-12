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
import hashlib
import subprocess
from types import SimpleNamespace
from unittest import mock

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
    # Installed here from its lockfile and named as the folder it is in, so opencode does not resolve its dependencies itself.
    agent = make(tmp_path)
    assert agent._opencode_config == {**CONFIG, "plugin": [f"file://{m.PLUGIN_DIR}"]}
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
    for command in (agent._install_akm_command(), agent._install_plugin_command(), agent._trees_command(), agent._seed_command(), agent._warm_command(), agent._check_command()):
        done = subprocess.run(["bash", "-n", "-c", command], capture_output=True, text=True)
        assert done.returncode == 0, done.stderr
    tarballs = checkout(tmp_path)
    for command in (tarballs._install_akm_command(), tarballs._install_plugin_command(), tarballs._trees_command(), tarballs._check_command()):
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
    assert f'"file://{m.PLUGIN_DIR}"' in command
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


def test_a_release_with_a_lockfile_is_installed_from_it_and_one_without_by_name_and_a_checkout_from_its_tarball(tmp_path):
    command = make(tmp_path)._install_akm_command()  # the pinned release has a lockfile
    assert command.endswith(f"npm ci --prefix {m.CLI_PREFIX} --no-audit --no-fund && {m.CLI_BIN} --version")
    assert "akm-cli@" not in command and "npm i -g" not in command  # a global install would ignore the lockfile
    unlocked = make(tmp_path, akm_cli_version="0.9.27")._install_akm_command()  # no lockfile is committed for it
    assert unlocked.endswith(f"npm install --prefix {m.CLI_PREFIX} --no-audit --no-fund akm-cli@0.9.27 && {m.CLI_BIN} --version")
    tarball = checkout(tmp_path)._install_akm_command()
    assert tarball.endswith(f"npm install --prefix {m.CLI_PREFIX} --no-audit --no-fund /opt/akm/packages/akm-cli-0.9.27.tgz && {m.CLI_BIN} --version")
    assert "akm-cli@" not in tarball


def test_a_plugin_tarball_is_installed_under_a_prefix_and_named_by_its_folder(tmp_path):
    agent = checkout(tmp_path)
    assert agent._opencode_config == {**CONFIG, "plugin": [f"file://{m.PLUGIN_DIR}"]}
    assert agent.version().endswith("+akm-opencode@0.9.27")  # what Harbor records of the arm still names the plugin's version
    command = agent._install_plugin_command()
    assert f"npm install --prefix {m.PLUGIN_PREFIX}" in command
    assert command.index("akm-opencode-0.9.27.tgz") < command.index("akm-cli-0.9.27.tgz")  # both, so the plugin's akm-cli is the one under test
    assert command.endswith(f"test -d {m.PLUGIN_DIR}")
    only_akm = make(tmp_path, akm_cli_version="0.9.27", packages_dir="/p", akm_package="akm-cli-0.9.27.tgz")
    assert only_akm._opencode_config["plugin"] == [f"file://{m.PLUGIN_DIR}"]
    assert only_akm.version().endswith("+akm-opencode@0.9.26202610051302")  # a checkout without the plugin keeps the pinned one
    assert "npm ci --prefix /opt/akm/plugin" in only_akm._install_plugin_command()  # from its lockfile, with the akm-cli the plugin is pinned to


def test_the_pinned_plugin_is_installed_from_its_lockfile_without_install_scripts(tmp_path):
    command = make(tmp_path)._install_plugin_command()
    assert command.endswith(f"npm ci --prefix {m.PLUGIN_PREFIX} --ignore-scripts --no-audit --no-fund && test -d {m.PLUGIN_DIR}")
    assert "/opt/akm/packages" not in command
    other = make(tmp_path, akm_plugin_version="0.9.27")  # a plugin release with no lockfile is installed by name
    assert other._install_plugin_command().endswith(f"npm install --prefix {m.PLUGIN_PREFIX} --no-audit --no-fund akm-opencode@0.9.27 && test -d {m.PLUGIN_DIR}")


def test_the_lockfiles_are_those_committed_for_the_pinned_releases(tmp_path):
    assert m.lock_folder("akm-cli", "0.9.26") == m.LOCKS / "akm-cli-0.9.26"
    assert m.lock_folder("akm-opencode", "0.9.26202610051302") == m.LOCKS / "akm-opencode-0.9.26202610051302"
    assert m.lock_folder("akm-cli", "0.9.27") is None
    for folder in (m.LOCKS / "akm-cli-0.9.26", m.LOCKS / "akm-opencode-0.9.26202610051302"):
        assert (folder / "package.json").is_file() and (folder / "package-lock.json").is_file()
    agent = make(tmp_path)
    assert agent._akm_lock == m.LOCKS / "akm-cli-0.9.26" and agent._plugin_lock == m.LOCKS / "akm-opencode-0.9.26202610051302"
    assert checkout(tmp_path)._akm_lock is None and checkout(tmp_path)._plugin_lock is None  # a tarball replaces the release, and has no lockfile


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
    # The akm-cli the plugin carries is under the prefix the plugin is installed in. The opencode cache has another one, which this arm must not read.
    prefix = tmp_path / "plugin"
    for folder, version in ((prefix / "node_modules" / "akm-cli", carried), (home / ".cache" / "opencode" / "x" / "node_modules" / "akm-cli", "0.9.99")):
        folder.mkdir(parents=True)
        (folder / "package.json").write_text(json.dumps({"version": version}))
    log = tmp_path / "warm" / "opencode" / "log"
    log.mkdir(parents=True)
    (log / "a.log").write_text(warm_log)
    env = {**os.environ, "HOME": str(home), "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    with mock.patch.object(m, "PLUGIN_PREFIX", str(prefix)):
        command = agent._check_command()
    assert str(prefix) in command and ".cache/opencode" not in command
    return subprocess.run(["bash", "-c", command], capture_output=True, text=True, env=env)


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


def test_the_check_finds_the_akm_cli_the_plugin_carries_under_its_prefix_for_a_lockfile_and_a_tarball(tmp_path, monkeypatch):
    for name, agent in (("release", make(tmp_path / "logs")), ("checkout", checkout(tmp_path / "logs"))):
        monkeypatch.setattr(m, "WARM_DATA", str(tmp_path / name / "warm"))
        done = run_check(tmp_path / name, agent, "0.9.27", "0.9.27", f"{m.PLUGIN_ACTIVE}\n")
        assert done.returncode == 0, done.stderr
        assert "plugin_akm_cli=0.9.27" in done.stdout and "0.9.99" not in done.stdout


def test_the_seed_prints_how_many_assets_are_indexed(tmp_path):
    assert make(tmp_path, library_assets=259)._seed_command().endswith('echo "AKM-SETUP assets=$got"')


def test_the_install_record_reads_what_the_setup_printed():
    cli, plugin = "a" * 64, "b" * 64
    trees = f"noise\nAKM-SETUP tree_akm_cli={cli} tree_plugin={plugin}\n"
    seen = m.install_record("noise\nAKM-SETUP assets=259\n", "akm setup ok\nAKM-SETUP akm=0.9.27 plugin_akm_cli=0.9.26\n", {"AKM_A": "1"}, trees, {"akm_cli": "c" * 64, "plugin": None})
    assert seen == {
        "akm_version": "0.9.27",
        "plugin_akm_cli": "0.9.26",
        "assets_indexed": 259,
        "env": {"AKM_A": "1"},
        "lockfiles": {"akm_cli": "c" * 64, "plugin": None},
        "dependency_trees": {"akm_cli": cli, "plugin": plugin},
        "dependency_tree_sha256": m.tree_sha256({"akm_cli": cli, "plugin": plugin}),
    }
    empty = m.install_record("", "", {})
    assert empty == {"akm_version": None, "plugin_akm_cli": None, "assets_indexed": None, "env": {}, "lockfiles": {"akm_cli": None, "plugin": None}, "dependency_trees": None, "dependency_tree_sha256": None}


def test_the_digest_of_the_trees_depends_on_both_trees_and_on_nothing_else():
    one = m.tree_sha256({"akm_cli": "a" * 64, "plugin": "b" * 64})
    assert one == m.tree_sha256({"plugin": "b" * 64, "akm_cli": "a" * 64})
    assert one != m.tree_sha256({"akm_cli": "a" * 64, "plugin": "c" * 64})
    assert one != m.tree_sha256({"akm_cli": "c" * 64, "plugin": "b" * 64})


def run_trees(tmp_path, npm_prints):
    """Runs the command that digests the installed trees, with an npm that prints what it is told for each prefix, and exits 1 as npm ls does for a tree with a problem."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(parents=True)
    cases = "".join(f"  {prefix}) printf '%s' '{text}'; exit 1;;\n" for prefix, text in npm_prints.items())
    (bin_dir / "npm").write_text('#!/bin/bash\nprefix="${@: -1}"\ncase "$prefix" in\n' + cases + "esac\n")
    (bin_dir / "npm").chmod(0o755)
    env = {**os.environ, "HOME": str(tmp_path / "home"), "PATH": f"{bin_dir}:{os.environ['PATH']}"}
    return subprocess.run(["bash", "-c", make(tmp_path / "logs")._trees_command()], capture_output=True, text=True, env=env)


def test_the_trees_command_digests_what_npm_ls_prints_for_each_prefix_even_when_npm_exits_1(tmp_path):
    def sha(text):
        return hashlib.sha256(text.encode()).hexdigest()

    cli, plugin = '{"name":"akm-eval-akm-cli"}', '{"name":"akm-eval-akm-opencode"}'
    done = run_trees(tmp_path / "a", {m.CLI_PREFIX: cli, m.PLUGIN_PREFIX: plugin})
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip() == f"AKM-SETUP tree_akm_cli={sha(cli)} tree_plugin={sha(plugin)}"
    # Another tree under either prefix is another digest, and an install that printed nothing stops the setup.
    other = run_trees(tmp_path / "b", {m.CLI_PREFIX: cli, m.PLUGIN_PREFIX: '{"name":"other"}'})
    assert other.stdout.strip() != done.stdout.strip() and other.stdout.startswith(f"AKM-SETUP tree_akm_cli={sha(cli)} ")
    none = run_trees(tmp_path / "c", {m.CLI_PREFIX: cli, m.PLUGIN_PREFIX: ""})
    assert none.returncode == 1 and "npm ls printed nothing" in none.stderr


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


CLI_TREE, PLUGIN_TREE = "1" * 64, "2" * 64
REPLIES = [
    ("readlink", "/usr/lib/node/bin/akm\n"),
    ("akm bundle create", "AKM-SETUP assets=259\n"),
    ('echo "akm setup ok"', "akm setup ok\nAKM-SETUP akm=0.9.27 plugin_akm_cli=0.9.26\n"),
    ("tree_akm_cli", f"AKM-SETUP tree_akm_cli={CLI_TREE} tree_plugin={PLUGIN_TREE}\n"),
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

    assert env.uploads == [("/packages", m.PACKAGES), ("/libraries", m.LIBRARIES)]  # a checkout has no lockfile to upload
    assert at("UPLOAD /packages") < at(f"npm install --prefix {m.CLI_PREFIX} --no-audit --no-fund /opt/akm/packages/akm-cli-0.9.27.tgz") < at(f"npm install --prefix {m.PLUGIN_PREFIX}")
    assert at(f"npm install --prefix {m.PLUGIN_PREFIX}") < at("npm ls") < at(f"rm -rf {m.PACKAGES}") < at("UPLOAD /libraries")  # the tree is read while the tarballs are still there
    assert at("UPLOAD /libraries") < at("akm bundle create") < at("opencode --model")
    record = json.loads((tmp_path / m.INSTALL_FILE).read_text())
    assert record["akm_version"] == "0.9.27" and record["plugin_akm_cli"] == "0.9.26" and record["assets_indexed"] == 259
    assert record["env"]["AKM_CURATE_TIMEOUT"] == "30" and record["env"]["AKM_BUNDLE_DIR"] == m.BUNDLE
    # No lockfile, and the record says so; the digest of what npm installed is there all the same.
    assert record["lockfiles"] == {"akm_cli": None, "plugin": None}
    assert record["dependency_trees"] == {"akm_cli": CLI_TREE, "plugin": PLUGIN_TREE}
    assert record["dependency_tree_sha256"] == m.tree_sha256({"akm_cli": CLI_TREE, "plugin": PLUGIN_TREE})
    # The same record goes into the trial's context, so Harbor keeps it in the trial's result.
    write_log(tmp_path, m.PLUGIN_ACTIVE)
    context = AgentContext()
    agent.populate_context_post_run(context)
    assert context.metadata == {"akm": record}


def test_a_release_install_uploads_its_lockfiles_not_packages_and_installs_from_them(tmp_path, monkeypatch):
    no_opencode_install(monkeypatch)
    env = ScriptedEnvironment(REPLIES)
    asyncio.run(make(tmp_path).install(env))
    cli, plugin = m.LOCKS / "akm-cli-0.9.26", m.LOCKS / "akm-opencode-0.9.26202610051302"
    assert env.uploads == [(str(cli), m.CLI_PREFIX), (str(plugin), m.PLUGIN_PREFIX), ("/libraries", m.LIBRARIES)]
    commands = [c["command"] for c in env.calls]
    assert any(f"npm ci --prefix {m.CLI_PREFIX}" in c for c in commands) and any(f"npm ci --prefix {m.PLUGIN_PREFIX}" in c for c in commands)
    assert not any("npm install" in c or "npm i -g" in c for c in commands)  # nothing is resolved in the container
    # The lockfile is the committed one, and the record names it by its digest, with the digest of what npm installed from it.
    record = json.loads((tmp_path / m.INSTALL_FILE).read_text())
    assert record["lockfiles"] == {"akm_cli": hashlib.sha256((cli / "package-lock.json").read_bytes()).hexdigest(), "plugin": hashlib.sha256((plugin / "package-lock.json").read_bytes()).hexdigest()}
    assert record["dependency_trees"] == {"akm_cli": CLI_TREE, "plugin": PLUGIN_TREE}


def test_a_release_without_a_lockfile_is_installed_by_name_and_the_record_says_it_has_none(tmp_path, monkeypatch):
    no_opencode_install(monkeypatch)
    env = ScriptedEnvironment(REPLIES)
    asyncio.run(make(tmp_path, akm_cli_version="0.9.27").install(env))
    assert env.uploads == [(str(m.LOCKS / "akm-opencode-0.9.26202610051302"), m.PLUGIN_PREFIX), ("/libraries", m.LIBRARIES)]  # the pinned plugin still has its own
    assert any(f"npm install --prefix {m.CLI_PREFIX} --no-audit --no-fund akm-cli@0.9.27" in c["command"] for c in env.calls)
    record = json.loads((tmp_path / m.INSTALL_FILE).read_text())
    assert record["lockfiles"]["akm_cli"] is None and record["lockfiles"]["plugin"] is not None
    assert record["dependency_tree_sha256"] is not None


def test_two_trials_of_a_run_install_the_same_dependency_tree(tmp_path, monkeypatch):
    """Every trial runs the same commands from the same committed files, so what npm installs does not depend on when the container started."""
    no_opencode_install(monkeypatch)
    runs = []
    for name in ("one", "two"):
        env = ScriptedEnvironment(REPLIES)
        asyncio.run(make(tmp_path / name).install(env))
        runs.append(([c["command"] for c in env.calls], env.uploads, json.loads((tmp_path / name / m.INSTALL_FILE).read_text())))
    assert runs[0] == runs[1]
    assert runs[0][2]["dependency_tree_sha256"] is not None


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
