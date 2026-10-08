// The rule that keeps real notes off the internet: an eval that sends private notes to a model (a `--corpus own` run)
// checks first that the model's URL is on this machine or the local network. Every such corpus calls localModelError
// before it reads a note, so a new one gets the guard by calling it:
//
//   const refusal = await localModelError(baseUrl, "MODEL_BASE_URL", "--corpus own", "notes", "model");
//   if (refusal) fail(refusal);
//
// A corpus that only rewrites public data (`--corpus private`, made by ./generate-assets) holds no real note and needs no guard.

import { lookup } from "node:dns/promises";

/** Whether an address is on this machine (127.x, ::1) or the private network (10.x, 172.16.x to 172.31.x, 192.168.x). */
export function isPrivateAddress(ip: string): boolean {
  return ip === "::1" || /^(127|10)(\.\d+){3}$|^192\.168(\.\d+){2}$|^172\.(1[6-9]|2\d|3[01])(\.\d+){2}$/.test(ip);
}

/**
 * Whether a judge at this URL may be sent private notes: the host the URL names is localhost or a private address,
 * or a name that resolves only to private addresses (a gateway on the local network). `localhost.example.com` and
 * `10.1.2.3.example.com` are names like any other, so they count only if they resolve to the private network.
 */
export async function isLocalJudge(baseUrl: string, resolve: (host: string) => Promise<string[]> = lookupAll): Promise<boolean> {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  if (host === "localhost" || isPrivateAddress(host)) return true;
  if (!host || /^[\d.]+$/.test(host) || host.includes(":")) return false;
  const addresses = await resolve(host).catch(() => [] as string[]);
  return addresses.length > 0 && addresses.every(isPrivateAddress);
}

async function lookupAll(host: string): Promise<string[]> {
  return (await lookup(host, { all: true })).map((a) => a.address);
}

/**
 * The refusal to print when `flag` would send your `what` (notes, memories) to the `to` (model, judge) at the URL in
 * `envVar` and that URL is not local, or undefined when it is. See isLocalJudge.
 */
export async function localModelError(baseUrl: string, envVar: string, flag: string, what: string, to: string): Promise<string | undefined> {
  if (await isLocalJudge(baseUrl)) return undefined;
  return `${flag} sends your ${what} to the ${to}, so ${envVar} must be localhost, a private-network address (10.*, 172.16.* to 172.31.*, 192.168.*) or a name that resolves only to such addresses. It is not.`;
}
