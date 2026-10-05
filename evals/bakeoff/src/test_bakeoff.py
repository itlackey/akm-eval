"""Tests for the bakeoff harness. Run: uv run --project evals/bakeoff/src --frozen python -m unittest discover -s evals/bakeoff/src"""

import contextlib
import http.server
import io
import json
import pathlib
import shutil
import tempfile
import threading
import time
import unittest

import bakeoff


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
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, tier="deep")), 68)
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, tier="compact", limit=20)), 20)
        self.assertEqual(len(bakeoff.select_cases(bakeoff.CASES, limit=500)), 120)

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


class ModelsTest(unittest.TestCase):
    def test_the_environment_names_one_model(self):
        env = {"MODEL_BASE_URL": "http://localhost:8080/v1", "MODEL_API_KEY": "k", "MODEL_NAME": "Org/Model-1"}
        (model,) = bakeoff.load_models(None, env)
        self.assertEqual((model["label"], model["model"], model["api_key"]), ("org-model-1", "Org/Model-1", "k"))
        self.assertEqual((model["temperature"], model["max_tokens"]), (0, 6000))
        with self.assertRaisesRegex(ValueError, "MODEL_BASE_URL"):
            bakeoff.load_models(None, {})

    def test_a_models_file_lists_models_and_takes_keys_from_the_environment(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp, "models.yaml")
            path.write_text(
                "models:\n"
                "  - {label: a, model: ma, base_url: 'http://a/v1'}\n"
                "  - {label: b, model: mb, base_url: 'http://b/v1', api_key_env: B_KEY, temperature: null, max_tokens: 100, extra_body: {x: 1}}\n"
            )
            first, second = bakeoff.load_models(str(path), {"B_KEY": "secret"})
            self.assertIsNone(first["api_key"])
            self.assertEqual((second["api_key"], second["temperature"], second["max_tokens"], second["extra_body"]), ("secret", None, 100, {"x": 1}))
            with self.assertRaisesRegex(ValueError, "B_KEY is not set"):
                bakeoff.load_models(str(path), {})
            path.write_text("models:\n  - {label: a, model: m, base_url: u}\n  - {label: a, model: m, base_url: u}\n")
            with self.assertRaisesRegex(ValueError, "labels must be different"):
                bakeoff.load_models(str(path), {})
            path.write_text("models:\n  - {label: a, model: m, base_url: u, seed: 1}\n")
            with self.assertRaisesRegex(ValueError, "unknown option"):
                bakeoff.load_models(str(path), {})

    def test_the_example_file_loads(self):
        models = bakeoff.load_models(str(bakeoff.EVAL_DIR / "models.example.yaml"), {"HOSTED_API_KEY": "k"})
        self.assertEqual([model["label"] for model in models], ["local-qwen", "hosted-model"])


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


if __name__ == "__main__":
    unittest.main()
