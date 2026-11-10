import assert from "node:assert/strict";

const base = "https://taskflow-module03.cloud-webapp-module03.workers.dev";
const debuggerUrl = "http://127.0.0.1:9231/json/list";
let targets;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(debuggerUrl);
    if (response.ok) { targets = await response.json(); break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert.ok(targets, "headless Edge DevTools endpoint did not start");
const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith(base));
assert.ok(target, "public TaskFlow page is not open in Edge");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});
function send(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
await send("Page.enable");
await send("Page.navigate", { url: base });
let pageReady = false;
for (let attempt = 0; attempt < 30; attempt++) {
  const info = await evaluate("({href:location.href,ready:document.readyState,form:!!document.querySelector('#task-form')})");
  if (info.href.startsWith(base) && info.ready === "complete" && info.form) { pageReady = true; break; }
  await new Promise((resolve) => setTimeout(resolve, 300));
}
assert.ok(pageReady, "public page did not finish loading in Edge");
const expression = "(async()=>{const checks=[];const check=(ok,name)=>{if(!ok)throw new Error('FAILED '+name);checks.push('PASS '+name)};const healthResponse=await fetch('/api/health');const health=await healthResponse.json();check(healthResponse.status===200&&health.database==='connected','public HTTPS health and D1');const pageResponse=await fetch('/');check(pageResponse.status===200&&(await pageResponse.text()).includes('TaskFlow'),'public HTML HTTP 200');const title='TaskFlow public smoke '+Date.now();const createdResponse=await fetch('/api/tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title})});const created=await createdResponse.json();check(createdResponse.status===201&&created.task.title===title,'create through public REST API');const id=created.task.id;try{const pendingResponse=await fetch('/api/tasks?status=pending');const pending=await pendingResponse.json();check(pendingResponse.status===200&&pending.tasks.some(t=>t.id===id),'read persisted pending task');const changedResponse=await fetch('/api/tasks/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({completed:true})});const changed=await changedResponse.json();check(changedResponse.status===200&&changed.task.completed===1,'update completion through public REST API');const completedResponse=await fetch('/api/tasks?status=completed');const completed=await completedResponse.json();check(completedResponse.status===200&&completed.tasks.some(t=>t.id===id),'completed filter and persistence');const statsResponse=await fetch('/api/stats');const stats=await statsResponse.json();check(statsResponse.status===200&&stats.completed>=1&&stats.total>=1,'public statistics endpoint');const deletedResponse=await fetch('/api/tasks/'+id,{method:'DELETE'});const deleted=await deletedResponse.json();check(deletedResponse.status===200&&deleted.deleted,'delete through public REST API');const after=await fetch('/api/tasks?status=all');const afterData=await after.json();check(!afterData.tasks.some(t=>t.id===id),'deletion persisted across subsequent request');return {checks,title,id,health,finalStats:stats}}finally{await fetch('/api/tasks/'+id,{method:'DELETE'}).catch(()=>{})}})()";
try {
  const result = await evaluate(expression);
  for (const line of result.checks) console.log(line);
  console.log("PUBLIC_SMOKE_OK " + JSON.stringify({ title: result.title, id: result.id, database: result.health.database, stats: result.finalStats }));
} finally {
  socket.close();
}

