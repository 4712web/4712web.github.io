/* ===== 4712 Web · Turnos · núcleo compartido (página + panel) ===== */
const CONF = {
  key: "barberia-demo",
  nombre: "Barbería Navaja",
  slogan: "Cortes clásicos y modernos desde 2015",
  direccion: "Av. Mitre 1234, Avellaneda",
  whatsapp: "5491100000000",
  instagram: "barberianavaja",
  sheet: "1W7bLBLQev6xfisgqklAOX-M-bwlv_es_RpVmePuaLCY",
  gid: "245098590",
  form: "https://docs.google.com/forms/d/e/1FAIpQLSeC_Gk4aiUURCfHLs-Fbfj10Dub1nIS2Ii70OcaRJrnlfIwFw/formResponse",
  pub: "EXAPwyNEm02MlXqgOhjQDcBDggf5bs3diFU68Ui3juM",
  pin: "1234",
  // 0 = domingo … 6 = sábado. null = cerrado
  horarios: { 0: null, 1: null, 2: ["10:00","20:00"], 3: ["10:00","20:00"], 4: ["10:00","20:00"], 5: ["10:00","21:00"], 6: ["09:00","18:00"] },
  paso: 30,            // minutos entre turnos
  diasAdelante: 14,    // cuántos días se pueden reservar
  anticipacion: 60,    // minutos mínimos antes del turno
  servicios: [
    { id: "corte",   cat: "Servicios", n: "Corte",               p: 8000,  dur: 30,  d: "Corte a tijera o máquina, lavado y peinado." },
    { id: "barba",   cat: "Servicios", n: "Barba",               p: 5000,  dur: 30,  d: "Perfilado, rebaje y toalla caliente." },
    { id: "cejas",   cat: "Servicios", n: "Cejas",               p: 2500,  dur: 30,  d: "Perfilado de cejas a navaja." },
    { id: "cb",      cat: "Promos",    n: "Corte y barba",       p: 11500, antes: 13000, dur: 60, d: "Corte completo + barba con toalla caliente." },
    { id: "cbc",     cat: "Promos",    n: "Corte, barba y cejas", p: 13500, antes: 15500, dur: 60, d: "El combo completo para salir impecable." },
    { id: "global",  cat: "Color",     n: "Global",              p: 28000, dur: 120, d: "Decoloración completa y matiz (platinado, gris, color fantasía)." },
    { id: "claritos",cat: "Color",     n: "Claritos",            p: 22000, dur: 90,  d: "Reflejos con gorra o papel, con matiz incluido." }
  ],
  barberos: [
    { id: "nico",  n: "Nico",  esp: "Fades y diseños",    dias: [2,3,4,5,6], c: "#c9a45c", foto: "" },
    { id: "facu",  n: "Facu",  esp: "Clásicos y barba",   dias: [2,3,4,5],   c: "#b85c3e", foto: "" },
    { id: "tomi",  n: "Tomi",  esp: "Color y platinados", dias: [3,4,5,6],   c: "#6f8f7a", foto: "" }
  ],
  productos: [
    { id: "pomada", n: "Pomada mate",          p: 9500,  d: "Fijación fuerte, efecto seco. 100 g.", ic: "jar",    c: "#c9a45c" },
    { id: "cera",   n: "Cera brillo",           p: 8500,  d: "Fijación media con brillo. 100 g.",    ic: "jar",    c: "#b85c3e" },
    { id: "aceite", n: "Aceite para barba",     p: 7800,  d: "Hidrata y suaviza. 30 ml.",            ic: "drop",   c: "#6f8f7a" },
    { id: "sham",   n: "Shampoo matizador",     p: 11000, d: "Mantiene el platinado. 250 ml.",       ic: "bottle", c: "#8a7bd0" },
    { id: "polvo",  n: "Polvo texturizador",    p: 8900,  d: "Volumen y textura al instante.",       ic: "can",    c: "#d0d0c8" },
    { id: "after",  n: "After shave",           p: 7200,  d: "Calma y refresca después de la barba.", ic: "bottle", c: "#5aa0c8" }
  ],
  fidelidad: { cada: 5, premio: "Corte gratis" }, // cada 5 visitas, la 6ª gratis
  galeria: [ // k = estilo del dibujo de ejemplo; cuando haya fotos reales: { b, t, foto: "data:…" }
    { b: "nico", t: "Mid fade + diseño", k: "design" },
    { b: "nico", t: "Burst fade", k: "fade" },
    { b: "nico", t: "Taper con textura", k: "crop" },
    { b: "facu", t: "Clásico a tijera", k: "classic" },
    { b: "facu", t: "Barba perfilada", k: "beard" },
    { b: "facu", t: "Side part", k: "part" },
    { b: "tomi", t: "Platinado", k: "platinum" },
    { b: "tomi", t: "Claritos", k: "highlights" },
    { b: "tomi", t: "Gris humo", k: "grey" }
  ],
  demo: true // muestra turnos de ejemplo ocupados
};

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => "$ " + Math.round(n||0).toLocaleString("es-AR");
const pad = n => String(n).padStart(2,"0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toMin = h => { const [a,b] = h.split(":").map(Number); return a*60+b; };
const toHM = m => `${pad(Math.floor(m/60))}:${pad(m%60)}`;
const parseYmd = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const DIAS = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const DIAS_C = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const fechaLarga = s => { const d = parseYmd(s); return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`; };
const servicio = id => CONF.servicios.find(s => s.id === id);
const barbero = id => CONF.barberos.find(b => b.id === id);
const ls = { get(k){ try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } }, set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- datos: planilla de Google (lectura JSONP) ---------- */
function gviz(tq){
  return new Promise((ok, fail) => {
    const cb = "__tv" + Date.now() + Math.floor(Math.random()*1e4), s = document.createElement("script");
    const t = setTimeout(() => { done(); fail(new Error("timeout")); }, 15000);
    function done(){ clearTimeout(t); delete window[cb]; s.remove(); }
    window[cb] = r => { done(); r.status === "error" ? fail(new Error("planilla")) : ok(r.table); };
    s.onerror = () => { done(); fail(new Error("sin conexión")); };
    s.src = `https://docs.google.com/spreadsheets/d/${CONF.sheet}/gviz/tq?gid=${CONF.gid}&headers=1&tq=${encodeURIComponent(tq)}&tqx=out:json;responseHandler:${cb}&_=${Date.now()}`;
    document.head.appendChild(s);
  });
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")), c => c.charCodeAt(0));
const u64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function verifyCambio(txt){
  const pre = `CAMBIO[${CONF.key}] `; if (!txt.startsWith(pre)) return null;
  const m = txt.slice(pre.length).match(/^(\{[\s\S]*\}) FIRMA ([A-Za-z0-9_-]+)\s*$/); if (!m) return null;
  try {
    const k = await crypto.subtle.importKey("raw", b64u(CONF.pub), {name:"Ed25519"}, false, ["verify"]);
    return (await crypto.subtle.verify({name:"Ed25519"}, k, b64u(m[2]), new TextEncoder().encode(m[1]))) ? JSON.parse(m[1]) : null;
  } catch { return null; }
}
/* devuelve { turnos:[…], snap:{t, cancel:[ids], block:[…]} } */
async function cargarDatos(){
  const tb = await gviz(`select A, B where B starts with 'TURNO[${CONF.key}]' or B starts with 'CAMBIO[${CONF.key}]' order by A desc limit 3000`);
  const turnos = [], seen = new Set(); let snap = null;
  for (const r of tb.rows || []){
    const v = r.c?.[1]?.v; if (typeof v !== "string") continue;
    if (v.startsWith(`TURNO[${CONF.key}] `)){
      try { const t = JSON.parse(v.slice(CONF.key.length + 8)); if (t.id && !seen.has(t.id)){ seen.add(t.id); turnos.push(t); } } catch {}
    } else {
      const s = await verifyCambio(v); if (s && (!snap || s.t > snap.t)) snap = s;
    }
  }
  return { turnos, snap: snap || { t: 0, cancel: [], block: [] } };
}

/* ---------- turnos de ejemplo (demo) ---------- */
function hash(str){ let h = 2166136261; for (const c of str){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
const NOMBRES = ["Lucas","Mati","Brian","Nahuel","Tomás","Kevin","Thiago","Agus","Santi","Joaco","Fede","Lauti","Gonza","Bruno","Iván","Ramiro","Leo","Dylan","Benja","Facu M.","Enzo","Lisandro","Valen","Juanma","Pipe","Axel","Franco","Nacho","Ciro","Uriel","Maxi","Teo"];
function turnosDemo(){
  if (!CONF.demo) return [];
  const out = [], hoy = new Date(); hoy.setHours(0,0,0,0);
  for (let i = -21; i < CONF.diasAdelante; i++){
    const d = new Date(hoy); d.setDate(d.getDate() + i); const ds = ymd(d), h = CONF.horarios[d.getDay()]; if (!h) continue;
    for (const b of CONF.barberos){
      if (!b.dias.includes(d.getDay())) continue;
      let m = toMin(h[0]);
      while (m < toMin(h[1])){
        const r = hash(ds + b.id + m), cerca = i <= 1 ? .55 : i <= 4 ? .4 : .22;
        if (r < cerca){
          const sv = r < cerca*.22 ? "cb" : r < cerca*.3 ? "cbc" : r < cerca*.38 ? "barba" : r < cerca*.42 && b.id === "tomi" ? "claritos" : "corte";
          const dur = servicio(sv).dur; if (m + dur > toMin(h[1])) { m += CONF.paso; continue; }
          const n = NOMBRES[Math.floor(hash(ds + m + b.id + "n") * NOMBRES.length)];
          const hp = hash(ds + m + "p"), pr = hp < .14 ? [{ id: CONF.productos[Math.floor(hp*100) % CONF.productos.length].id, q: 1 }] : [];
          const pt = pr.reduce((x,y)=>x + (CONF.productos.find(p=>p.id===y.id)?.p||0)*y.q, 0);
          out.push({ id: "D" + ds.replace(/-/g,"") + b.id + m, b: b.id, s: sv, d: ds, h: toHM(m), dur, n, tel: "11" + String(Math.floor(hash(n+"tel")*1e8)).padStart(8,"0"), p: servicio(sv).p, prods: pr, pt, nv: i < 0 && hash(ds+m+"nv") < .07, demo: true });
          m += dur;
        } else m += CONF.paso;
      }
    }
  }
  return out;
}

/* ---------- disponibilidad ---------- */
function horarioDe(b, ds){
  const d = parseYmd(ds), h = CONF.horarios[d.getDay()];
  if (!h || !b.dias.includes(d.getDay())) return null;
  return [toMin(h[0]), toMin(h[1])];
}
function ocupado(DATA, bId, ds){
  const cancel = new Set(DATA.snap.cancel || []), out = [];
  for (const t of DATA.turnos) if (t.b === bId && t.d === ds && !cancel.has(t.id)) out.push([toMin(t.h), toMin(t.h) + (t.dur || 30)]);
  for (const k of DATA.snap.block || []) if ((k.b === "*" || k.b === bId) && k.d === ds) out.push(k.a ? [toMin(k.a), toMin(k.z)] : [0, 24*60]);
  return out;
}
function libre(DATA, b, ds, m, dur){
  const h = horarioDe(b, ds); if (!h || m < h[0] || m + dur > h[1]) return false;
  return !ocupado(DATA, b.id, ds).some(([a,z]) => m < z && a < m + dur);
}
/* horarios del día; bId = "*" para cualquiera */
function slotsDelDia(DATA, ds, bId, dur){
  const bs = bId === "*" ? CONF.barberos : [barbero(bId)];
  const hoy = ymd(new Date()), ahora = new Date(), minAhora = ahora.getHours()*60 + ahora.getMinutes() + CONF.anticipacion;
  let a = 24*60, z = 0;
  for (const b of bs){ const h = horarioDe(b, ds); if (h){ a = Math.min(a, h[0]); z = Math.max(z, h[1]); } }
  const out = [];
  for (let m = a; m + dur <= z; m += CONF.paso){
    if (ds === hoy && m < minAhora) continue;
    const quien = bs.filter(b => libre(DATA, b, ds, m, dur));
    if (bs.some(b => { const h = horarioDe(b, ds); return h && m >= h[0] && m + dur <= h[1]; })) out.push({ m, h: toHM(m), libres: quien.map(b => b.id) });
  }
  return out;
}
function diaAbierto(ds, bId){
  const bs = bId === "*" ? CONF.barberos : [barbero(bId)];
  return bs.some(b => horarioDe(b, ds));
}

/* ---------- fidelidad ---------- */
const telKey = t => String(t || "").replace(/\D/g,"").slice(-8);
/* visitas que cuentan: pasadas, no canceladas y que no figuren como "no vino" */
function visitasPrevias(DATA, tel, antesDe, noVino = () => false){
  const k = telKey(tel), cancel = new Set(DATA.snap.cancel || []);
  if (!k) return 0;
  return DATA.turnos.filter(t => telKey(t.tel) === k && !cancel.has(t.id) && !noVino(t) && (t.d + t.h) < antesDe).length;
}
