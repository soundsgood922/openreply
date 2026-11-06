/**
 * Tells whether the deployed app's webhook secret is the same value as the
 * local one, without reading the deployed value: sends a correctly signed
 * request and a deliberately mis-signed one, then compares which were
 * rejected.
 *
 * The body names an Instagram account id that does not exist, so a request
 * that passes verification is dropped before anything is queued or sent.
 *
 *   npx tsx scripts/probe-webhook-secret.ts <url>
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(process.cwd(), file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function send(url: string, body: string, signature: string, label: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
    body,
  });
  const text = await res.text();
  console.log(`${label.padEnd(26)} HTTP ${res.status}  ${text.slice(0, 80)}`);
  return res.status;
}

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("usage: tsx scripts/probe-webhook-secret.ts <webhook url>");
  const secret = readEnv(".env.railway").FACEBOOK_APP_SECRET;
  if (!secret) throw new Error("FACEBOOK_APP_SECRET missing from .env.railway");

  // An id no account row can match, so a verified request is a no-op.
  const body = JSON.stringify({
    object: "instagram",
    entry: [{ id: "000000000000000", time: 1, changes: [] }],
  });

  const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  const bad = "sha256=" + createHmac("sha256", "definitely-not-the-secret").update(body).digest("hex");

  console.log(`local FACEBOOK_APP_SECRET length: ${secret.length}\n`);
  const okStatus = await send(url, body, good, "signed with local secret");
  const badStatus = await send(url, body, bad, "signed with a wrong key");

  console.log("");
  if (okStatus === 200 && badStatus === 401) {
    console.log("VERDICT: the deployed secret MATCHES the local one.");
    console.log("  So Meta is signing with something else, or the body is altered in transit.");
  } else if (okStatus === 401 && badStatus === 401) {
    console.log("VERDICT: the deployed secret is DIFFERENT from the local one.");
    console.log("  Re-paste FACEBOOK_APP_SECRET on Vercel from .env.railway and redeploy.");
  } else {
    console.log(`VERDICT: unexpected (${okStatus}/${badStatus}) - inspect the responses above.`);
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
