"""Tests for the bakeoff harness. Run: uv run --project evals/bakeoff/src --frozen python -m unittest discover -s evals/bakeoff/src"""

import contextlib
import datetime
import hashlib
import http.server
import io
import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock

import bakeoff

REAL_ASSETS = bakeoff.EVAL_DIR / "assets"


class FakeEndpoint:
    """An OpenAI-compatible endpoint on localhost. It records every request and replies from a script."""

    def __init__(self, replies, delay=0):
        self.replies = list(replies)  # (status, body) in order; the last one repeats
        self.requests = []
        self.delay = delay
        outer = self

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"path": self.path, "auth": self.headers.get("Authorization"), "body": body})
                time.sleep(outer.delay)
                status, reply = outer.replies.pop(0) if len(outer.replies) > 1 else outer.replies[0]
                data = json.dumps(reply).encode()
                try:
                    self.send_response(status)
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # the client gave up first

            def log_message(self, *args):
                pass

        self.server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()

    @property
    def base_url(self):
        return f"http://127.0.0.1:{self.server.server_port}/v1"


def reply(content, model="m-observed", reasoning=None):
    message = {"role": "assistant", "content": content}
    if reasoning is not None:
        message["reasoning_content"] = reasoning
    return {"model": model, "choices": [{"message": message, "finish_reason": "stop"}], "usage": {"prompt_tokens": 5, "completion_tokens": 7}}


class SuiteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bakeoff.use_assets(bakeoff.EVAL_DIR / "assets")

    def test_cases_load_with_sets_where_the_scorers_compare_sets(self):
        self.assertEqual(len(bakeoff.CASES), 120)
        pool = bakeoff.CASE_BY_ID["consolidate-memory-pool"]
        self.assertIsInstance(pool["expected"]["merge"][0], set)
        self.assertEqual(pool["tier"], "compact")

    def test_limit_takes_the_first_case_of_each_process_in_turn(self):
        picked = bakeoff.select_cases(bakeoff.CASES, limit=3)
        self.assertEqual([case["process"] for case in picked], ["memory_consolidation", "distill", "memory_inference"])
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, tier="deep")), 48)
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, tier="deep", include_legacy=True)), 68)
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, tier="compact", limit=20)), 20)
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, limit=500)), 88)
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, limit=500, include_legacy=True)), 120)

    def test_the_legacy_cases_are_the_jobs_akm_dropped_and_a_limit_never_picks_them(self):
        legacy = [case for case in bakeoff.CASES if bakeoff.legacy_reason(case)]
        self.assertEqual(len(legacy), 32)
        self.assertEqual({case["process"] for case in legacy}, {"graph_extraction", "metadata_enhance", "reflect_proposal"})
        self.assertEqual(sum(case["process"] == "reflect_proposal" for case in legacy), 13)  # every reflect case asks for a rewritten body
        self.assertEqual(sum(case["process"] in ("graph_extraction", "metadata_enhance") for case in legacy), 19)
        picked = bakeoff.select_cases(bakeoff.CASES, limit=13)
        self.assertEqual(len(picked), 13)
        self.assertFalse([case["id"] for case in picked if bakeoff.legacy_reason(case)])
        self.assertTrue(any(bakeoff.legacy_reason(case) for case in bakeoff.select_cases(bakeoff.CASES, limit=13, include_legacy=True)))

    def test_prompts_version_names_the_akm_the_prompts_are_from(self):
        self.assertEqual(bakeoff.PROMPTS_VERSION, "0.9.15-style")

    def test_verify_passes_and_does_not_need_the_legacy_cases(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(bakeoff.command_verify(), 0)
        self.assertIn("32 of them legacy, which are not required", out.getvalue())
        public = bakeoff.EVAL_DIR / "assets"
        with tempfile.TemporaryDirectory() as tmp:
            copy = pathlib.Path(tmp, "assets")
            shutil.copytree(public, copy)
            cases = json.loads((copy / "cases.json").read_text(encoding="utf-8"))
            kept = [case for case in cases if bakeoff.legacy_reason(case) is None]
            used = {path for case in kept for path in case["files"]}
            (copy / "cases.json").write_text(json.dumps(kept), encoding="utf-8")
            for path in [path for path in copy.rglob("*") if path.is_file() and path.name != "cases.json"]:
                if path.relative_to(copy).as_posix() not in used:
                    path.unlink()
            bakeoff.use_assets(copy)
            with contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(bakeoff.command_verify(), 0, out.getvalue())
        bakeoff.use_assets(public)

    def test_a_reply_the_scorer_cannot_read_is_a_failed_reply(self):
        case = bakeoff.CASE_BY_ID["prod-reflect-workflow-preservation"]
        result = bakeoff.score_reply(case, '{"operations": [], "warnings": []}')
        self.assertFalse(result["structure"])
        self.assertFalse(result["passed"])

    def test_check_assets_passes_the_public_assets_and_catches_a_missing_file(self):
        args = type("Args", (), {"assets": str(bakeoff.EVAL_DIR / "assets")})()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(bakeoff.command_check_assets(args), 0)
            with tempfile.TemporaryDirectory() as tmp:
                cases = [{"id": "x", "process": "distill", "files": ["gone.md"], "variant": "knowledge", "expected": {}, "tier": "compact", "track": "focused"}]
                pathlib.Path(tmp, "cases.json").write_text(json.dumps(cases))
                self.assertEqual(bakeoff.command_check_assets(type("Args", (), {"assets": tmp})()), 1)
        bakeoff.use_assets(bakeoff.EVAL_DIR / "assets")

    def test_assets_made_from_others_must_keep_what_each_case_expects(self):
        public = bakeoff.EVAL_DIR / "assets"
        with tempfile.TemporaryDirectory() as tmp:
            copy = pathlib.Path(tmp, "copy")
            shutil.copytree(public, copy)
            self.assertEqual(bakeoff.term_errors(copy, public), [])
            source = copy / "knowledge" / "queue-recovery.md"
            source.write_text(source.read_text(encoding="utf-8").replace("Pause publishers", "Halt publishers").replace("pause publishers", "halt publishers"), encoding="utf-8")
            errors = bakeoff.term_errors(copy, public)
            self.assertTrue(any("'pause publishers'" in error for error in errors), errors)
            args = type("Args", (), {"assets": str(copy), "against": str(public)})()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(bakeoff.command_check_assets(args), 1)
        bakeoff.use_assets(public)


class SummaryTest(unittest.TestCase):
    def rows(self):
        base = {"ok": True, "process": "distill", "track": "focused", "observed_model": None, "seconds": 1.0, "case_id": "distill-queue-knowledge", "checks": []}
        return [
            {**base, "structure": True, "passed": False, "earned": 3, "possible": 4},
            {**base, "structure": False, "passed": False, "earned": 2, "possible": 2},  # checks that hold by saying nothing
            {**base, "structure": True, "passed": True, "earned": 4, "possible": 4},
        ]

    def test_a_reply_of_the_wrong_shape_earns_no_check_credit(self):
        bakeoff.use_assets(bakeoff.EVAL_DIR / "assets")
        summary = bakeoff.summarize_model(bakeoff.model_entry("t", "m", "http://x", None), self.rows())
        self.assertEqual(summary["metrics"]["checks"], {"n": 3, "rate": 0.5833})  # (0.75 + 0 + 1) / 3
        self.assertEqual(summary["by_process"]["distill"]["checks"], 0.5833)
        self.assertEqual(summary["by_track"]["focused"], {"n": 3, "valid_output": 2, "passed": 1, "checks": 0.5833})
        self.assertEqual(summary["metrics"]["valid_output"], {"n": 3, "passed": 2, "rate": 0.6667})


GATEWAY_ENV = {"MODEL_BASE_URL": "http://gateway/v1", "MODEL_API_KEY": "gk", "CLOUD_KEY": "ck"}
LINES = {
    "cloud-model": {"base_url": "https://api.example.com/v1 ", "api_key_env": "CLOUD_KEY", "model": "the-real-name", "private": True},
    "local": {"base_url": "http://localhost:8101/v1"},
}


class ModelsTest(unittest.TestCase):
    def test_the_environment_names_one_model(self):
        env = {"MODEL_BASE_URL": "http://localhost:8080/v1", "MODEL_API_KEY": "k", "MODEL_NAME": "Org/Model-1"}
        (model,) = bakeoff.load_models(None, env, lines={})
        self.assertEqual((model["label"], model["model"], model["api_key"]), ("org-model-1", "Org/Model-1", "k"))
        self.assertEqual((model["temperature"], model["max_tokens"], model["private"], model["seed"]), (0, 6000, False, None))
        with self.assertRaisesRegex(ValueError, "MODEL_NAME"):
            bakeoff.load_models(None, {}, lines={})
        with self.assertRaisesRegex(ValueError, "MODEL_BASE_URL"):
            bakeoff.load_models(None, {"MODEL_NAME": "m"}, lines={})

    def test_model_ids_resolve_the_way_lib_models_does(self):
        gateway, cloud, local = bakeoff.load_models(None, GATEWAY_ENV, ["gw-model", "cloud-model", "local"], LINES)
        # an id that is no line goes to the gateway of .env, with its key
        self.assertEqual((gateway["model"], gateway["base_url"], gateway["api_key"], gateway["api_key_env"], gateway["private"]), ("gw-model", "http://gateway/v1", "gk", "MODEL_API_KEY", False))
        # a line of models.json goes to its own URL, with the key held in its api_key_env, under the name the line gives it
        self.assertEqual((cloud["label"], cloud["model"], cloud["base_url"], cloud["api_key"], cloud["api_key_env"], cloud["private"]), ("cloud-model", "the-real-name", "https://api.example.com/v1", "ck", "CLOUD_KEY", True))
        self.assertEqual((local["model"], local["api_key"], local["api_key_env"], local["private"]), ("local", None, None, False))
        # without --model the id is MODEL_NAME, and that may name a line too
        (named,) = bakeoff.load_models(None, {**GATEWAY_ENV, "MODEL_NAME": "cloud-model"}, [], LINES)
        self.assertEqual(named["model"], "the-real-name")
        with self.assertRaisesRegex(ValueError, "CLOUD_KEY, which is not set"):
            bakeoff.load_models(None, {"MODEL_BASE_URL": "http://gateway/v1"}, ["cloud-model"], LINES)
        with self.assertRaisesRegex(ValueError, "MODEL_BASE_URL"):
            bakeoff.load_models(None, {}, ["gw-model"], LINES)
        with self.assertRaisesRegex(ValueError, "--model needs a model id"):
            bakeoff.load_models(None, GATEWAY_ENV, [" "], LINES)
        with self.assertRaisesRegex(ValueError, "twice"):
            bakeoff.load_models(None, GATEWAY_ENV, ["a", "a"], LINES)

    def test_a_private_model_is_recorded_and_never_refused(self):
        (cloud,) = bakeoff.load_models(None, GATEWAY_ENV, ["cloud-model"], LINES)
        self.assertTrue(bakeoff.model_settings(cloud)["private"])
        (local,) = bakeoff.load_models(None, GATEWAY_ENV, ["local"], LINES)
        self.assertFalse(bakeoff.model_settings(local)["private"])

    def test_model_and_models_cannot_be_given_together(self):
        with self.assertRaisesRegex(ValueError, "not both"):
            bakeoff.load_models("some.yaml", {}, ["a"], {})

    def test_models_json_is_checked_like_lib_models(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp, "models.json")
            self.assertEqual(bakeoff.load_model_lines(path), {})
            path.write_text('{"a": {"base_url": "http://a/v1", "private": true}}')
            self.assertTrue(bakeoff.load_model_lines(path)["a"]["private"])
            for text, message in (
                ("[1]", "object of model lines"),
                ("{bad", "not JSON"),
                ('{"a": {}}', "needs a base_url"),
                ('{"a": {"base_url": "u", "private": "yes"}}', "private must be true or false"),
                ('{"a": {"base_url": "u", "api_key_env": "sk-123 abc"}}', "api_key_env must be the name of an environment variable"),
                ('{"a": {"base_url": "u", "model": 3}}', "model must be a string"),
            ):
                path.write_text(text)
                with self.assertRaisesRegex(ValueError, message):
                    bakeoff.load_model_lines(path)

    def test_a_models_file_lists_models_and_takes_keys_from_the_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp, "models.yaml")
            path.write_text(
                "models:\n"
                "  - {label: a, model: ma, base_url: 'http://a/v1'}\n"
                "  - {label: b, model: mb, base_url: 'http://b/v1', api_key_env: B_KEY, private: true, temperature: null, max_tokens: 100, extra_body: {x: 1}}\n"
            )
            first, second = bakeoff.load_models(str(path), {"B_KEY": "secret"}, lines={})
            self.assertIsNone(first["api_key"])
            self.assertEqual((second["api_key"], second["api_key_env"], second["private"]), ("secret", "B_KEY", True))
            self.assertEqual((second["temperature"], second["max_tokens"], second["extra_body"]), (None, 100, {"x": 1}))
            with self.assertRaisesRegex(ValueError, "B_KEY is not set"):
                bakeoff.load_models(str(path), {}, lines={})
            path.write_text("models:\n  - {label: a, model: m, base_url: u}\n  - {label: a, model: m, base_url: u}\n")
            with self.assertRaisesRegex(ValueError, "labels must be different"):
                bakeoff.load_models(str(path), {}, lines={})
            path.write_text("models:\n  - {label: a, model: m, base_url: u, top_p: 1}\n")
            with self.assertRaisesRegex(ValueError, "unknown option"):
                bakeoff.load_models(str(path), {}, lines={})

    def test_a_models_file_entry_can_name_a_model_by_id_and_add_options(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp, "models.yaml")
            path.write_text(
                "models:\n"
                "  - {label: q, id: qwen, seed: 7, extra_body: {chat_template_kwargs: {enable_thinking: false}}}\n"
                "  - {label: c, id: cloud-model, temperature: null}\n"
            )
            qwen, cloud = bakeoff.load_models(str(path), GATEWAY_ENV, lines=LINES)
            self.assertEqual((qwen["model"], qwen["base_url"], qwen["seed"]), ("qwen", "http://gateway/v1", 7))
            self.assertEqual(qwen["extra_body"], {"chat_template_kwargs": {"enable_thinking": False}, "seed": 7})
            self.assertEqual((cloud["model"], cloud["private"], cloud["temperature"]), ("the-real-name", True, None))
            path.write_text("models:\n  - {label: q, id: qwen, base_url: 'http://x/v1'}\n")
            with self.assertRaisesRegex(ValueError, "id cannot be combined"):
                bakeoff.load_models(str(path), GATEWAY_ENV, lines=LINES)
            path.write_text("models:\n  - {label: q, id: qwen}\n")
            with self.assertRaisesRegex(ValueError, "model q: qwen is sent to the gateway"):
                bakeoff.load_models(str(path), {}, lines=LINES)

    def test_the_example_file_loads(self):
        models = bakeoff.load_models(str(bakeoff.EVAL_DIR / "models.example.yaml"), {"HOSTED_API_KEY": "k", "MODEL_BASE_URL": "http://gateway/v1"}, lines={})
        self.assertEqual([model["label"] for model in models], ["local-qwen", "hosted-model", "gateway-model"])
        self.assertEqual(models[2]["seed"], 1234)

    def test_a_seed_is_an_option_of_the_model_sent_as_the_seed_field(self):
        model = bakeoff.model_entry("t", "m", "http://x/v1", None, {"seed": 42, "extra_body": {"reasoning_effort": "none"}})
        self.assertEqual((model["seed"], model["extra_body"]), (42, {"reasoning_effort": "none", "seed": 42}))
        self.assertEqual(bakeoff.model_entry("t", "m", "http://x/v1", None, {"extra_body": {"seed": 5}})["seed"], 5)
        self.assertIsNone(bakeoff.model_entry("t", "m", "http://x/v1", None)["seed"])
        for options, message in (
            ({"seed": "7"}, "seed must be an integer"),
            ({"seed": True}, "seed must be an integer"),
            ({"seed": 1, "extra_body": {"seed": 2}}, "differ"),
        ):
            with self.assertRaisesRegex(ValueError, message):
                bakeoff.model_entry("t", "m", "http://x/v1", None, options)

    def test_extra_body_cannot_override_what_the_run_sends(self):
        for key in ("model", "messages", "stream"):
            with self.assertRaisesRegex(ValueError, f"cannot set {key}"):
                bakeoff.model_entry("t", "m", "http://x/v1", None, {"extra_body": {key: "x"}})
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp, "models.yaml")
            path.write_text("models:\n  - {label: a, model: m, base_url: u, extra_body: {model: other}}\n")
            with self.assertRaisesRegex(ValueError, "cannot set model"):
                bakeoff.load_models(str(path), {}, lines={})

    def test_the_settings_of_a_summary_hold_no_key_and_no_credentials(self):
        extra = {"api_key": "sk-leak", "auth": {"token": "tok-leak", "ref": "$MY_VAR"}, "nested": [{"Secret": "sec-leak"}], "apiKey": "$MY_KEY", "safe": 1}
        model = bakeoff.model_entry("t", "m", "https://user:pw-leak@api.example.com:8443/v1?key=q-leak#frag", "sk-model-leak", {"extra_body": extra, "seed": 3, "retries": 1}, "T_KEY", True)
        settings = bakeoff.model_settings(model)
        self.assertEqual(settings["base_url"], "https://api.example.com:8443/v1")
        self.assertEqual(
            settings["extra_body"],
            {"api_key": "<redacted>", "auth": {"token": "<redacted>", "ref": "$MY_VAR"}, "nested": [{"Secret": "<redacted>"}], "apiKey": "$MY_KEY", "safe": 1, "seed": 3},
        )
        self.assertEqual(
            {key: settings[key] for key in ("api_key_env", "private", "temperature", "max_tokens", "seed", "timeout", "retries")},
            {"api_key_env": "T_KEY", "private": True, "temperature": 0, "max_tokens": 6000, "seed": 3, "timeout": 900, "retries": 1},
        )
        text = json.dumps(settings)
        for leak in ("sk-leak", "tok-leak", "sec-leak", "pw-leak", "q-leak", "sk-model-leak"):
            self.assertNotIn(leak, text)
        self.assertNotIn("api_key", settings)

    def test_redact_config_covers_every_credential_field_url_and_header_at_any_depth(self):
        config = {
            "engines": {
                "a": {"endpoint": "https://user:pw-leak@gateway.example:8443/v1/chat/completions?api_key=q-leak&model=m&Access_Token=at-leak&ok=1#frag-leak", "apiKey": "$A_KEY", "maxTokens": 5},
                "b": {"endpoint": "https://gateway.example/v1?token=$B_TOKEN&sig=sig-leak&Signature=sg-leak&auth=au-leak&password=ps-leak&secret=se-leak&key=k-leak", "client_secret": "cs-leak"},
            },
            "headers": {"Authorization": "Bearer h-leak", "X-Api-Key": "xk-leak", "api-key": "ak-leak", "Content-Type": "application/json"},
            "list": [
                "Authorization: Bearer line-leak",
                "X-Api-Key: $KEPT",
                ["Authorization", "Bearer pair-leak"],
                {"name": "x-api-key", "value": "named-leak"},
                [{"registry": "https://tok-leak@registry.example/index.json", "access_token": "ac-leak"}],
            ],
            "db": "postgres://dbuser:db-leak@db.example:5432/x",
            "tokenizer": "t",
        }
        redacted = bakeoff.redact_config(config)
        text = json.dumps(redacted)
        for leak in ("pw-leak", "q-leak", "at-leak", "frag-leak", "sig-leak", "sg-leak", "au-leak", "ps-leak", "se-leak", "k-leak", "cs-leak", "h-leak", "xk-leak", "ak-leak", "line-leak", "pair-leak", "named-leak", "tok-leak", "ac-leak", "db-leak"):
            self.assertNotIn(leak, text)
        self.assertEqual(redacted["engines"]["a"], {"endpoint": "https://gateway.example:8443/v1/chat/completions?api_key=<redacted>&model=m&Access_Token=<redacted>&ok=1", "apiKey": "$A_KEY", "maxTokens": 5})
        self.assertEqual(redacted["engines"]["b"]["endpoint"], "https://gateway.example/v1?token=$B_TOKEN&sig=<redacted>&Signature=<redacted>&auth=<redacted>&password=<redacted>&secret=<redacted>&key=<redacted>")
        self.assertEqual(redacted["headers"], {"Authorization": "<redacted>", "X-Api-Key": "<redacted>", "api-key": "<redacted>", "Content-Type": "application/json"})
        self.assertEqual(redacted["list"][:4], ["Authorization: <redacted>", "X-Api-Key: $KEPT", ["Authorization", "<redacted>"], {"name": "x-api-key", "value": "<redacted>"}])
        self.assertEqual(redacted["list"][4], [{"registry": "https://registry.example/index.json", "access_token": "<redacted>"}])
        self.assertEqual((redacted["db"], redacted["tokenizer"]), ("postgres://db.example:5432/x", "t"))
        self.assertIn("pw-leak", json.dumps(config))  # the config it was given is not changed


class ChatTest(unittest.TestCase):
    def model(self, endpoint, **options):
        return bakeoff.model_entry("t", "the-model", endpoint.base_url, options.pop("api_key", None), options)

    def test_the_request_is_a_plain_chat_completion_and_the_reply_is_read(self):
        with FakeEndpoint([(200, reply('{"a": 1}'))]) as endpoint:
            result = bakeoff.call_chat_messages(self.model(endpoint, api_key="k"), [("system", "s"), ("user", "u")])
        (request,) = endpoint.requests
        self.assertEqual(request["path"], "/v1/chat/completions")
        self.assertEqual(request["auth"], "Bearer k")
        self.assertEqual(request["body"], {"model": "the-model", "messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "u"}], "stream": False, "temperature": 0, "max_tokens": 6000})
        self.assertEqual((result["text"], result["observed_model"], result["prompt_tokens"], result["completion_tokens"]), ('{"a": 1}', "m-observed", 5, 7))

    def test_options_can_leave_fields_out_or_add_them(self):
        with FakeEndpoint([(200, reply("ok"))]) as endpoint:
            bakeoff.call_chat_messages(self.model(endpoint, temperature=None, max_tokens=None, extra_body={"reasoning_effort": "none"}), [("user", "u")])
        body = endpoint.requests[0]["body"]
        self.assertNotIn("temperature", body)
        self.assertNotIn("max_tokens", body)
        self.assertEqual(body["reasoning_effort"], "none")
        self.assertIsNone(endpoint.requests[0]["auth"])

    def test_a_seed_goes_to_the_endpoint_as_the_seed_field(self):
        with FakeEndpoint([(200, reply("ok"))]) as endpoint:
            bakeoff.call_chat_messages(self.model(endpoint, seed=3), [("user", "u")])
        self.assertEqual(endpoint.requests[0]["body"]["seed"], 3)

    def test_json_in_the_reasoning_is_used_when_the_content_is_empty(self):
        with FakeEndpoint([(200, reply("", reasoning='thinking... {"a": 2} done'))]) as endpoint:
            result = bakeoff.call_chat_messages(self.model(endpoint), [("user", "u")])
        self.assertEqual(result["text"], '{"a": 2}')
        self.assertTrue(result["content_fallback"])

    def test_a_busy_endpoint_is_retried_and_a_refusal_is_not(self):
        busy = {"retries": 2, "timeout": 5}
        with FakeEndpoint([(503, {"error": "busy"}), (200, reply("ok"))]) as endpoint:
            model = self.model(endpoint, **busy)
            model["retry_backoff"] = 0
            self.assertEqual(bakeoff.call_chat_messages(model, [("user", "u")])["retry_count"], 1)
        with FakeEndpoint([(400, {"error": "context length exceeded"})]) as endpoint:
            with self.assertRaisesRegex(RuntimeError, "HTTP 400.*context length exceeded"):
                bakeoff.call_chat_messages(self.model(endpoint, **busy), [("user", "u")])
            self.assertEqual(len(endpoint.requests), 1)

    def test_a_request_that_times_out_is_not_tried_again(self):
        with FakeEndpoint([(200, reply("late"))], delay=1.5) as endpoint:
            model = self.model(endpoint, timeout=0.5, retries=3)
            model["retry_backoff"] = 0
            with self.assertRaises(TimeoutError):
                bakeoff.call_chat_messages(model, [("user", "u")])
            self.assertEqual(len(endpoint.requests), 1)

    def test_a_chunked_case_sends_one_request_per_chunk(self):
        bakeoff.use_assets(bakeoff.EVAL_DIR / "assets")
        case = bakeoff.CASE_BY_ID["prod-graph-chunked-workflow"]
        chunks = len(bakeoff.build_message_sets(case))
        self.assertGreater(chunks, 1)
        with FakeEndpoint([(200, reply('{"entities": [], "relations": []}'))]) as endpoint:
            result = bakeoff.call_chat(self.model(endpoint), case)
        self.assertEqual(len(endpoint.requests), chunks)
        self.assertEqual(result["request_count"], chunks)
        self.assertEqual(len(json.loads(result["text"])["chunk_outputs"]), chunks)
        self.assertEqual(result["observed_model"], "m-observed")

    def test_run_model_counts_a_failed_request_as_errored_not_failed(self):
        bakeoff.use_assets(bakeoff.EVAL_DIR / "assets")
        cases = bakeoff.select_cases(bakeoff.CASES, limit=2)
        with FakeEndpoint([(200, reply("not json at all")), (400, {"error": "no"})]) as endpoint:
            model = self.model(endpoint)
            with tempfile.TemporaryFile("w+") as samples, contextlib.redirect_stdout(io.StringIO()):
                rows = bakeoff.run_model(model, cases, samples)
        self.assertEqual([row["ok"] for row in rows], [True, False])
        self.assertFalse(rows[0]["passed"])
        self.assertIsNone(rows[1]["passed"])
        summary = bakeoff.summarize_model(model, rows)
        self.assertEqual((summary["n_run"], summary["n_scored"], summary["n_errored"]), (2, 1, 1))
        self.assertEqual(summary["metrics"]["valid_output"], {"n": 1, "passed": 0, "rate": 0.0})
        self.assertEqual(summary["observed_models"], ["m-observed"])


class ScoringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bakeoff.use_assets(REAL_ASSETS)

    def test_a_grounded_reply_is_checked_for_its_content(self):
        case = bakeoff.CASE_BY_ID["deep-bakeoff-d01"]
        good = json.loads(bakeoff.calibration_for(case))
        self.assertTrue(bakeoff.score_case(case, json.dumps(good))["passed"])
        # right shape, real quotes, and every output wrong: this used to pass
        wrong = dict(good, output="This output is wrong in every particular. " * 30)
        result = bakeoff.score_case(case, json.dumps(wrong))
        self.assertFalse(result["passed"])
        self.assertTrue(result["structure"])
        self.assertIn("retains ACCOUNT_NOT_ELIGIBLE", result["failures"])
        # one required term missing is one failed check
        partial = dict(good, output=good["output"].replace("409", ""))
        self.assertEqual(bakeoff.score_case(case, json.dumps(partial))["failures"], ["retains 409"])

    def test_a_forbidden_term_fails_a_grounded_reply(self):
        case = dict(bakeoff.CASE_BY_ID["deep-bakeoff-d01"], expected={"forbidden": ["PrivilegeGate"]})
        good = json.loads(bakeoff.calibration_for(dict(case, expected={})))
        self.assertEqual(bakeoff.score_case(case, json.dumps(good))["failures"], ["omits PrivilegeGate"])

    def test_every_public_grounded_case_has_terms_and_one_without_is_labelled(self):
        grounded = [case for case in bakeoff.CASES if case["variant"] in bakeoff.GROUNDED_TASKS]
        self.assertEqual(len(grounded), 27)
        self.assertTrue(all(bakeoff.has_content_terms(case) for case in grounded))
        self.assertEqual(bakeoff.grounded_scope(grounded), {"cases": 27, "with_content_terms": 27, "scope": "format, grounding and content terms"})
        bare = dict(grounded[0], expected={})
        self.assertEqual(bakeoff.grounded_scope([bare])["scope"], "format and grounding only")
        self.assertIn("content terms for 27 of 28", bakeoff.grounded_scope(grounded + [bare])["scope"])
        self.assertIsNone(bakeoff.grounded_scope([bakeoff.CASE_BY_ID["distill-queue-knowledge"]]))
        # a case without terms passes on a wrong deliverable, which is what the label says
        calibration = json.loads(bakeoff.calibration_for(bare))
        calibration["output"] = "This output is wrong in every particular. " * 30
        self.assertTrue(bakeoff.score_case(bare, json.dumps(calibration))["passed"])

    def test_a_yaml_block_list_in_the_frontmatter_is_read(self):
        text = "---\ndescription: Queue recovery.\ntags:\n  - queue\n  - recovery\nupdated: 2030-06-14\n---\n# Title\nbody"
        frontmatter, body = bakeoff.parse_frontmatter(text)
        self.assertEqual(frontmatter["tags"], ["queue", "recovery"])
        self.assertEqual(frontmatter["description"], "Queue recovery.")
        self.assertEqual(body, "# Title\nbody")
        self.assertEqual(bakeoff.frontmatter_text(frontmatter["tags"]), "[queue, recovery]")
        # a folded description is one value, not its first line
        folded, _ = bakeoff.parse_frontmatter("---\ndescription: First line\n  and the second.\n---\nbody")
        self.assertEqual(folded["description"], "First line and the second.")
        case = bakeoff.CASE_BY_ID["distill-queue-knowledge"]
        reply = bakeoff.GOOD_OUTPUTS[case["id"]].replace("tags: [queue, recovery, checkpoint]", "tags:\n  - queue\n  - recovery\n  - checkpoint")
        self.assertIn("  - queue", reply)
        self.assertTrue(bakeoff.score_distill(case, reply)["structure"])

    def test_a_frontmatter_block_that_is_not_yaml_is_read_by_lines(self):
        frontmatter, body = bakeoff.parse_frontmatter("---\ndescription: Pause: then drain\ntags: [a, b]\nno colon here\n---\nbody")
        self.assertEqual(frontmatter, {"description": "Pause: then drain", "tags": "[a, b]"})
        self.assertEqual(body, "body")
        self.assertEqual(bakeoff.parse_frontmatter("no frontmatter"), (None, "no frontmatter"))

    def test_a_date_that_is_not_on_the_calendar_does_not_make_the_frontmatter_unreadable(self):
        # PyYAML raises a plain ValueError for these, not a YAMLError: the block is then read by lines
        for updated in ("2026-09-31", "2026-02-30", "2026-13-01", "2026-09-30T25:00:00Z"):
            frontmatter, body = bakeoff.parse_frontmatter(f"---\ndescription: Queue recovery.\nupdated: {updated}\n---\nbody")
            self.assertEqual(frontmatter, {"description": "Queue recovery.", "updated": updated}, updated)
            self.assertEqual(body, "body")
        case = bakeoff.CASE_BY_ID["distill-queue-knowledge"]
        reply = bakeoff.GOOD_OUTPUTS[case["id"]].replace("\ntags:", "\nupdated: 2026-09-31\ntags:", 1)
        self.assertIn("updated: 2026-09-31", reply)
        result = bakeoff.score_distill(case, reply)
        self.assertTrue(result["structure"])
        self.assertTrue(result["passed"], result["failures"])

    def test_graph_relations_must_run_the_expected_way(self):
        case = bakeoff.CASE_BY_ID["extract-release-graph"]
        good = json.loads(bakeoff.calibration_for(case))
        self.assertTrue(bakeoff.score_case(case, json.dumps(good))["passed"])
        turned = dict(good, relations=[dict(rel, **{"from": rel["to"], "to": rel["from"]}) for rel in good["relations"]])
        result = bakeoff.score_case(case, json.dumps(turned))
        self.assertFalse(result["passed"])
        self.assertIn("graph relation recall >= 65%", result["failures"])
        self.assertTrue(bakeoff.graph_pair_match(("a b", "c"), ("A  B", "C")))
        self.assertFalse(bakeoff.graph_pair_match(("c", "a b"), ("a b", "c")))
        # one reified node between the ends keeps the direction too
        self.assertTrue(bakeoff.graph_path_match([("a", "m"), ("m", "b")], ("a", "b")))
        self.assertFalse(bakeoff.graph_path_match([("m", "a"), ("m", "b")], ("a", "b")))
        self.assertFalse(bakeoff.graph_path_match([("b", "a")], ("a", "b")))

    def test_graph_entities_match_whole_names_not_sub_phrases(self):
        self.assertFalse(bakeoff.graph_phrase_match("Candidate Worker Service Image", "worker service"))
        self.assertFalse(bakeoff.graph_phrase_match("BundleAdapter interface", "BundleAdapter"))
        self.assertFalse(bakeoff.graph_phrase_match("worker", "worker service"))
        self.assertTrue(bakeoff.graph_phrase_match("Worker Services", "worker service"))
        self.assertTrue(bakeoff.graph_phrase_match("Object  Store", "object store"))
        self.assertFalse(bakeoff.graph_phrase_match("", ""))

    def test_an_observed_at_that_is_absent_null_or_empty_invents_no_date(self):
        case = bakeoff.CASE_BY_ID["enrich-signing-memory"]
        base = {"tags": ["artifact", "signature", "worker"], "description": "Artifacts need a signature from the worker."}
        for extra in ({}, {"observed_at": None}, {"observed_at": ""}, {"observed_at": "  "}):
            self.assertTrue(bakeoff.score_case(case, json.dumps({**base, **extra}))["passed"], extra)
        for extra in ({"observed_at": "2026-03-01"}, {"observed_at": False}):
            result = bakeoff.score_case(case, json.dumps({**base, **extra}))
            self.assertEqual(result["failures"], ["does not invent an observation date"], extra)
        dated = bakeoff.CASE_BY_ID["enrich-checkpoint-memory"]
        reply = {"tags": ["queue", "checkpoint", "recovery"], "description": "Queue checkpoint recovery after a failed rename.", "observed_at": "2026-02-14"}
        self.assertTrue(bakeoff.score_case(dated, json.dumps(reply))["passed"])
        self.assertFalse(bakeoff.score_case(dated, json.dumps({**reply, "observed_at": None}))["passed"])

    def test_a_closing_fence_goes_only_with_an_opening_one(self):
        ends_in_code = "Steps:\n```bash\nrun it\n```"
        self.assertEqual(bakeoff.strip_wrappers(ends_in_code), ends_in_code)
        self.assertEqual(bakeoff.strip_wrappers("```markdown\n# T\n\nbody\n```"), "# T\n\nbody")
        self.assertEqual(bakeoff.strip_wrappers('```json\n{"a": 1}\n```'), '{"a": 1}')
        self.assertEqual(bakeoff.strip_wrappers("```markdown\nUse:\n```bash\nrun\n```\n```"), "Use:\n```bash\nrun\n```")
        self.assertEqual(bakeoff.strip_wrappers("<think>hmm</think>\n```json\n[1]\n```"), "[1]")
        self.assertEqual(bakeoff.strip_wrappers(None), "")
        case = bakeoff.CASE_BY_ID["distill-queue-lesson"]
        lesson = bakeoff.GOOD_OUTPUTS[case["id"]]
        _frontmatter, body = bakeoff.parse_frontmatter(lesson + "\n\n```bash\nrelayctl restore\n```")
        self.assertTrue(body.endswith("```"))

    def test_prose_and_a_stray_bracket_around_the_json_do_not_lose_it(self):
        self.assertEqual(bakeoff.parse_json_value('{"a": 1}'), {"a": 1})
        self.assertEqual(bakeoff.parse_json_value('Here you go:\n{"a": 1}\nDone.'), {"a": 1})
        self.assertEqual(bakeoff.parse_json_value('See the {schema} first. {"a": 1}'), {"a": 1})
        self.assertEqual(bakeoff.parse_json_value('Use { to open it. {"a": [1, 2]} Enjoy.'), {"a": [1, 2]})
        self.assertEqual(bakeoff.parse_json_value('Here: [{"a": 1}, {"a": 2}] done'), [{"a": 1}, {"a": 2}])
        self.assertEqual(bakeoff.parse_json_value("```json\n[1, 2]\n```"), [1, 2])
        self.assertEqual(bakeoff.parse_json_value('{"a": 1} and then {"b": 2}'), {"b": 2})  # the value that ends the reply
        self.assertIsNone(bakeoff.parse_json_value('{"a": 1} (see {note})'))
        self.assertIsNone(bakeoff.parse_json_value("no json {here"))
        self.assertIsNone(bakeoff.parse_json_value(""))
        self.assertIsNone(bakeoff.parse_json("[1, 2]"))  # parse_json wants an object

    def test_an_array_in_the_prose_before_the_answer_does_not_take_its_place(self):
        answer = '{"score": 4, "reason": "clear"}'
        for preamble in ("Result (see [1]):", "Scores are in [0, 5]. Answer:", "I checked the [] list first."):
            self.assertEqual(bakeoff.parse_json_value(f"{preamble}\n{answer}"), {"score": 4, "reason": "clear"}, preamble)
            self.assertEqual(bakeoff.parse_json(f"{preamble}\n{answer}\n\nDone."), {"score": 4, "reason": "clear"}, preamble)
        # an answer that is an array stays whole, and one case passes as it did without the preamble
        self.assertEqual(bakeoff.parse_json_value('Scores [1]:\n[{"a": 1}, {"a": 2}]'), [{"a": 1}, {"a": 2}])
        case = bakeoff.CASE_BY_ID["judge-strong-lesson"]
        calibration = bakeoff.calibration_for(case)
        self.assertTrue(bakeoff.score_reply(case, calibration)["passed"])
        for preamble in ("Result (see [1]):", "Scores are in [0, 5]. Answer:", "I checked the [] list first."):
            self.assertTrue(bakeoff.score_reply(case, f"{preamble}\n{calibration}")["passed"], preamble)

    def test_a_reply_cut_off_inside_its_json_is_not_a_valid_output(self):
        # an inner object or array of the cut reply may read as JSON, but the shape checks reject it
        for case_id in ("consolidate-memory-pool", "deep-bakeoff-d01", "infer-checkpoint-memory"):
            case = bakeoff.CASE_BY_ID[case_id]
            calibration = bakeoff.calibration_for(case)
            for share in (0.3, 0.5, 0.8, 0.95):
                result = bakeoff.score_reply(case, calibration[: int(len(calibration) * share)])
                self.assertFalse(result["structure"], (case_id, share))
                self.assertFalse(result["passed"], (case_id, share))


class RepeatTest(unittest.TestCase):
    def test_spread_is_min_max_and_mean_of_every_number_in_the_shape_of_the_metrics(self):
        spread = bakeoff.spread_of(
            [
                {"rate": 0.5, "n": 4, "by": {"x": {"k": 1}}, "text": "a", "flag": True, "list": [1]},
                {"rate": 1, "n": 4, "by": {"x": {"k": 2}}, "text": "b", "flag": False, "list": [2]},
                {"rate": 0.75, "n": 4, "by": {"x": {"k": 4}}, "text": "c", "flag": True, "list": [3]},
            ]
        )
        self.assertEqual(spread["rate"], {"min": 0.5, "max": 1, "mean": 0.75})
        self.assertEqual(spread["n"], {"min": 4, "max": 4, "mean": 4})
        self.assertEqual(spread["by"], {"x": {"k": {"min": 1, "max": 4, "mean": 2.3333}}})
        self.assertEqual((spread["text"], spread["flag"], spread["list"]), (None, None, None))  # not numbers

    def test_a_null_is_left_out_and_a_number_null_in_every_run_is_null(self):
        self.assertEqual(
            bakeoff.spread_of([{"rate": None, "share": None}, {"rate": 0.5, "share": None}, {"rate": 1, "share": None}]),
            {"rate": {"min": 0.5, "max": 1, "mean": 0.75}, "share": None},
        )

    def test_a_key_only_some_runs_have_is_spread_over_those_runs(self):
        self.assertEqual(
            bakeoff.spread_of([{"by": {"a": {"n": 2}}}, {"by": {"a": {"n": 4}, "b": {"n": 1}}}]),
            {"by": {"a": {"n": {"min": 2, "max": 4, "mean": 3}}, "b": {"n": {"min": 1, "max": 1, "mean": 1}}}},
        )


@contextlib.contextmanager
def sandbox(private=False, seed="42"):
    """A stand-in repository root with the public assets linked in as the public corpus (and as the private one, if asked), so a run writes to a temporary folder."""
    try:
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            eval_dir = root / "evals" / "bakeoff"
            (eval_dir / "results").mkdir(parents=True)
            (eval_dir / "assets").symlink_to(REAL_ASSETS)
            if private:
                (root / "private" / "bakeoff" / "results").mkdir(parents=True)
                (root / "private" / "bakeoff" / "assets").symlink_to(REAL_ASSETS)
                (root / "private" / "bakeoff" / "map.json").write_text(json.dumps({"version": 1, "seed": seed}))
            with mock.patch.object(bakeoff, "ROOT", root), mock.patch.object(bakeoff, "EVAL_DIR", eval_dir):
                yield root
    finally:
        bakeoff.use_assets(REAL_ASSETS)


def run_cli(*argv, env=None):
    """bakeoff.main(["run", ...]) with the environment as given and nothing else of MODEL_* in it. Returns the exit code, stdout and stderr."""
    environ = {"PATH": os.environ.get("PATH", ""), **(env or {})}
    with mock.patch.dict(os.environ, environ, clear=True), contextlib.redirect_stdout(io.StringIO()) as out, contextlib.redirect_stderr(io.StringIO()) as err:
        code = bakeoff.main(["run", *argv])
    return code, out.getvalue(), err.getvalue()


def today():
    return f"{datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d}"


class RunTest(unittest.TestCase):
    def env(self, endpoint, **more):
        return {"MODEL_BASE_URL": endpoint.base_url, "MODEL_API_KEY": "sk-test-secret-1", "MODEL_NAME": "the-model", **more}

    def summaries(self, root, corpus="public"):
        parent = root / "evals" / "bakeoff" / "results" if corpus == "public" else root / "private" / "bakeoff" / "results"
        return {path.name: json.loads((path / "summary.json").read_text()) for path in sorted(parent.iterdir()) if path.is_dir()}

    def test_the_summary_holds_what_reproduces_the_run_and_no_key(self):
        with FakeEndpoint([(200, reply("not json"))]) as endpoint, sandbox() as root:
            code, output, _err = run_cli("--limit", "2", "--label", "t", env=self.env(endpoint))
            self.assertEqual(code, 0, output)
            ((name, summary),) = self.summaries(root).items()
            text = (root / "evals" / "bakeoff" / "results" / name / "summary.json").read_text()
        self.assertNotIn("sk-test-secret-1", text)
        self.assertEqual(name, f"{today()}-t")
        self.assertEqual(summary["prompts_version"], "0.9.15-style")
        self.assertEqual((summary["include_legacy"], summary["legacy_cases"], summary["n_cases"], summary["n_selected"]), (False, 32, 120, 2))
        self.assertIsNone(summary["seed"])
        self.assertIsNone(summary["models_file"])
        self.assertIsNone(summary["grounded"])
        self.assertEqual(summary["cases_sha256"], hashlib.sha256((REAL_ASSETS / "cases.json").read_bytes()).hexdigest())
        self.assertEqual(summary["assets_sha256"], bakeoff.sha256_tree(REAL_ASSETS))
        self.assertRegex(summary["git_commit"], r"^\S+$")
        self.assertRegex(summary["harness_sha256"], r"^[0-9a-f]{64}$")
        self.assertEqual(summary["harness_sha256"], bakeoff.harness_sha256())
        self.assertEqual((summary["status"], summary["aborted_reason"]), ("complete", None))
        (model,) = summary["models"]
        self.assertEqual(
            model["settings"],
            {"base_url": endpoint.base_url, "api_key_env": "MODEL_API_KEY", "private": False, "temperature": 0, "max_tokens": 6000, "seed": None, "extra_body": {}, "timeout": 900, "retries": 5},
        )
        self.assertIsNone(model["legacy_jobs"])

    def test_a_model_that_got_no_reply_makes_the_summary_aborted_before_the_run_exits_with_1(self):
        with FakeEndpoint([(400, {"error": "no"})]) as endpoint, sandbox() as root:
            code, _output, err = run_cli("--limit", "5", "--label", "dead", env=self.env(endpoint))
            ((_name, summary),) = self.summaries(root).items()
            requests = len(endpoint.requests)
        reason = "no request to the-model got a reply. Check its base_url, model name and key."
        self.assertEqual(code, 1)
        self.assertEqual((summary["status"], summary["aborted_reason"]), ("aborted", reason))
        self.assertIn(reason, err)
        # it gave up on the model after three requests, so it covers 3 of the 5 cases it selected
        self.assertEqual((requests, summary["n_selected"], summary["n_run"], summary["n_scored"], summary["n_errored"]), (3, 5, 3, 0, 3))
        self.assertRegex(summary["harness_sha256"], r"^[0-9a-f]{64}$")

    def test_only_a_model_that_did_not_get_through_makes_the_run_aborted(self):
        models = [{"label": "good", "n_run": 4, "n_scored": 3}, {"label": "dead", "n_run": 3, "n_scored": 0}, {"label": "cut", "n_run": 2, "n_scored": 2}]
        self.assertEqual(bakeoff.stalled_models(models, 4), ["dead", "cut"])
        self.assertEqual(bakeoff.stalled_models(models[:1], 4), [])
        self.assertEqual(bakeoff.stalled_models([{"label": "none", "n_run": 0, "n_scored": 0}], 0), [])

    def test_the_summary_names_the_models_file_by_path_and_digest_and_says_what_the_grounded_cases_are_checked_for(self):
        with FakeEndpoint([(200, reply("not json"))]) as endpoint, sandbox() as root:
            models = root / "models.yaml"
            models.write_text(f"models:\n  - {{label: a, model: ma, base_url: '{endpoint.base_url}', seed: 9, extra_body: {{api_key: sk-in-body}}}}\n")
            code, output, _err = run_cli("--models", str(models), "--tier", "deep", "--limit", "2", env={})
            self.assertEqual(code, 0, output)
            ((name, summary),) = self.summaries(root).items()
            digest = hashlib.sha256(models.read_bytes()).hexdigest()
        self.assertEqual(name, f"{today()}-models")  # the label is the models file's name
        self.assertEqual(summary["models_file"], {"path": "models.yaml", "sha256": digest})
        self.assertEqual(summary["grounded"], {"cases": 2, "with_content_terms": 2, "scope": "format, grounding and content terms"})
        (model,) = summary["models"]
        self.assertEqual((model["settings"]["seed"], model["settings"]["extra_body"]), (9, {"api_key": "<redacted>", "seed": 9}))
        self.assertEqual(endpoint.requests[0]["body"]["seed"], 9)
        self.assertEqual(endpoint.requests[0]["body"]["api_key"], "sk-in-body")  # redacted in the summary, sent as written

    def test_model_flags_pick_models_the_way_lib_models_does(self):
        with FakeEndpoint([(200, reply("{}"))]) as gateway, FakeEndpoint([(200, reply("{}"))]) as cloud, sandbox() as root:
            (root / "models.json").write_text(json.dumps({"cloud-model": {"base_url": cloud.base_url, "api_key_env": "CLOUD_KEY", "model": "real-name", "private": True}}))
            env = self.env(gateway, CLOUD_KEY="sk-cloud-secret-2")
            code, output, _err = run_cli("--model", "gw-model", "--model", "cloud-model", "--limit", "1", env=env)
            self.assertEqual(code, 0, output)
            ((name, summary),) = self.summaries(root).items()
            text = (root / "evals" / "bakeoff" / "results" / name / "summary.json").read_text()
        self.assertEqual(name, f"{today()}-gw-model-cloud-model")
        self.assertEqual((gateway.requests[0]["body"]["model"], gateway.requests[0]["auth"]), ("gw-model", "Bearer sk-test-secret-1"))
        self.assertEqual((cloud.requests[0]["body"]["model"], cloud.requests[0]["auth"]), ("real-name", "Bearer sk-cloud-secret-2"))
        self.assertEqual([(m["label"], m["model"], m["settings"]["private"], m["settings"]["api_key_env"]) for m in summary["models"]], [("gw-model", "gw-model", False, "MODEL_API_KEY"), ("cloud-model", "real-name", True, "CLOUD_KEY")])
        for secret in ("sk-test-secret-1", "sk-cloud-secret-2"):
            self.assertNotIn(secret, text)

    def test_model_and_models_together_and_a_bad_repeat_are_refused(self):
        with FakeEndpoint([(200, reply("{}"))]) as endpoint, sandbox():
            code, _out, err = run_cli("--model", "a", "--models", "m.yaml", env=self.env(endpoint))
            self.assertEqual(code, 2)
            self.assertIn("not both", err)
            code, _out, err = run_cli("--repeat", "0", env=self.env(endpoint))
            self.assertEqual(code, 2)
            self.assertIn("--repeat", err)
            self.assertEqual(endpoint.requests, [])

    def test_a_private_run_records_the_seed_of_its_assets_and_no_marker_is_left_between_corpora(self):
        with FakeEndpoint([(200, reply("not json"))]) as endpoint, sandbox(private=True, seed="777") as root:
            code, output, _err = run_cli("--corpus", "all", "--limit", "1", "--label", "t", env=self.env(endpoint))
            self.assertEqual(code, 0, output)
            (public,) = self.summaries(root, "public").values()
            (private,) = self.summaries(root, "private").values()
            self.assertIn("side by side", output)
            # the process is still alive, so a marker left in either folder would show here
            self.assertEqual(list(root.rglob(".running")), [])
        self.assertIsNone(public["seed"])
        self.assertEqual((private["corpus"], private["seed"]), ("private", "777"))

    def test_repeat_runs_into_numbered_folders_and_writes_the_spread(self):
        with FakeEndpoint([(200, reply("not json"))]) as endpoint, sandbox() as root:
            results = root / "evals" / "bakeoff" / "results"
            alive = []
            real_run_model = bakeoff.run_model

            def spy(model, cases, samples):
                alive.append(sorted(path.parent.name for path in results.glob("*/.running")))
                return real_run_model(model, cases, samples)

            with mock.patch.object(bakeoff, "run_model", spy):
                code, output, _err = run_cli("--limit", "1", "--repeat", "3", "--label", "rep", env=self.env(endpoint))
            self.assertEqual(code, 0, output)
            names = sorted(path.name for path in results.iterdir())
            stored = json.loads((results / f"{today()}-rep-repeat-summary.json").read_text())
            runs = self.summaries(root)
        day = today()
        # each run's .running file is gone when that run is done, while the next one goes on
        self.assertEqual(alive, [[f"{day}-rep-r1"], [f"{day}-rep-r2"], [f"{day}-rep-r3"]])
        self.assertEqual(names, [f"{day}-rep-r1", f"{day}-rep-r2", f"{day}-rep-r3", f"{day}-rep-repeat-summary.json"])
        self.assertEqual(sorted(runs), names[:3])
        self.assertEqual({run["label"] for run in runs.values()}, {"rep-r1", "rep-r2", "rep-r3"})
        self.assertEqual((stored["eval"], stored["corpus"], stored["label"], stored["repeat"], stored["model"]), ("bakeoff", "public", "rep", 3, "the-model"))
        self.assertEqual(stored["runs"], names[:3])
        self.assertEqual(stored["prompts_version"], "0.9.15-style")
        self.assertEqual(stored["n_errored"], {"min": 0, "max": 0, "mean": 0})
        self.assertEqual(set(stored["seconds"]), {"min", "max", "mean"})
        self.assertEqual(stored["metrics"]["valid_output"]["rate"], {"min": 0.0, "max": 0.0, "mean": 0.0})
        self.assertEqual(stored["metrics"]["valid_output"]["n"], {"min": 1, "max": 1, "mean": 1})
        (by_model,) = stored["models"]
        self.assertEqual((by_model["label"], by_model["model"], by_model["metrics"]), ("the-model", "the-model", stored["metrics"]))

    def test_repeat_with_both_corpora_writes_a_spread_for_each_and_no_side_by_side(self):
        with FakeEndpoint([(200, reply("not json"))]) as endpoint, sandbox(private=True) as root:
            code, output, _err = run_cli("--corpus", "all", "--limit", "1", "--repeat", "2", "--label", "rep", env=self.env(endpoint))
            self.assertEqual(code, 0, output)
            public = sorted(path.name for path in (root / "evals" / "bakeoff" / "results").iterdir())
            private = sorted(path.name for path in (root / "private" / "bakeoff" / "results").iterdir())
        self.assertNotIn("side by side", output)
        for names in (public, private):
            self.assertEqual(names, [f"{today()}-rep-r1", f"{today()}-rep-r2", f"{today()}-rep-repeat-summary.json"])

    def test_legacy_cases_run_only_with_include_legacy_and_are_read_apart(self):
        with FakeEndpoint([(200, reply("{}"))]) as endpoint, sandbox() as root:
            code, output, _err = run_cli("--tier", "compact", "--label", "plain", env=self.env(endpoint))
            self.assertEqual(code, 0, output)
            self.assertEqual(len(endpoint.requests), 40)  # 52 compact cases less the 12 legacy ones
            self.assertIn("12 legacy cases skipped", output)
            code, output, _err = run_cli("--tier", "compact", "--include-legacy", "--label", "all", env=self.env(endpoint))
            self.assertEqual(code, 0, output)
            self.assertEqual(len(endpoint.requests), 40 + 52)
            plain = self.summaries(root)[f"{today()}-plain"]
            everything = self.summaries(root)[f"{today()}-all"]
            samples = [json.loads(line) for line in (root / "evals" / "bakeoff" / "results" / f"{today()}-all" / "samples.jsonl").read_text().splitlines()]
        self.assertEqual((plain["include_legacy"], plain["n_selected"], plain["models"][0]["legacy_jobs"]), (False, 40, None))
        self.assertEqual((everything["include_legacy"], everything["n_selected"]), (True, 52))
        self.assertEqual(everything["models"][0]["legacy_jobs"]["n"], 12)
        self.assertEqual(sum(row["legacy"] for row in samples), 12)
        self.assertEqual({row["process"] for row in samples if row["legacy"]}, {"graph_extraction", "metadata_enhance", "reflect_proposal"})
        self.assertIn("legacy jobs", output)


class ProvenanceTest(unittest.TestCase):
    def test_the_digest_of_a_folder_changes_with_a_name_or_a_content_and_not_with_the_place(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = pathlib.Path(tmp, "a"), pathlib.Path(tmp, "b")
            for folder in (first, second):
                (folder / "sub").mkdir(parents=True)
                (folder / "cases.json").write_text("[]")
                (folder / "sub" / "x.md").write_text("x")
            digest = bakeoff.sha256_tree(first)
            self.assertRegex(digest, r"^[0-9a-f]{64}$")
            self.assertEqual(bakeoff.sha256_tree(second), digest)
            (second / "sub" / "x.md").write_text("y")
            self.assertNotEqual(bakeoff.sha256_tree(second), digest)
            (second / "sub" / "x.md").write_text("x")
            (second / "sub" / "x.md").rename(second / "sub" / "z.md")
            self.assertNotEqual(bakeoff.sha256_tree(second), digest)

    def checkout(self, tmp, name):
        """A copy of bakeoff's src folder at evals/bakeoff/src of a stand-in repository, without the environment and the caches."""
        root = pathlib.Path(tmp, name)
        shutil.copytree(bakeoff.HERE, root / "evals" / "bakeoff" / "src", ignore=shutil.ignore_patterns(".venv", "__pycache__", "node_modules"))
        return root

    def digest(self, root):
        return bakeoff.harness_sha256(root / "evals" / "bakeoff" / "src", root)

    def test_the_digest_of_the_code_is_the_same_in_two_checkout_paths(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = self.checkout(tmp, "one"), self.checkout(tmp, "two")
            digest = self.digest(first)
            self.assertRegex(digest, r"^[0-9a-f]{64}$")
            self.assertEqual(self.digest(second), digest)
        self.assertEqual(bakeoff.harness_sha256(), digest)  # and it is the digest of this checkout, the one a run writes

    def test_an_edit_to_the_code_changes_the_digest_and_an_edit_to_a_test_a_readme_or_a_fixture_does_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = self.checkout(tmp, "one")
            src = root / "evals" / "bakeoff" / "src"
            digest = self.digest(root)
            for name in ("test_bakeoff.py", "README.md", "pyproject.toml", "fixtures/case.py", "tests/test_more.py"):
                path = src / name
                path.parent.mkdir(exist_ok=True)
                with path.open("a", encoding="utf-8") as handle:
                    handle.write("\n# edited\n")
                self.assertEqual(self.digest(root), digest, name)
            with (src / "bakeoff.py").open("a", encoding="utf-8") as handle:
                handle.write("\n# edited\n")
            edited = self.digest(root)
            self.assertNotEqual(edited, digest)
            (src / "helper.py").write_text("X = 1\n", encoding="utf-8")  # a file added
            added = self.digest(root)
            self.assertNotEqual(added, edited)
            (src / "helper.py").rename(src / "other.py")  # and renamed
            self.assertNotEqual(self.digest(root), added)

    def test_the_manifest_is_the_one_lib_provenance_ts_makes(self):
        # The same files and the same digest as the last test of harnessSha256 in lib/provenance.test.ts: a path from the root, a content digest, sorted.
        with tempfile.TemporaryDirectory() as tmp:
            root = pathlib.Path(tmp)
            src = root / "evals" / "bakeoff" / "src"
            src.mkdir(parents=True)
            (src / "helper.py").write_text("X = 1\n")
            (src / "bakeoff.py").write_text("print('a')\n")
            (src / "test_bakeoff.py").write_text("ignored\n")
            self.assertEqual(bakeoff.harness_sha256(src, root), "aa0d380a5736fa683bc2cb7aa9dec98f860df640d388f41e0a0eeed36a5a5129")

    def test_the_private_seed_is_the_one_in_the_map_beside_the_assets(self):
        with sandbox(private=True, seed="12345"):
            self.assertEqual(bakeoff.private_seed(), "12345")
        with sandbox():
            self.assertIsNone(bakeoff.private_seed())


def slot(expected, key, where):
    """The list (or dict) and the index that hold the term at `where` under `key`: () is a scalar, (i,) a list item, (i, j) the end of a pair."""
    if not where:
        return expected, key
    target = expected[key]
    for index in where[:-1]:
        target = target[index]
    return target, where[-1]


class CheckAssetsTest(unittest.TestCase):
    def test_every_kind_of_term_is_kept_matching_the_files(self):
        # (case, key, where the term sits): each edit moves a term to one that is in the files where the original was not, or the other way round
        edits = [
            ("distill-queue-knowledge", "forbidden", (0,)),
            ("extract-release-graph", "entities", (0,)),
            ("extract-release-graph", "relations", (0, 0)),
            ("prod-graph-chunked-workflow", "forbidden_entities", (0,)),
            ("infer-checkpoint-memory", "date", ()),
            ("enrich-checkpoint-memory", "observed_at", ()),
            ("prod-reflect-workflow-preservation", "append", ()),
            ("deep-bakeoff-d01", "required", (0,)),
        ]
        for case_id, key, where in edits:
            with self.subTest(case=case_id, key=key), tempfile.TemporaryDirectory() as tmp:
                copy = pathlib.Path(tmp, "copy")
                shutil.copytree(REAL_ASSETS, copy)
                self.assertEqual(bakeoff.term_errors(copy, REAL_ASSETS), [])
                cases = json.loads((copy / "cases.json").read_text(encoding="utf-8"))
                case = next(case for case in cases if case["id"] == case_id)
                container, last = slot(case["expected"], key, where)
                original = container[last]
                text = bakeoff.source_text(REAL_ASSETS, next(c for c in json.loads((REAL_ASSETS / "cases.json").read_text(encoding="utf-8")) if c["id"] == case_id))
                container[last] = "zzzqqq not there" if original.lower() in text else "the"
                (copy / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
                errors = bakeoff.term_errors(copy, REAL_ASSETS)
                self.assertTrue(any(f"the {key} term" in error for error in errors), errors)

    def test_the_entities_and_relations_of_a_graph_batch_are_kept_matching_too(self):
        with tempfile.TemporaryDirectory() as tmp:
            copy = pathlib.Path(tmp, "copy")
            shutil.copytree(REAL_ASSETS, copy)
            cases = json.loads((copy / "cases.json").read_text(encoding="utf-8"))
            case = next(case for case in cases if case["id"] == "prod-graph-batch-with-empty")
            text = bakeoff.source_text(REAL_ASSETS, case)

            def flip(term):  # a term that is in the files where the original was not, or the other way round
                return "zzzqqq not there" if term.lower() in text else "the"

            item = case["expected"]["items"][0]
            item["entities"][0] = flip(item["entities"][0])
            item["relations"][0][1] = flip(item["relations"][0][1])
            (copy / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
            errors = bakeoff.term_errors(copy, REAL_ASSETS)
        for key in ("entities", "relations"):
            self.assertTrue(any(f"the {key} term" in error for error in errors), errors)

    def test_a_ref_that_is_none_of_the_case_s_files_is_an_error(self):
        edits = [
            ("consolidate-memory-pool", "delete", 0, "memories/gone"),
            ("consolidate-memory-pool", "merge", (0, 0), "memories/gone"),
            ("consolidate-conflicting-memories", "contradict", (0, 1), "memories/gone"),
            ("prod-consolidate-full-pool", "queued", 0, "memories/gone"),
            ("triage-accept-grounded-reflection", "ref", None, "knowledge/other"),
        ]
        for case_id, key, where, new in edits:
            with self.subTest(case=case_id, key=key), tempfile.TemporaryDirectory() as tmp:
                copy = pathlib.Path(tmp, "copy")
                shutil.copytree(REAL_ASSETS, copy)
                cases = json.loads((copy / "cases.json").read_text(encoding="utf-8"))
                expected = next(case for case in cases if case["id"] == case_id)["expected"]
                if where is None:
                    expected[key] = new
                elif isinstance(where, tuple):
                    expected[key][where[0]][where[1]] = new
                else:
                    expected[key][where] = new
                (copy / "cases.json").write_text(json.dumps(cases), encoding="utf-8")
                with contextlib.redirect_stdout(io.StringIO()) as out:
                    self.assertEqual(bakeoff.command_check_assets(type("Args", (), {"assets": str(copy)})()), 1)
                self.assertIn(f"the {key} ref {new!r}", out.getvalue())
        bakeoff.use_assets(REAL_ASSETS)


class RunningMarkerTest(unittest.TestCase):
    """The .running marker of lib/results.ts: the pid while the run is alive, gone when it ends."""

    def start(self, parent, after):
        code = f"import bakeoff, pathlib, time\nprint(bakeoff.make_results_dir(pathlib.Path({str(parent)!r}), 'x'), flush=True)\n{after}"
        proc = subprocess.Popen([sys.executable, "-c", code], cwd=pathlib.Path(__file__).parent, stdout=subprocess.PIPE, text=True)
        self.addCleanup(proc.stdout.close)
        return pathlib.Path(proc.stdout.readline().strip()), proc

    def test_marker_holds_the_pid_and_is_gone_after_a_normal_end(self):
        with tempfile.TemporaryDirectory() as parent:
            folder, proc = self.start(parent, "time.sleep(0.3)")
            self.assertEqual((folder / ".running").read_text().strip(), str(proc.pid))
            self.assertEqual(proc.wait(), 0)
            self.assertFalse((folder / ".running").exists())

    def test_kill_of_the_pid_in_the_file_stops_the_run_and_removes_it(self):
        with tempfile.TemporaryDirectory() as parent:
            folder, proc = self.start(parent, "time.sleep(60)")
            os.kill(int((folder / ".running").read_text()), signal.SIGTERM)
            self.assertEqual(proc.wait(), -signal.SIGTERM)
            self.assertFalse((folder / ".running").exists())


if __name__ == "__main__":
    unittest.main()
