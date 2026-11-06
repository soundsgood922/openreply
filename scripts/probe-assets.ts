/**
 * Second-stage diagnosis for a Meta system user token that authenticates but
 * sees no Instagram assets: inspects the token's real scopes via an app access
 * token, then walks the business portfolios to find where the Instagram
 * account actually lives. Read-only.
 *
 *   npx tsx scripts/probe-assets.ts <token> <appId> <appSecret> [igAccountId]
 */
const V = process.env.META_GRAPH_API_VERSION ?? "v25.0";
const FB = `https://graph.facebook.com/${V}`;

async function get(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${FB}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && !body.error, body };
}

function err(body: Record<string, unknown>) {
  const e = (body.error ?? {}) as { code?: number; error_subcode?: number; message?: string };
  return `code=${e.code ?? "?"}/${e.error_subcode ?? "-"} ${e.message ?? ""}`;
}

async function main() {
  const [token, appId, appSecret, igId] = process.argv.slice(2);
  if (!token || !appId || !appSecret) throw new Error("usage: tsx scripts/probe-assets.ts <token> <appId> <appSecret> [igAccountId]");
  const appToken = `${appId}|${appSecret}`;

  const dbg = await get("/debug_token", appToken, { input_token: token });
  console.log("=== token ===");
  if (!dbg.ok) {
    console.log("debug_token failed:", err(dbg.body));
  } else {
    const d = (dbg.body.data ?? {}) as Record<string, unknown>;
    console.log("type:", d.type, "| app_id:", d.app_id, "| valid:", d.is_valid, "| user_id:", d.user_id);
    console.log("expires_at:", d.expires_at === 0 ? "never" : d.expires_at);
    const scopes = (d.scopes as string[]) ?? [];
    console.log("scopes:", scopes.join(", ") || "(none)");
    console.log("business_management present:", scopes.includes("business_management") ? "YES" : "NO");
    if (d.granular_scopes) console.log("granular_scopes:", JSON.stringify(d.granular_scopes));
  }

  console.log("\n=== identity ===");
  const me = await get("/me", token, { fields: "id,name" });
  console.log(me.ok ? JSON.stringify(me.body) : "FAIL " + err(me.body));

  console.log("\n=== businesses ===");
  const biz = await get("/me/businesses", token, { fields: "id,name" });
  if (!biz.ok) {
    console.log("FAIL", err(biz.body));
  } else {
    const list = ((biz.body.data ?? []) as { id: string; name: string }[]);
    console.log("count:", list.length);
    for (const b of list) {
      console.log(`- ${b.name} (${b.id})`);
      for (const edge of ["owned_instagram_accounts", "client_instagram_accounts", "instagram_accounts"]) {
        const r = await get(`/${b.id}/${edge}`, token, { fields: "id,username" });
        if (r.ok) {
          const d = ((r.body.data ?? []) as { id: string; username?: string }[]);
          console.log(`   ${edge}: ${d.length ? d.map((x) => `${x.username ?? "?"}(${x.id})`).join(", ") : "(empty)"}`);
        } else {
          console.log(`   ${edge}: FAIL ${err(r.body)}`);
        }
      }
    }
  }

  console.log("\n=== pages ===");
  const pages = await get("/me/accounts", token, { fields: "id,name,instagram_business_account{id,username}" });
  console.log(pages.ok ? JSON.stringify(pages.body).slice(0, 600) : "FAIL " + err(pages.body));

  if (igId) {
    console.log(`\n=== direct /${igId} ===`);
    const direct = await get(`/${igId}`, token, { fields: "id,username" });
    console.log(direct.ok ? JSON.stringify(direct.body) : "FAIL " + err(direct.body));
  }
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});

export {};
