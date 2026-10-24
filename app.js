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
  for(const [ticker,p] of positions){const q=prices.get(ticker);if(!q||Date.now()-q.t>30*60*1000||q.t>Date.now()+60*1000){complete=false;continue;}equity+=Number(p.cantidad)*q.price;}
  const initial=Number(portfolio.capital_inicial);
  if($("compareV3"))$("compareV3").textContent=complete?money(equity):"Sin cotización reciente";
  $("cash").textContent=money(portfolio.efectivo);$("initial").textContent=money(initial);
  $("positionsCount").textContent=String(positions.length);
  const orders=portfolio.ordenes_pendientes||[];
  $("pending").textContent=String(orders.filter(o=>o.estado==="PENDIENTE").length);
  $("equity").textContent=complete?money(equity):"Cotización reciente faltante";
  $("return").textContent=complete&&initial>0?"Resultado estimado: "+money(equity-initial)+" ("+number(100*(equity/initial-1))+"%)":"Resultado estimado: no disponible";
  const spySeries=csv(quotes).filter(q=>q.accion==="SPY"&&Number(q.precio_cierre)>0&&Number.isFinite(Date.parse(q.inicio_vela_utc))).map(q=>({t:Date.parse(q.inicio_vela_utc),price:Number(q.precio_cierre)})).sort((a,b)=>a.t-b.t);
  // Una vela puede haberse recibido multiples veces: usar la ultima observacion por vela.
  const uniqueSpy=[...new Map(spySeries.map(q=>[q.t,q])).values()].sort((a,b)=>a.t-b.t);
  const spyStart=uniqueSpy[0],spyEnd=uniqueSpy[uniqueSpy.length-1];
  const spyReturn=spyStart&&spyEnd&&spyEnd.t>spyStart.t?100*(spyEnd.price/spyStart.price-1):null;
  const botReturn=complete&&initial>0?100*(equity/initial-1):null;
  if($("compareSPY"))$("compareSPY").textContent=spyReturn===null?"—":number(spyReturn)+"%";
  if($("botPct"))$("botPct").textContent=botReturn===null?"—":number(botReturn)+"%";
  if($("spyPct"))$("spyPct").textContent=spyReturn===null?"—":number(spyReturn)+"%";
  const maxMagnitude=Math.max(Math.abs(botReturn||0),Math.abs(spyReturn||0),0.01);
  for(const [id,val] of [["botBar",botReturn],["spyBar",spyReturn]]){
    const el=$(id);if(!el)continue;el.style.width=val===null?"0%":(Math.abs(val)/maxMagnitude*100).toFixed(1)+"%";
    el.style.opacity=val===null?".2":"1";
    el.dataset.direction=val<0?"negative":"positive";
  }
  if($("spyDetails"))$("spyDetails").textContent=spyReturn===null?"No hay suficientes cierres observados de SPY para comparar.":"SPY: "+date(new Date(spyStart.t).toISOString())+" a "+date(new Date(spyEnd.t).toISOString())+" · "+money(spyStart.price)+" → "+money(spyEnd.price)+". NewsTrader: rendimiento acumulado desde su capital inicial. Los períodos pueden no coincidir; comparación orientativa, sin dividendos ni costos de SPY.";
  // Serie diaria de cierres observados, deduplicada por fecha de vela.
  const daily=new Map();
  for(const point of uniqueSpy){daily.set(new Date(point.t).toISOString().slice(0,10),point);}
  const history=[...daily.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  const trades=portfolio.operaciones||[];
  if($("tradeCount"))$("tradeCount").textContent=String(trades.length);
  const flat=positions.length===0&&trades.length===0&&orders.every(o=>o.estado!=="EJECUTADA_PAPER");
  const chart=$("historyChart");
  if(chart)chart.replaceChildren();
  const svgNS="http://www.w3.org/2000/svg";
  const shape=(tag,attrs)=>{const e=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(chart)chart.append(e);return e;};
  if(history.length>=2&&flat){
    const base=history[0][1].price;
    const spyValues=history.map(([day,point])=>({day,spy:initial*point.price/base,bot:initial}));
    const vals=spyValues.flatMap(x=>[x.spy,x.bot]);
    const lo=Math.min(...vals),hi=Math.max(...vals);
    const pad=Math.max(2,(hi-lo)*.12),min=lo-pad,max=hi+pad;
    const x=i=>35+i*290/(spyValues.length-1);
    const y=v=>175-(v-min)/(max-min)*145;
    for(let i=0;i<4;i++){
      const value=min+(max-min)*i/3;
      shape("line",{x1:35,y1:y(value),x2:325,y2:y(value),stroke:"#33465d","stroke-width":.8});
      const label=shape("text",{x:29,y:y(value)+4,fill:"#9eb2cf","font-size":10,"text-anchor":"end"});
      label.textContent=Math.round(value).toString();
    }
    for(const [key,color] of [["bot","#46d3bd"],["spy","#8ea9ff"]]){
      shape("polyline",{points:spyValues.map((d,i)=>x(i)+","+y(d[key])).join(" "),fill:"none",stroke:color,"stroke-width":3,"stroke-linejoin":"round","stroke-linecap":"round"});
    }
    for(const [i,label] of [[0,history[0][0]],[history.length-1,history[history.length-1][0]]]){
      const e=shape("text",{x:x(i),y:198,fill:"#9eb2cf","font-size":10,"text-anchor":i===0?"start":"end"});
      e.textContent=label.slice(5);
    }
    let peak=spyValues[0].spy,maxDD=0;
    for(const point of spyValues){peak=Math.max(peak,point.spy);maxDD=Math.min(maxDD,100*(point.spy/peak-1));}
    if($("drawdown"))$("drawdown").textContent="0% (cartera en efectivo)";
    if($("historyDetails"))$("historyDetails").textContent="Desde "+history[0][0]+" hasta "+history[history.length-1][0]+". NewsTrader: "+money(initial)+" (sin compras); SPY: "+money(spyValues.at(-1).spy)+". Caída máxima observada de SPY: "+number(maxDD)+"%.";
  }else{
    const msg=shape("text",{x:170,y:105,fill:"#a9bed6","text-anchor":"middle","font-size":12});
    msg.textContent=history.length<2?"Faltan cierres de SPY":"Falta historial de cartera";
    if($("drawdown"))$("drawdown").textContent=flat?"0% (sin operaciones)":"—";
    $("historyDetails").textContent=history.length<2?"Se necesitan cierres de SPY de al menos dos días.":"Hay operaciones o posiciones: para dibujar el rendimiento real del bot necesitamos guardar valores diarios de cartera. No se reconstruyen rendimientos ficticios.";
  }
  setRows("positions",positions,(el,[ticker,p])=>{const q=prices.get(ticker);row(el,ticker+" · "+number(p.cantidad)+" acciones",q?money(Number(p.cantidad)*q.price)+" · cierre "+date(new Date(q.t).toISOString()):"Sin cotización");},"Todavía no hay compras virtuales.");
  setRows("orders",orders.slice(-12).reverse(),(el,o)=>row(el,(o.accion||"?")+" · "+(o.accion_orden||"COMPRAR"),(o.estado||"—")+" · "+money(o.monto_usd)),"No hay órdenes registradas.");
  setRows("signals",csv(signals).slice(-8).reverse(),(el,s)=>row(el,(s.accion||"?")+" · "+date(s.detectada_utc),(s.puntuacion||"—")+"/100"),"No hay señales.");
  const relevant=(runs.workflow_runs||[]).filter(r=>r.name==="Registrar Cotizaciones V3"||r.name==="Validar Motor Compra Paper V3").slice(0,5);
  setRows("runs",relevant,(el,r)=>row(el,r.name,r.conclusion||r.status),"No hay ejecuciones.");
  const sectors={
    "Tecnología":["NVDA","AAPL","MSFT","AMD"],
    "Finanzas":["JPM","BAC","GS"],
    "Energía":["XOM","CVX","SLB"],
    "Salud":["LLY","JNJ","PFE"],
    "Consumo":["WMT","AMZN","KO","TSLA"],
    "Industria":["CAT","BA","UPS"]
  };
  const observed=csv(quotes);
  const validSymbols=new Set(observed.filter(q=>q.estado==="RECIENTE"&&Number(q.precio_cierre)>0).map(q=>q.accion));
  const universe=Object.values(sectors).flat();
  if($("coverageCount"))$("coverageCount").textContent=universe.filter(t=>validSymbols.has(t)).length+"/20";
  if($("sectorCoverage"))setRows("sectorCoverage",Object.entries(sectors),(el,[name,tickers])=>{
    const found=tickers.filter(t=>validSymbols.has(t));
    row(el,name+" · "+found.length+"/"+tickers.length,found.length===tickers.length?"Completo":(tickers.filter(t=>!validSymbols.has(t)).join(", ")||"—")+" sin datos recientes");
  },"No hay sectores configurados.");
  const qqq=observed.filter(q=>q.accion==="QQQ"&&Number(q.precio_cierre)>0&&Number.isFinite(Date.parse(q.inicio_vela_utc)))
    .map(q=>({t:Date.parse(q.inicio_vela_utc),price:Number(q.precio_cierre)})).sort((a,b)=>a.t-b.t);
  const uq=[...new Map(qqq.map(q=>[q.t,q])).values()].sort((a,b)=>a.t-b.t);
  const qqqReturn=uq.length>=2&&uq.at(-1).t>uq[0].t?100*(uq.at(-1).price/uq[0].price-1):null;
  if($("qqqPct"))$("qqqPct").textContent=qqqReturn===null?"—":number(qqqReturn)+"%";
  if($("sectorNotes"))$("sectorNotes").textContent="Cobertura: símbolos con alguna observación marcada RECIENTE en el historial (no necesariamente de hoy). QQQ: rendimiento entre primeras y últimas velas disponibles, sin dividendos ni costos. No implica señales rentables.";
  // V4 tiene cartera y operaciones separadas; un error V4 no bloquea la vista V3.
  try{
    const v4=JSON.parse(await file("cartera_paper_v4.json","research-v4"));
    if(v4.version!=="V4"||v4.modo!=="SIMULACION"||v4.habilitado_para_operaciones_reales!==false)throw Error("Modo de seguridad V4 inválido");
    let total=Number(v4.efectivo),completeV4=true;
    for(const [ticker,p] of Object.entries(v4.posiciones||{})){
      const q=prices.get(ticker);
      if(!q||Date.now()-q.t>30*60*1000||q.t>Date.now()+60*1000){completeV4=false;break;}
      total+=Number(p.cantidad)*q.price;
    }
    if($("compareV4"))$("compareV4").textContent=completeV4?money(total):"Falta cotización reciente";
    if($("v4Pct"))$("v4Pct").textContent=completeV4&&Number(v4.capital_inicial)>0?number(100*(total/Number(v4.capital_inicial)-1))+"%":"—";
    const operations=v4.operaciones||[];
    if($("v4Status"))$("v4Status").textContent="V4 · "+Object.keys(v4.posiciones||{}).length+" posiciones · "+(v4.ordenes_pendientes||[]).filter(o=>o.estado==="PENDIENTE").length+" órdenes pendientes · "+operations.length+" operaciones registradas. Valoraciones con cotizaciones recientes (máximo 30 minutos); precios no ejecutables.";
    if($("v4Trades"))setRows("v4Trades",operations.slice(-6).reverse(),(el,o)=>row(el,(o.accion||"?")+" · "+(o.tipo||"Operación"),money(o.monto_usd??o.ingreso_usd??o.resultado_usd)+" · "+date(o.fecha_utc)),"V4 todavía no realizó operaciones virtuales.");
  }catch(v4Error){
    if($("compareV4"))$("compareV4").textContent="No disponible";
    if($("v4Pct"))$("v4Pct").textContent="—";
    if($("v4Status"))$("v4Status").textContent="V4: "+v4Error.message;
    if($("v4Trades"))$("v4Trades").textContent="No hay operaciones V4 disponibles.";
  }
  try{
    const raw=await file("historial_cartera_v4.csv","research-v4");
    const entries=csv(raw);
    const valid=entries.filter(r=>r.estado==="COMPLETO"&&Number.isFinite(Number(r.patrimonio_usd))&&r.patrimonio_usd!=="");
    if($("v4HistoryCount"))$("v4HistoryCount").textContent=valid.length+" / "+entries.length;
    if($("v4HistoryEquity"))$("v4HistoryEquity").textContent=valid.length?money(Number(valid.at(-1).patrimonio_usd)):"—";
    if($("v4HistoryStatus"))$("v4HistoryStatus").textContent=valid.length?"Último registro válido: "+date(valid.at(-1).fecha_utc)+". Historial registrado, no proyección.":"No hay valoraciones completas todavía.";
  }catch(err){
    if($("v4HistoryCount"))$("v4HistoryCount").textContent="0";
    if($("v4HistoryEquity"))$("v4HistoryEquity").textContent="—";
    if($("v4HistoryStatus"))$("v4HistoryStatus").textContent="Todavía no se publicó el primer historial V4.";
  }
  try{
    const [newsText,reactionText]=await Promise.all([
      file("auditoria_noticias_v4.csv","research-v4"),
      file("reaccion_mercado_v4.csv","research-v4")]);
    const news=csv(newsText),reaction=csv(reactionText);
    const approved=news.filter(n=>n.apta_filtro_exploratorio==="True").length;
    const complete=reaction.filter(r=>r.estado==="COMPLETO").length;
    if($("researchNews"))$("researchNews").textContent=approved+" / "+news.length;
    if($("researchReaction"))$("researchReaction").textContent=complete+" / "+reaction.length;
    if($("researchStatus"))$("researchStatus").textContent="Noticias aprobadas / auditadas y reacciones con precios completos / señales. Los datos históricos no prueban rentabilidad.";
  }catch(err){
    if($("researchNews"))$("researchNews").textContent="—";
    if($("researchReaction"))$("researchReaction").textContent="—";
    if($("researchStatus"))$("researchStatus").textContent="Auditorías pendientes del próximo ciclo V4; no se infieren resultados.";
  }
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
