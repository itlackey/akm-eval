#!/usr/bin/env bun
/**
 * OpenViking API client — CLI wrapper for interacting with an OpenViking server.
 *
 * Usage:
 *   bun run ov-client.ts <command> [options]
 *
 * Environment:
 *   OPENVIKING_URL      Base URL (default: http://localhost:1933)
 *   OPENVIKING_API_KEY  API key (default: reads from config file)
 *   OPENVIKING_ACCOUNT  Account header (optional, for root key impersonation)
 *   OPENVIKING_USER     User header (optional, for root key impersonation)
 *   OPENVIKING_AGENT    Agent header (optional)
 */

const BASE_URL = process.env.OPENVIKING_URL ?? "http://localhost:1933";
const API_KEY = process.env.OPENVIKING_API_KEY ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RequestOptions {
	method: "GET" | "POST" | "DELETE" | "PUT";
	path: string;
	body?: unknown;
	query?: Record<string, string>;
	formData?: FormData;
}

async function request<T = unknown>(opts: RequestOptions): Promise<T> {
	const url = new URL(opts.path, BASE_URL);
	if (opts.query) {
		for (const [k, v] of Object.entries(opts.query)) {
			url.searchParams.set(k, v);
		}
	}

	const headers: Record<string, string> = {};

	if (API_KEY) {
		headers["x-api-key"] = API_KEY;
	}
	if (process.env.OPENVIKING_ACCOUNT) {
		headers["X-OpenViking-Account"] = process.env.OPENVIKING_ACCOUNT;
	}
	if (process.env.OPENVIKING_USER) {
		headers["X-OpenViking-User"] = process.env.OPENVIKING_USER;
	}
	if (process.env.OPENVIKING_AGENT) {
		headers["X-OpenViking-Agent"] = process.env.OPENVIKING_AGENT;
	}

	let fetchBody: BodyInit | undefined;
	if (opts.formData) {
		fetchBody = opts.formData;
	} else if (opts.body !== undefined) {
		headers["Content-Type"] = "application/json";
		fetchBody = JSON.stringify(opts.body);
	}

	const res = await fetch(url.toString(), {
		method: opts.method,
		headers,
		body: fetchBody,
	});

	const json = (await res.json()) as T;
	return json;
}

function output(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

function die(msg: string): never {
	console.error(`Error: ${msg}`);
	process.exit(1);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function health() {
	const data = await request({ method: "GET", path: "/health" });
	output(data);
}

async function status() {
	const data = await request({
		method: "GET",
		path: "/api/v1/system/status",
	});
	output(data);
}

async function observerSystem() {
	const data = await request({
		method: "GET",
		path: "/api/v1/observer/system",
	});
	output(data);
}

async function search(query: string, opts: Record<string, string>) {
	const body: Record<string, unknown> = { query };
	if (opts["target-uri"]) body.target_uri = opts["target-uri"];
	if (opts.limit) body.limit = parseInt(opts.limit, 10);
	if (opts["score-threshold"])
		body.score_threshold = parseFloat(opts["score-threshold"]);
	const data = await request({
		method: "POST",
		path: "/api/v1/search/search",
		body,
	});
	output(data);
}

async function find(query: string, opts: Record<string, string>) {
	const body: Record<string, unknown> = { query };
	if (opts["target-uri"]) body.target_uri = opts["target-uri"];
	if (opts.limit) body.limit = parseInt(opts.limit, 10);
	const data = await request({
		method: "POST",
		path: "/api/v1/search/find",
		body,
	});
	output(data);
}

async function grep(
	uri: string,
	pattern: string,
	opts: Record<string, string>,
) {
	const body: Record<string, unknown> = { uri, pattern };
	if (opts["case-insensitive"]) body.case_insensitive = true;
	const data = await request({
		method: "POST",
		path: "/api/v1/search/grep",
		body,
	});
	output(data);
}

async function read(uri: string) {
	const data = await request({
		method: "GET",
		path: "/api/v1/content/read",
		query: { uri },
	});
	output(data);
}

async function ls(uri: string) {
	const data = await request({
		method: "GET",
		path: "/api/v1/fs/ls",
		query: { uri },
	});
	output(data);
}

async function tree(uri: string) {
	const data = await request({
		method: "GET",
		path: "/api/v1/fs/tree",
		query: { uri },
	});
	output(data);
}

async function uploadResource(
	filePath: string,
	to: string,
	opts: Record<string, string>,
) {
	// Step 1: temp upload
	const file = Bun.file(filePath);
	if (!(await file.exists())) die(`File not found: ${filePath}`);

	const formData = new FormData();
	formData.append("file", file);

	const uploadResult = await request<{
		status: string;
		result: { temp_path: string };
	}>({
		method: "POST",
		path: "/api/v1/resources/temp_upload",
		formData,
	});

	if (uploadResult.status !== "ok") {
		output(uploadResult);
		return;
	}

	// Step 2: add resource
	const body: Record<string, unknown> = {
		temp_path: uploadResult.result.temp_path,
		to,
		wait: true,
		timeout: parseInt(opts.timeout ?? "60", 10),
	};
	if (opts.reason) body.reason = opts.reason;

	const addResult = await request({
		method: "POST",
		path: "/api/v1/resources",
		body,
	});
	output(addResult);
}

async function sessionCreate() {
	const data = await request({
		method: "POST",
		path: "/api/v1/sessions",
		body: {},
	});
	output(data);
}

async function sessionList() {
	const data = await request({ method: "GET", path: "/api/v1/sessions" });
	output(data);
}

async function sessionGet(sessionId: string) {
	const data = await request({
		method: "GET",
		path: `/api/v1/sessions/${sessionId}`,
	});
	output(data);
}

async function sessionAddMessage(
	sessionId: string,
	role: string,
	content: string,
) {
	const data = await request({
		method: "POST",
		path: `/api/v1/sessions/${sessionId}/messages`,
		body: { role, content },
	});
	output(data);
}

async function sessionCommit(sessionId: string) {
	const data = await request({
		method: "POST",
		path: `/api/v1/sessions/${sessionId}/commit`,
		body: {},
	});
	output(data);
}

async function sessionExtract(sessionId: string) {
	const data = await request({
		method: "POST",
		path: `/api/v1/sessions/${sessionId}/extract`,
		body: {},
	});
	output(data);
}

async function accountCreate(accountId: string, adminUserId: string) {
	const data = await request({
		method: "POST",
		path: "/api/v1/admin/accounts",
		body: { account_id: accountId, admin_user_id: adminUserId },
	});
	output(data);
}

async function accountList() {
	const data = await request({
		method: "GET",
		path: "/api/v1/admin/accounts",
	});
	output(data);
}

async function userKey(accountId: string, userId: string) {
	const data = await request({
		method: "POST",
		path: `/api/v1/admin/accounts/${accountId}/users/${userId}/key`,
		body: {},
	});
	output(data);
}

// ---------------------------------------------------------------------------
// CLI parser
// ---------------------------------------------------------------------------

function parseOpts(args: string[]): {
	positional: string[];
	opts: Record<string, string>;
} {
	const positional: string[] = [];
	const opts: Record<string, string> = {};
	let i = 0;
	while (i < args.length) {
		const arg = args[i];
		if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const next = args[i + 1];
			if (next && !next.startsWith("--")) {
				opts[key] = next;
				i += 2;
			} else {
				opts[key] = "true";
				i++;
			}
		} else {
			positional.push(arg);
			i++;
		}
	}
	return { positional, opts };
}

const USAGE = `
OpenViking API Client

Usage: bun run ov-client.ts <command> [args] [--options]

Environment variables:
  OPENVIKING_URL       Server URL (default: http://localhost:1933)
  OPENVIKING_API_KEY   API key for authentication
  OPENVIKING_ACCOUNT   Account ID header (optional, root key only)
  OPENVIKING_USER      User ID header (optional, root key only)

Commands:
  health                                    Check server health
  status                                    System status
  observer                                  Full system observer (queue, vectordb, vlm)

  search <query> [--target-uri URI]         Semantic vector search
         [--limit N] [--score-threshold N]
  find <query> [--target-uri URI] [--limit N]  Find (semantic search variant)
  grep <uri> <pattern> [--case-insensitive] Text pattern search

  read <uri>                                Read file content
  ls <uri>                                  List directory
  tree <uri>                                Directory tree

  upload <file> <to-uri> [--reason TEXT]    Upload file and index as resource
         [--timeout N]

  session-create                            Create a new session
  session-list                              List sessions
  session-get <id>                          Get session details
  session-message <id> <role> <content>     Add message to session
  session-extract <id>                      Extract memories from session
  session-commit <id>                       Commit session

  account-create <account-id> <admin-user>  Create account (root key)
  account-list                              List accounts (root key)
  user-key <account-id> <user-id>           Regenerate user API key (root key)
`.trim();

async function main() {
	const rawArgs = process.argv.slice(2);
	if (rawArgs.length === 0) {
		console.log(USAGE);
		process.exit(0);
	}

	const { positional, opts } = parseOpts(rawArgs);
	const command = positional[0];

	if (!API_KEY && command !== "health") {
		die(
			"OPENVIKING_API_KEY is required. Set it or pass via environment variable.",
		);
	}

	switch (command) {
		case "health":
			return health();
		case "status":
			return status();
		case "observer":
			return observerSystem();

		case "search":
			if (!positional[1]) die("Usage: search <query>");
			return search(positional[1], opts);
		case "find":
			if (!positional[1]) die("Usage: find <query>");
			return find(positional[1], opts);
		case "grep":
			if (!positional[1] || !positional[2])
				die("Usage: grep <uri> <pattern>");
			return grep(positional[1], positional[2], opts);

		case "read":
			if (!positional[1]) die("Usage: read <uri>");
			return read(positional[1]);
		case "ls":
			if (!positional[1]) die("Usage: ls <uri>");
			return ls(positional[1]);
		case "tree":
			if (!positional[1]) die("Usage: tree <uri>");
			return tree(positional[1]);

		case "upload":
			if (!positional[1] || !positional[2])
				die("Usage: upload <file-path> <to-uri>");
			return uploadResource(positional[1], positional[2], opts);

		case "session-create":
			return sessionCreate();
		case "session-list":
			return sessionList();
		case "session-get":
			if (!positional[1]) die("Usage: session-get <session-id>");
			return sessionGet(positional[1]);
		case "session-message":
			if (!positional[1] || !positional[2] || !positional[3])
				die("Usage: session-message <session-id> <role> <content>");
			return sessionAddMessage(positional[1], positional[2], positional[3]);
		case "session-extract":
			if (!positional[1]) die("Usage: session-extract <session-id>");
			return sessionExtract(positional[1]);
		case "session-commit":
			if (!positional[1]) die("Usage: session-commit <session-id>");
			return sessionCommit(positional[1]);

		case "account-create":
			if (!positional[1] || !positional[2])
				die("Usage: account-create <account-id> <admin-user-id>");
			return accountCreate(positional[1], positional[2]);
		case "account-list":
			return accountList();
		case "user-key":
			if (!positional[1] || !positional[2])
				die("Usage: user-key <account-id> <user-id>");
			return userKey(positional[1], positional[2]);

		default:
			die(`Unknown command: ${command}\n\n${USAGE}`);
	}
}

main().catch((err) => {
	console.error(err.message ?? err);
	process.exit(1);
});
