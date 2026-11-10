const WRITE_LIMIT = 20;
const writes = new Map();
const security = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...security } });
async function limitedJson(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return { error: "Se requiere Content-Type application/json.", status: 415 };
  if (Number(request.headers.get("content-length") || 0) > 2048 || !request.body) return { error: "Cuerpo ausente o superior a 2 KB.", status: 413 };
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return { error: "El cuerpo supera 2 KB.", status: 413 }; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return { value: JSON.parse(new TextDecoder().decode(bytes)) }; }
  catch { return { error: "JSON inválido.", status: 400 }; }
}
async function allowed(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const key = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
  const now = Date.now(), entry = writes.get(key);
  if (!entry || entry.until < now) { writes.set(key, { count: 1, until: now + 60000 }); return true; }
  if (entry.count >= WRITE_LIMIT) return false;
  entry.count += 1; return true;
}
const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
async function api(request, env, url) {
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/health") {
    try { await env.DB.prepare("SELECT 1").first(); return reply({ status: "ok", database: "connected" }); }
    catch { console.error(JSON.stringify({ event: "database_health_error" })); return reply({ status: "error", database: "unavailable" }, 503); }
  }
  if (request.method === "GET" && path === "/api/stats") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(completed=0) AS pending, SUM(completed=1) AS completed FROM tasks").first();
    return reply({ total: row.total, pending: row.pending || 0, completed: row.completed || 0 });
  }
  if (request.method === "GET" && path === "/api/tasks") {
    const status = url.searchParams.get("status") || "all";
    if (!["all", "pending", "completed"].includes(status)) return reply({ error: "Filtro inválido." }, 400);
    const stmt = status === "all"
      ? env.DB.prepare("SELECT id,title,completed,created_at,updated_at FROM tasks ORDER BY created_at DESC,id DESC LIMIT 200")
      : env.DB.prepare("SELECT id,title,completed,created_at,updated_at FROM tasks WHERE completed=? ORDER BY created_at DESC,id DESC LIMIT 200").bind(status === "completed" ? 1 : 0);
    return reply({ tasks: (await stmt.all()).results });
  }
  if (path === "/api/tasks" && request.method === "POST") {
    if (request.headers.get("origin") !== url.origin) return reply({ error: "Origen no permitido." }, 403);
    if (!(await allowed(request))) return reply({ error: "Límite de escritura temporal alcanzado." }, 429);
    const parsed = await limitedJson(request);
    if (parsed.error) return reply({ error: parsed.error }, parsed.status);
    const title = typeof parsed.value.title === "string" ? parsed.value.title.trim() : "";
    if (!title || title.length > 120 || /[\u0000-\u001f\u007f]/.test(title)) return reply({ error: "El título debe tener entre 1 y 120 caracteres imprimibles." }, 400);
    const id = crypto.randomUUID(), now = new Date().toISOString();
    await env.DB.prepare("INSERT INTO tasks(id,title,completed,created_at,updated_at) VALUES(?,?,0,?,?)").bind(id,title,now,now).run();
    return reply({ task: { id,title,completed: 0,created_at: now,updated_at: now } }, 201);
  }
  const match = path.match(/^\/api\/tasks\/([^/]+)$/);
  if (match && !isUuid(match[1])) return reply({ error: "Identificador inválido." }, 400);
  if (match && request.method === "PATCH") {
    if (request.headers.get("origin") !== url.origin) return reply({ error: "Origen no permitido." }, 403);
    if (!(await allowed(request))) return reply({ error: "Límite de escritura temporal alcanzado." }, 429);
    const parsed = await limitedJson(request);
    if (parsed.error) return reply({ error: parsed.error }, parsed.status);
    if (typeof parsed.value.completed !== "boolean") return reply({ error: "completed debe ser boolean." }, 400);
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE tasks SET completed=?,updated_at=? WHERE id=?").bind(parsed.value.completed ? 1 : 0,now,match[1]).run();
    if (!result.meta.changes) return reply({ error: "Tarea no encontrada." }, 404);
    return reply({ task: await env.DB.prepare("SELECT id,title,completed,created_at,updated_at FROM tasks WHERE id=?").bind(match[1]).first() });
  }
  if (match && request.method === "DELETE") {
    if (request.headers.get("origin") !== url.origin) return reply({ error: "Origen no permitido." }, 403);
    if (!(await allowed(request))) return reply({ error: "Límite de escritura temporal alcanzado." }, 429);
    const result = await env.DB.prepare("DELETE FROM tasks WHERE id=?").bind(match[1]).run();
    if (!result.meta.changes) return reply({ error: "Tarea no encontrada." }, 404);
    return reply({ deleted: true, id: match[1] });
  }
  if (path.startsWith("/api/")) return reply({ error: "Endpoint o método no permitido." }, 405);
  return null;
}
export default {
  async fetch(request, env) {
    const started = Date.now(), id = crypto.randomUUID(), url = new URL(request.url);
    const route = url.pathname === "/api/tasks" ? "tasks" : url.pathname.startsWith("/api/tasks/") ? "task_item" : url.pathname.split("/").slice(0, 3).join("/");
    let response;
    try {
      response = await api(request, env, url);
      if (!response) response = await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(JSON.stringify({ event: "request_error", requestId: id, route, error: error instanceof Error ? error.name : "unknown" }));
      response = reply({ error: "Error interno. Intenta más tarde.", requestId: id }, 500);
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(security)) headers.set(key, value);
    headers.set("x-request-id", id);
    const output = new Response(response.body, { status: response.status, headers });
    console.log(JSON.stringify({ event: "http_request", requestId: id, method: request.method, route, status: output.status, durationMs: Date.now() - started }));
    return output;
  }
};

