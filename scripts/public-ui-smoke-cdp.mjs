import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = "https://taskflow-module03.cloud-webapp-module03.workers.dev";
let targets;
for (let n=0;n<30;n++) { try { const r=await fetch("http://127.0.0.1:9231/json/list"); if(r.ok){targets=await r.json();break} } catch {} await new Promise(r=>setTimeout(r,500)); }
assert.ok(targets,"Edge DevTools endpoint unavailable");
const target=targets.find(x=>x.type==="page"&&x.url.startsWith(base));
assert.ok(target,"public page missing");
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true})});
let seq=0;const waiting=new Map();
socket.addEventListener("message",e=>{const m=JSON.parse(e.data);if(!m.id)return;const p=waiting.get(m.id);if(!p)return;waiting.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result)});
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})}
async function evalPage(expression){const r=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value}
try{
 await send("Page.enable");await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});await send("Page.navigate",{url:base});
 let ready=false;for(let i=0;i<30;i++){const x=await evalPage("({href:location.href,state:document.readyState,form:!!document.querySelector('#task-form')})");if(x.href.startsWith(base)&&x.state==="complete"&&x.form){ready=true;break}await new Promise(r=>setTimeout(r,300))}
 assert.ok(ready,"page did not load");
 const screenshot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await writeFile("evidence/taskflow-mobile.png",Buffer.from(screenshot.data,"base64"));
 const result=await evalPage("(async()=>{const checks=[];const check=(ok,label)=>{if(!ok)throw Error('FAILED '+label);checks.push('PASS '+label)};const metrics={viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth,app:Math.round(document.querySelector('.app-shell').getBoundingClientRect().width)};const title='TaskFlow UI smoke '+Date.now();let id;const wait=async fn=>{for(let i=0;i<40;i++){if(fn())return true;await new Promise(r=>setTimeout(r,100))}return false};try{const input=document.querySelector('#task-title');input.value=title;document.querySelector('#task-form').requestSubmit();check(await wait(()=>[...document.querySelectorAll('.task-title')].some(x=>x.textContent===title)),'create through TaskFlow form');const row=[...document.querySelectorAll('.task-item')].find(x=>x.querySelector('.task-title').textContent===title);id=row.querySelector('.complete-button').dataset.id;row.querySelector('.complete-button').click();check(await wait(()=>{const x=[...document.querySelectorAll('.task-item')].find(y=>y.querySelector('.task-title').textContent===title);return x&&x.classList.contains('is-completed')}),'complete through TaskFlow control');document.querySelector('[data-filter=completed]').click();check(await wait(()=>[...document.querySelectorAll('.task-title')].some(x=>x.textContent===title)),'completed UI filter');check(Number(document.querySelector('#stat-completed').textContent)>=1,'statistics updated in UI');const done=[...document.querySelectorAll('.task-item')].find(x=>x.querySelector('.task-title').textContent===title);done.querySelector('.delete-button').click();check(await wait(()=>![...document.querySelectorAll('.task-title')].some(x=>x.textContent===title)),'delete through TaskFlow control');return{checks,metrics}}finally{if(id)await fetch('/api/tasks/'+id,{method:'DELETE'}).catch(()=>{})}})()");
 for(const item of result.checks)console.log(item);
 console.log("MOBILE_VIEWPORT "+JSON.stringify(result.metrics));
 console.log("PUBLIC_UI_OK");
}finally{socket.close()}

