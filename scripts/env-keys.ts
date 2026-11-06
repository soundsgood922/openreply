/**
 * Lists the keys in an env file with the length of each value and nothing
 * else, so a misplaced value can be spotted without the secret being printed.
 *
 *   npx tsx scripts/env-keys.ts .env.railway
 */
import { readFileSync } from "node:fs";

const EXPECTED_LENGTH: Record<string, string> = {
  FACEBOOK_APP_SECRET: "32 hex",
  INSTAGRAM_APP_SECRET: "32 hex",
  ENCRYPTION_KEY: "64 hex",
};

const path = process.argv[2] ?? ".env.railway";
const lines = readFileSync(path, "utf8").split(/\r?\n/);

for (const line of lines) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  const [, key, value] = m;
  const v = value.trim();
  const note = EXPECTED_LENGTH[key] ? `  (expected ${EXPECTED_LENGTH[key]})` : "";
  const shape = /^[0-9a-f]+$/i.test(v) ? "hex" : /^EAA/.test(v) ? "looks like an access token" : "other";
  console.log(`${key.padEnd(24)} len=${String(v.length).padStart(4)}  ${shape}${note}`);
}
