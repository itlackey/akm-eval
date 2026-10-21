// One question to the model endpoint, asked before a run spends anything. A wrong URL, key or model name is found in a second, here, and not
// after the first cases have reached the endpoint. akm is not asked and no sandbox is made: this is a request of the process that is about to
// start the run, made the way akm makes its own (the same URL, the key as a bearer token).

import { completionsUrl } from "./akm/akm.ts";
import { hideEndpoint } from "./cli.ts";
import { endpointOrigin } from "./provenance.ts";

/** What the endpoint did. `served` is the model name its reply carries, which a gateway may give other than the one asked for. */
export type Probe = { ok: true; served: string | null } | { ok: false; reason: string };

export interface ProbeTarget {
  baseUrl: string;
  /** The key, or "" for an endpoint that takes none: then no authorization is sent. */
  apiKey: string;
  model: string;
}

/** How much of a body the reason quotes. */
const EXCERPT = 200;

/**
 * Sends one chat completion with one token to say. A 2xx with a JSON object is ok. Anything else is a `reason`: the HTTP status and the start of the
 * body, or what the network said, with the endpoint's host. A reason never holds the key or the URL of the endpoint, which can carry one: they are
 * written as <MODEL_API_KEY> and <MODEL_BASE_URL>. There are no retries, since an endpoint that does not answer once is not one to start a run
 * on. The only second request is the one akm itself makes: a reasoning model answers 400 to `max_tokens` and asks for `max_completion_tokens`,
 * and is asked again with that.
 */
export async function probeModel({ baseUrl, apiKey, model }: ProbeTarget, { timeoutMs = 60_000 }: { timeoutMs?: number } = {}): Promise<Probe> {
  const host = endpointOrigin(baseUrl);
  if (host === null) return { ok: false, reason: "the base URL is not a URL: it needs http:// or https:// and a host" };
  const safe = (text: string): string => {
    const hidden = hideEndpoint(text, baseUrl); // what a server says back can name the URL it was sent, and the URL can carry a key
    return apiKey === "" ? hidden : hidden.split(apiKey).join("<MODEL_API_KEY>");
  };
  const quote = (text: string): string => safe(text).replace(/\s+/g, " ").trim().slice(0, EXCERPT);
  const ask = async (limit: "max_tokens" | "max_completion_tokens"): Promise<Probe> => {
    let res: Response;
    let text: string;
    try {
      res = await fetch(completionsUrl(baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", ...(apiKey === "" ? {} : { authorization: `Bearer ${apiKey}` }) },
        body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], [limit]: 1 }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (e) {
      const { name, message } = e as Error;
      const said = name === "TimeoutError" || name === "AbortError" ? `no answer in ${timeoutMs / 1000}s (a server that loads the model on its first request may need a second try)` : quote(message);
      return { ok: false, reason: `${said} (${host})` };
    }
    const body = quote(text);
    if (!res.ok) {
      if (limit === "max_tokens" && res.status >= 400 && res.status < 500 && res.status !== 429 && /max_completion_tokens/.test(text)) return ask("max_completion_tokens");
      return { ok: false, reason: `HTTP ${res.status} from ${host}${body ? `: ${body}` : ""}` };
    }
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {} // not JSON: a web page that answers every path
    if (typeof json !== "object" || json === null || Array.isArray(json)) return { ok: false, reason: `HTTP ${res.status} from ${host}, but the body is not a JSON object${body ? `: ${body}` : ""}` };
    const served = (json as { model?: unknown }).model;
    return { ok: true, served: typeof served === "string" ? served : null };
  };
  return ask("max_tokens");
}
