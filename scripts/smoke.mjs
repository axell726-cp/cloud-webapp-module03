import assert from "node:assert/strict";
const base = (process.env.BASE_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const check = (condition, label) => { assert.ok(condition, label); console.log("PASS " + label); };
async function request(path, options = {}) {
  const response = await fetch(base + path, { ...options, headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } });
  const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}
  return { response, data, text };
}
const health = await request("/api/health");
check(health.response.status === 200 && health.data.database === "connected", "health endpoint and D1 connection");
const pageResponse = await fetch(base);
check(pageResponse.status === 200 && (await pageResponse.text()).includes("TaskFlow"), "static TaskFlow page returns HTTP 200");
const invalidFilter = await request("/api/tasks?status=unknown");
check(invalidFilter.response.status === 400, "invalid filter rejected");
const wrongOrigin = await request("/api/tasks", { method: "POST", headers: { origin: "https://attacker.invalid" }, body: JSON.stringify({ title: "no" }) });
check(wrongOrigin.response.status === 403, "cross-origin mutation rejected");
const blank = await request("/api/tasks", { method: "POST", headers: { origin: base }, body: JSON.stringify({ title: " " }) });
check(blank.response.status === 400, "blank title rejected");
const oversized = await request("/api/tasks", { method: "POST", headers: { origin: base }, body: JSON.stringify({ title: "x".repeat(2100) }) });
check(oversized.response.status === 413, "oversized request body rejected");
const title = "Module 03 smoke " + Date.now();
const created = await request("/api/tasks", { method: "POST", headers: { origin: base }, body: JSON.stringify({ title }) });
check(created.response.status === 201 && created.data.task && created.data.task.title === title, "create task");
const id = created.data.task.id;
try {
  const pending = await request("/api/tasks?status=pending");
  check(pending.response.status === 200 && pending.data.tasks.some((task) => task.id === id), "read pending task");
  const patched = await request("/api/tasks/" + id, { method: "PATCH", headers: { origin: base }, body: JSON.stringify({ completed: true }) });
  check(patched.response.status === 200 && patched.data.task.completed === 1, "mark task completed");
  const completed = await request("/api/tasks?status=completed");
  check(completed.data.tasks.some((task) => task.id === id), "completed filter");
  const stats = await request("/api/stats");
  check(stats.response.status === 200 && stats.data.total >= 1 && stats.data.completed >= 1, "task statistics");
} finally {
  const deleted = await request("/api/tasks/" + id, { method: "DELETE", headers: { origin: base } });
  check(deleted.response.status === 200, "delete test task");
}
const absent = await request("/api/tasks/" + id, { method: "DELETE", headers: { origin: base } });
check(absent.response.status === 404, "missing task returns HTTP 404");
console.log("SMOKE_OK base=" + base);

