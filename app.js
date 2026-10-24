"use strict";
const REPO="bgrosso226-source/bot-trading-spy",BRANCH="paper-v3-pruebas";
let accessToken=null, busy=false;
const $=id=>document.getElementById(id);
const money=n=>Number.isFinite(Number(n))?new Intl.NumberFormat("es-AR",{style:"currency",currency:"USD"}).format(Number(n)):"—";
const number=n=>Number.isFinite(Number(n))?Number(n).toLocaleString("es-AR",{maximumFractionDigits:5}):"—";
const date=s=>{const d=new Date(s);return isNaN(d)?"—":d.toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"});};
function row(parent,left,right){const div=document.createElement("div");div.className="line";const a=document.createElement("span"),b=document.createElement("strong");a.textContent=left;b.textContent=right;div.append(a,b);parent.append(div);}
function setRows(id,items,fn,empty){const el=$(id);el.replaceChildren();if(!items.length){el.textContent=empty;return;}items.forEach(item=>fn(el,item));}
async function api(path){const r=await fetch("https://api.github.com/repos/"+REPO+"/"+path,{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+accessToken,"X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"});if(!r.ok)throw Error(r.status===401?"Token inválido o vencido":r.status===403?"Acceso denegado o límite de GitHub":r.status===404?"No se puede acceder al repositorio privado":"GitHub respondió "+r.status);return r.json();}
async function file(path,branch=BRANCH){const v=await api("contents/"+path+"?ref="+branch);if(!v.content)throw Error("Archivo no disponible: "+path);const raw=atob(v.content.replace(/\s/g,""));const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);}
function csv(text){const rows=[],fields=[];let value="",record=[],quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===","&&!quoted){record.push(value);value="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;record.push(value);value="";if(record.some(Boolean))rows.push(record);record=[];}else value+=c;}if(value||record.length){record.push(value);rows.push(record);}const header=rows.shift()||[];return rows.map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]||""])));}
async function update(){
 if(busy||!accessToken)return;busy=true;$("refresh").disabled=true;
 try{
  const [raw,quotes,signals,runs]=await Promise.all([file("cartera_paper_v3.json"),file("cotizaciones_observadas_v3.csv"),file("puntuaciones_v3.csv","main"),api("actions/runs?per_page=20")]);
  const portfolio=JSON.parse(raw);
  if(portfolio.modo!=="SIMULACION"||portfolio.habilitado_para_operaciones_reales!==false)throw Error("La cartera no está en modo seguro de simulación");
  const prices=new Map();
  for(const q of csv(quotes)){const t=Date.parse(q.recibida_utc);if(Number.isFinite(t)&&Number(q.precio_cierre)>0&&(!prices.has(q.accion)||prices.get(q.accion).t<t))prices.set(q.accion,{price:Number(q.precio_cierre),t});}
  const positions=Object.entries(portfolio.posiciones||{});
  let equity=Number(portfolio.efectivo),complete=true;
  for(const [ticker,p] of positions){const q=prices.get(ticker);if(!q){complete=false;continue;}equity+=Number(p.cantidad)*q.price;}
  const initial=Number(portfolio.capital_inicial);
  $("cash").textContent=money(portfolio.efectivo);$("initial").textContent=money(initial);
  $("positionsCount").textContent=String(positions.length);
  const orders=portfolio.ordenes_pendientes||[];
  $("pending").textContent=String(orders.filter(o=>o.estado==="PENDIENTE").length);
  $("equity").textContent=complete?money(equity):"Cotización faltante";
  $("return").textContent=complete&&initial>0?"Resultado estimado: "+money(equity-initial)+" ("+number(100*(equity/initial-1))+"%)":"Resultado estimado: no disponible";
  setRows("positions",positions,(el,[ticker,p])=>{const q=prices.get(ticker);row(el,ticker+" · "+number(p.cantidad)+" acciones",q?money(Number(p.cantidad)*q.price)+" · cierre "+date(new Date(q.t).toISOString()):"Sin cotización");},"Todavía no hay compras virtuales.");
  setRows("orders",orders.slice(-12).reverse(),(el,o)=>row(el,(o.accion||"?")+" · "+(o.accion_orden||"COMPRAR"),(o.estado||"—")+" · "+money(o.monto_usd)),"No hay órdenes registradas.");
  setRows("signals",csv(signals).slice(-8).reverse(),(el,s)=>row(el,(s.accion||"?")+" · "+date(s.detectada_utc),(s.puntuacion||"—")+"/100"),"No hay señales.");
  const relevant=(runs.workflow_runs||[]).filter(r=>r.name==="Registrar Cotizaciones V3"||r.name==="Validar Motor Compra Paper V3").slice(0,5);
  setRows("runs",relevant,(el,r)=>row(el,r.name,r.conclusion||r.status),"No hay ejecuciones.");
  $("updated").textContent="Consultado "+date(new Date().toISOString())+" · señales de main";
  $("login").hidden=true;$("dashboard").hidden=false;$("loginError").textContent="";
 }catch(e){$("loginError").textContent=e.message;$("updated").textContent="Error: "+e.message;if($("dashboard").hidden)$("login").hidden=false;}
 finally{busy=false;$("refresh").disabled=false;}
}
$("connect").addEventListener("click",async()=>{const v=$("token").value.trim();if(!v)return;$("loginError").textContent="Conectando…";accessToken=v;$("token").value="";await update();});
$("refresh").addEventListener("click",update);
$("logout").addEventListener("click",()=>{accessToken=null;$("dashboard").hidden=true;$("login").hidden=false;$("loginError").textContent="Sesión cerrada. El token no se almacenó.";});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&accessToken)update();});

if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
