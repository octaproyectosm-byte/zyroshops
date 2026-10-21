// Servidor de Zyro Shops para Cloudflare Pages Functions.
// Guarda los datos en Workers KV (conexión llamada ZYRO).

const seed = {
  wa: "",
  cats: [{ id: "c1", name: "Gorras" }, { id: "c2", name: "Remeras" }, { id: "c3", name: "Accesorios" }],
  products: [
    { id: "p1", name: "Gorra trucker negra", price: 12000, stock: 15, cat: "c1", emo: "🧢", desc: "", img: "" },
    { id: "p2", name: "Remera básica blanca", price: 18000, stock: 25, cat: "c2", emo: "👕", desc: "", img: "" },
    { id: "p3", name: "Mochila urbana", price: 39000, stock: 5, cat: "c3", emo: "🎒", desc: "", img: "" }
  ]
};

const enc = new TextEncoder();
const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function sha(v) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(v == null ? "" : v))));
}
function eq(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}
async function same(a, b) {
  return eq(await sha(a), await sha(b));
}
async function mac(env, exp) {
  const secret = (env.AUTH_SECRET || "") + "|" + (env.ADMIN_USER || "") + "|" + (env.ADMIN_PASS || "");
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(String(exp)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeToken(env) {
  const exp = Date.now() + 12 * 60 * 60 * 1000; // la sesión dura 12 horas
  return exp + "." + (await mac(env, exp));
}
async function validToken(env, t) {
  if (!env.ADMIN_PASS || !t) return false;
  const [exp, h] = String(t).split(".");
  if (!exp || !h || Number(exp) < Date.now()) return false;
  return eq(enc.encode(h), enc.encode(await mac(env, exp)));
}

const txt = (v, n) => String(v == null ? "" : v).slice(0, n);
function clean(d) {
  const cats = (Array.isArray(d.cats) ? d.cats : []).slice(0, 50).map((c) => ({ id: txt(c.id, 40), name: txt(c.name, 60) }));
  const products = (Array.isArray(d.products) ? d.products : []).slice(0, 300).map((p) => ({
    id: txt(p.id, 40),
    name: txt(p.name, 120),
    price: Math.max(0, Number(p.price) || 0),
    stock: Math.max(0, parseInt(p.stock, 10) || 0),
    cat: txt(p.cat, 40),
    emo: txt(p.emo, 8),
    desc: txt(p.desc, 400),
    img: typeof p.img === "string" && p.img.startsWith("data:image/") && p.img.length < 250000 ? p.img : ""
  }));
  return { cats, products, wa: txt(d.wa, 20).replace(/\D/g, "") };
}

export async function onRequest({ request, env }) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (!env.ZYRO) return json({ error: "Falta conectar el almacén KV con el nombre ZYRO." }, 500);

  if (path === "/api/data" && request.method === "GET") {
    const d = await env.ZYRO.get("data", "json");
    return json(d || seed);
  }

  if (path === "/api/login" && request.method === "POST") {
    if (!env.ADMIN_USER || !env.ADMIN_PASS) {
      return json({ error: "Falta configurar ADMIN_USER y ADMIN_PASS en Cloudflare." }, 500);
    }
    let b = {};
    try { b = await request.json(); } catch (e) {}
    const okUser = await same(b.user, env.ADMIN_USER);
    const okPass = await same(b.pass, env.ADMIN_PASS);
    if (okUser && okPass) return json({ token: await makeToken(env) });
    await new Promise((r) => setTimeout(r, 600)); // frena intentos repetidos
    return json({ error: "Usuario o contraseña incorrectos." }, 401);
  }

  if (path === "/api/data" && request.method === "PUT") {
    const auth = request.headers.get("authorization") || "";
    if (!(await validToken(env, auth.replace(/^Bearer\s+/i, "")))) return json({ error: "No autorizado" }, 401);
    const raw = await request.text();
    if (raw.length > 5000000) return json({ error: "Demasiados datos" }, 413);
    let d;
    try { d = JSON.parse(raw); } catch (e) { return json({ error: "Datos inválidos" }, 400); }
    await env.ZYRO.put("data", JSON.stringify(clean(d)));
    return json({ ok: true });
  }

  return json({ error: "No encontrado" }, 404);
}
