/**
 * Probes a Meta system user token against the Unified Login surface, to find
 * out whether the Instagram asset is really assigned before any code is
 * written against it. Read-only: it sends no messages and posts no comments.
 *
 *   npx tsx scripts/probe-unified-login.ts <token>
 */
const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const FB = `https://graph.facebook.com/${V}`;

async function get(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${FB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function show(label: string, r: { ok: boolean; status: number; body: unknown }) {
  const b = r.body as { error?: { code?: number; error_subcode?: number; message?: string } };
  if (!r.ok || b?.error) {
    const e = b?.error ?? {};
    console.log(`${label}: FAIL http=${r.status} code=${e.code ?? "?"}/${e.error_subcode ?? "-"} ${e.message ?? ""}`);
    return false;
  }
  console.log(`${label}: OK`);
  return true;
}

async function main() {
  const token = process.argv[2];
  if (!token) throw new Error("usage: tsx scripts/probe-unified-login.ts <token>");

  console.log(`graph version: ${V}\n`);

  const dbg = await get("/debug_token", token, { input_token: token });
  if (show("1. debug_token", dbg)) {
    const d = (dbg.body as { data?: Record<string, unknown> }).data ?? {};
    console.log("   type:", d.type, "| app_id:", d.app_id, "| valid:", d.is_valid);
    console.log("   expires_at:", d.expires_at === 0 ? "never" : d.expires_at);
    console.log("   scopes:", Array.isArray(d.scopes) ? d.scopes.join(", ") : d.scopes);
    if (d.granular_scopes) console.log("   granular:", JSON.stringify(d.granular_scopes));
  }

  const assigned = await get("/me/assigned_instagram_accounts", token, { fields: "id,username" });
  const okAssigned = show("\n2. /me/assigned_instagram_accounts", assigned);
  const list = okAssigned ? ((assigned.body as { data?: { id: string; username?: string }[] }).data ?? []) : [];
  console.log("   accounts:", list.length ? list.map((a) => `${a.username ?? "?"} (${a.id})`).join(", ") : "(EMPTY - business_management likely missing)");

  if (!list.length) return;

  const igId = list[0].id;
  const profile = await get(`/${igId}`, token, { fields: "id,username,name,followers_count" });
  if (show(`\n3. GET /${igId}`, profile)) console.log("   ", JSON.stringify(profile.body));

  const media = await get(`/${igId}/media`, token, { fields: "id,caption,timestamp,permalink,comments_count", limit: "3" });
  if (show(`\n4. GET /${igId}/media`, media)) {
    const items = (media.body as { data?: { id: string; timestamp: string; comments_count?: number; caption?: string }[] }).data ?? [];
    console.log("   count:", items.length);
    for (const m of items) {
      console.log(`   - ${m.id} ${m.timestamp?.slice(0, 10)} comments=${m.comments_count ?? 0} :: ${(m.caption ?? "").replace(/\s+/g, " ").slice(0, 40)}`);
    }
    if (items[0]) {
      const comments = await get(`/${items[0].id}/comments`, token, { fields: "id,text,username,timestamp", limit: "3" });
      if (show(`\n5. GET /${items[0].id}/comments`, comments)) {
        const cs = (comments.body as { data?: unknown[] }).data ?? [];
        console.log("   comments on newest post:", cs.length);
      }
    }
  }

  const convos = await get(`/${igId}/conversations`, token, { platform: "instagram", limit: "1" });
  show("\n6. GET /conversations?platform=instagram", convos);
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});

export {};
