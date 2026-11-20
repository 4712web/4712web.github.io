/* Asistente del panel.
   - Modo prueba (gratis): entiende frases simples con reglas.
   - Modo IA: Claude decide qué herramienta usar. Las herramientas corren acá en el
     navegador (son las mismas funciones del panel); el servidor solo habla con la IA
     y controla el límite de gasto por mes. */
(function () {
  "use strict";
  const P = window.Panel;
  const $ = id => document.getElementById(id);
  const { key, esc, fmt, showName } = P;

  /* ================= búsqueda de productos ================= */
  const stem = w => w.length > 4 ? w.replace(/(es|s)$/, "") : w;
  const toks = s => key(s).replace(/[^a-z0-9ñ ]/g, " ").replace(/(\d)([a-zñ])/g, "$1 $2").replace(/([a-zñ])(\d)/g, "$1 $2").split(" ").filter(Boolean).map(stem);

  // Peso de cada palabra: las raras (marcas) pesan más que las comunes ("pilas", "x").
  let idfCat = null, idf = {};
  function pesos(CAT) {
    if (idfCat === CAT) return; idfCat = CAT; idf = {};
    const N = CAT.productos.length;
    CAT.productos.forEach(p => new Set(toks(p.n + " " + (p.dn || "") + " " + p.c)).forEach(t => idf[t] = (idf[t] || 0) + 1));
    Object.keys(idf).forEach(t => idf[t] = Math.log(1 + N / idf[t]));
  }
  const w = t => idf[t] || Math.log(1 + (idfCat ? idfCat.productos.length : 500));

  // Devuelve [{p, vn, sc}] ordenado por puntaje. Detecta la variante dentro del texto.
  function buscar(texto, max = 5) {
    const CAT = P.CAT; if (!CAT) return [];
    pesos(CAT);
    const q = toks(texto).filter(t => !["de", "del", "la", "el", "los", "las", "con", "para", "x", "un", "una"].includes(t));
    if (!q.length) return [];
    const out = [];
    CAT.productos.forEach(p => {
      let rest = q, vn = null;
      if (p.v) {
        let best = null;
        p.v.forEach(v => { const vt = toks(v.n.split("–")[0]).concat(toks(v.n)); const hit = q.filter(t => vt.includes(t)); if (hit.length && (!best || hit.length > best.hit.length)) best = { v, hit }; });
        if (best) { vn = best.v.n; rest = q.filter(t => !best.hit.includes(t)); }
      }
      const pt = toks(p.n + " " + (p.dn || "") + " " + p.c);
      if (!rest.length) return;
      let hit = 0, tot = 0, numMiss = false;
      rest.forEach(t => { tot += w(t); if (pt.includes(t) || pt.some(x => x.startsWith(t) && t.length >= 3)) hit += w(t); else if (/^\d+$/.test(t)) numMiss = true; });
      if (!hit) return;
      let sc = hit / tot - (numMiss ? 0.5 : 0) - pt.length / 200 + (vn ? 0.05 : 0);
      if (key(p.n).startsWith(key(texto).split(" ")[0])) sc += 0.05;
      out.push({ p, vn, sc });
    });
    return out.filter(x => x.sc > 0.45).sort((a, b) => b.sc - a.sc).slice(0, max);
  }

  /* ================= herramientas (las usan los dos modos) ================= */
  // Cada herramienta devuelve {texto, acciones?}. "acciones" son botones para el chat.
  const pendientes = {}; // borradores esperando confirmación
  let nId = 0;

  function lineaItem(i, tipo) { const u = P.unitPrice(i.p, tipo); return `${i.q} x ${showName(i.n)}${i.vn ? " (" + i.vn + ")" : ""} — ${fmt(u * i.q)}`; }
  function tipoDe(cliente) {
    const prev = [...P.PEDIDOS].reverse().find(p => key(p.cliente) === key(cliente));
    return prev ? prev.tipo : "Mayorista";
  }
  function pedidoDe(cliente, dia) {
    const k = key(cliente);
    const L = P.PEDIDOS.filter(p => (!dia || p.dia === dia) && (key(p.cliente) === k || key(p.cliente).includes(k)));
    return L[L.length - 1] || null;
  }
  const isoLocal = x => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
  const diaISO = d => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return d;
    if (!d || /hoy/i.test(d)) return P.hoyISO();
    if (/ayer/i.test(d)) { const x = new Date(); x.setDate(x.getDate() - 1); return isoLocal(x); }
    const m = /(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/.exec(d);
    if (m) { const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : String(new Date().getFullYear()); return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : P.hoyISO();
  };

  const T = {
    buscar_productos({ texto }) {
      if (!P.CAT) return { texto: "Todavía no hay lista cargada. Subí el ARCHIVO en la pestaña Lista." };
      const r = buscar(texto, 6);
      if (!r.length) return { texto: `No encontré "${texto}" en la lista.` };
      return { texto: r.map(({ p, vn }) => {
        const out = P.sinStock(p, vn);
        const vs = p.v ? " · variantes: " + p.v.map(v => v.n + (P.sinStock(p, v.n) ? " (sin stock)" : "")).join(", ") : "";
        return `• ${p.dn || showName(p.n)}${vn ? " (" + vn + ")" : ""}: lista ${fmt(p.p)}, mayorista ${fmt(P.unitPrice(p.p, "Mayorista"))}${p.pk > 1 ? ", va de a " + p.pk : ""}${p.o ? ", OFERTA" : ""}${out ? ", SIN STOCK" : ""}${vs}`;
      }).join("\n") };
    },

    armar_pedido({ cliente, tipo, items, aclaraciones }) {
      if (!P.CAT) return { texto: "Primero tengo que tener la lista del depósito. Subila en la pestaña Lista." };
      if (!cliente) return { texto: "¿De qué cliente es el pedido?" };
      tipo = Object.keys(P.CFG.tipos).find(t => key(t) === key(tipo || "")) || tipoDe(cliente);
      const its = [], dudas = [], avisos = [];
      (items || []).forEach(it => {
        const q = Math.max(1, parseInt(it.cantidad, 10) || 1);
        const r = buscar(it.producto + (it.variante ? " " + it.variante : ""), 3);
        if (!r.length) { dudas.push(`No encontré "${it.producto}${it.variante ? " " + it.variante : ""}".`); return; }
        let { p, vn } = r[0];
        if (r[1] && r[1].sc === r[0].sc && r[1].p !== p) { dudas.push(`"${it.producto}": ¿${showName(r[0].p.n)} o ${showName(r[1].p.n)}? Puse el primero.`); }
        if (p.v && !vn) { dudas.push(`${showName(p.n)} tiene variantes (${p.v.map(v => v.n).join(", ")}). ¿Cuál?`); return; }
        if (P.sinStock(p, vn)) avisos.push(`${showName(p.n)}${vn ? " " + vn : ""} está SIN STOCK.`);
        if (p.pk > 1 && q % p.pk) avisos.push(`${showName(p.n)} va de a ${p.pk} (pidió ${q}).`);
        const cell = vn ? p.v.find(v => v.n === vn).cell : "A" + p.r;
        const ex = its.find(i => i.k === p.k && i.vn === (vn || null));
        if (ex) ex.q += q; else its.push({ k: p.k, n: p.n, vn: vn || null, cell, p: p.p, q, pk: p.pk || 1 });
      });
      if (!its.length) return { texto: (dudas.join("\n") || "No entendí los productos.") };
      const ped = { cliente: cliente.trim(), tipo, vend: "", obs: aclaraciones || "", items: its };
      const t = P.totales(its, tipo);
      if (t.cob < P.CFG.minimo) avisos.push(`No llega a la compra mínima de ${fmt(P.CFG.minimo)}.`);
      const id = "b" + (++nId); pendientes[id] = ped;
      const txt = `Pedido de ${ped.cliente} (${tipo}):\n${its.map(i => lineaItem(i, tipo)).join("\n")}\n\nTotal ${fmt(t.cob)} · ganancia ${fmt(t.gan)}` +
        (avisos.length ? "\n\n⚠ " + avisos.join("\n⚠ ") : "") + (dudas.length ? "\n\n? " + dudas.join("\n? ") : "");
      return { texto: txt + "\n\n(Borrador: falta que Franco toque Guardar.)", mostrar: txt, acciones: [
        { t: "Guardar pedido", c: "ok", f: () => { const g = P.guardarPedidoDirecto(pendientes[id]); delete pendientes[id]; P.toast("Pedido guardado"); decir(`Listo, guardé el pedido de ${g.cliente}.`, [accBoleta(g), accExcel(g)]); } },
        { t: "Editar", c: "alt", f: () => P.editarEnCargar(pendientes[id]) }
      ] };
    },

    listar_pedidos({ dia }) {
      const d = diaISO(dia), L = P.PEDIDOS.filter(p => p.dia === d);
      if (!L.length) return { texto: `No hay pedidos el ${P.ddmmyyyy(d)}.` };
      let C = 0, G = 0;
      const rows = L.map(p => { const t = P.totales(p.items, p.tipo); C += t.cob; G += t.gan; return `• ${p.cliente} (${p.tipo}): ${fmt(t.cob)}, ${p.items.length} productos`; });
      return { texto: `Pedidos del ${P.ddmmyyyy(d)}:\n${rows.join("\n")}\n\nTotal ${fmt(C)} · ganancia ${fmt(G)}`, acciones: [accExcelDia(d, L.length)] };
    },

    ganancias({ desde, hasta }) {
      const a = diaISO(desde), b = diaISO(hasta || "hoy");
      const L = P.PEDIDOS.filter(p => p.dia >= a && p.dia <= b);
      let C = 0, D = 0, G = 0;
      L.forEach(p => { const t = P.totales(p.items, p.tipo); C += t.cob; D += t.dep; G += t.gan; });
      return { texto: `Del ${P.ddmmyyyy(a)} al ${P.ddmmyyyy(b)}: ${L.length} pedidos.\nCobrado a clientes ${fmt(C)}\nPagado al depósito ${fmt(D)}\nGanancia ${fmt(G)}` };
    },

    excel_proveedor({ cliente, dia }) {
      const d = diaISO(dia);
      if (cliente) {
        const p = pedidoDe(cliente, null);
        if (!p) return { texto: `No encontré un pedido de "${cliente}".` };
        return { texto: `Excel para el depósito del pedido de ${p.cliente} listo para descargar.`, acciones: [accExcel(p)] };
      }
      const L = P.PEDIDOS.filter(p => p.dia === d);
      if (!L.length) return { texto: `No hay pedidos el ${P.ddmmyyyy(d)}.` };
      return { texto: `Excel con los ${L.length} pedidos del ${P.ddmmyyyy(d)} juntos, listo para descargar.`, acciones: [accExcelDia(d, L.length)] };
    },

    boleta({ cliente, dia }) {
      const p = pedidoDe(cliente || "", dia ? diaISO(dia) : null);
      if (!p) return { texto: `No encontré un pedido de "${cliente}".` };
      return { texto: `Boleta de ${p.cliente} (${P.ddmmyyyy(p.dia)}, ${fmt(P.totales(p.items, p.tipo).cob)}) lista para descargar.`, acciones: [accBoleta(p)] };
    },

    marcar_sin_stock({ productos }) {
      const enc = [], no = [];
      (productos || []).forEach(t => { const r = buscar(t, 1)[0]; if (r) enc.push(r); else no.push(t); });
      if (!enc.length) return { texto: "No encontré ninguno de esos productos." };
      const ids = enc.map(({ p, vn }) => vn ? p.k + "|" + vn : p.k);
      const lista = enc.map(({ p, vn }) => "• " + showName(p.n) + (vn ? " " + vn : "")).join("\n");
      return { texto: `Para marcar sin stock:\n${lista}` + (no.length ? `\nNo encontré: ${no.join(", ")}` : "") + "\n(Falta que Franco confirme.)",
        mostrar: `¿Marco sin stock estos productos?\n${lista}` + (no.length ? `\n\nNo encontré: ${no.join(", ")}` : ""),
        acciones: [{ t: "Sí, marcar", c: "acc", f: () => { P.marcarSinStock(ids); decir(`Listo, marqué ${ids.length} sin stock.`); } }] };
    }
  };

  const accBoleta = p => ({ t: "Boleta PDF", c: "", f: b => P.boletaDe(p, b) });
  const accExcel = p => ({ t: "Excel depósito", c: "alt", f: b => P.excelDe([p], p.cliente, b) });
  const accExcelDia = (d, n) => ({ t: `Excel depósito (${n})`, c: "acc", f: b => P.excelDe(P.PEDIDOS.filter(p => p.dia === d), "TODOS " + d.slice(8, 10) + "-" + d.slice(5, 7), b) });

  /* ================= modo prueba: reglas ================= */
  function partirItems(s) {
    return s.split(/\n|,|;|\s+y\s+(?=\d)/i).map(x => x.trim()).filter(Boolean).map(x => {
      let m = /^(\d+)\s*(?:x|u\.?|unidades?|cajas?)?\s+(.+)$/i.exec(x);
      if (m) return { cantidad: +m[1], producto: m[2] };
      m = /^(.+?)\s*x\s*(\d+)$/i.exec(x);
      if (m) return { cantidad: +m[2], producto: m[1] };
      return { cantidad: 1, producto: x };
    });
  }
  function reglas(txt) {
    const t = txt.trim(), k = key(t);
    let m;
    if ((m = /^(?:nuevo\s+)?(?:pedido|carga(?:r|me)?|carg[aá]|anot[aá](?:me)?)\s+(?:(?:un\s+)?pedido\s+)?(?:de|para|a)\s+(.+)$/is.exec(t))) {
      let rest = m[1], cli, items;
      const c = rest.indexOf(":");
      if (c > 0) { cli = rest.slice(0, c); items = rest.slice(c + 1); }
      else { const d = /\s\d/.exec(rest); if (!d) return { texto: "¿Qué productos lleva? Escribilo así: pedido de Dani: 3 actron 600 caja, 2 bucoangin miel" }; cli = rest.slice(0, d.index); items = rest.slice(d.index); }
      let tipo = null;
      cli = cli.replace(/\((mayorista|minorista|revendedor)\)|\b(mayorista|minorista|revendedor)\b/i, (x, a, b) => { tipo = a || b; return ""; }).trim();
      return T.armar_pedido({ cliente: cli, tipo, items: partirItems(items) });
    }
    if (/^(boleta|factura|remito)/.test(k)) { m = /\b(?:de|para|a)\s+(.+)$/i.exec(t); return T.boleta({ cliente: m ? m[1] : "" }); }
    if (/excel|archivo|planilla/.test(k)) {
      m = /\b(?:de|para)\s+(?!hoy|ayer|pablo|deposito|todo|todos|el dia)([^\d]+)$/i.exec(t);
      return T.excel_proveedor({ cliente: m ? m[1].trim() : "", dia: /ayer/.test(k) ? "ayer" : "hoy" });
    }
    if (/^(faltan?|faltantes?|sin stock|no hay)\b/.test(k)) return T.marcar_sin_stock({ productos: t.replace(/^\s*(faltan?(tes)?|sin stock|no hay)\s*:?\s*/i, "").split(/\n|,|;|\s+y\s+/).map(s => s.trim()).filter(Boolean) });
    if (/gan[eé]|ganancia|cuanto (hice|vendi)|vend[ií]/.test(k)) {
      const hoy = new Date();
      if (/semana/.test(k)) { const d = new Date(hoy); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return T.ganancias({ desde: isoLocal(d) }); }
      if (/mes/.test(k)) return T.ganancias({ desde: P.hoyISO().slice(0, 8) + "01" });
      if (/ayer/.test(k)) return T.ganancias({ desde: "ayer", hasta: "ayer" });
      return T.ganancias({ desde: "hoy" });
    }
    if (/pedidos/.test(k)) return T.listar_pedidos({ dia: /ayer/.test(k) ? "ayer" : "hoy" });
    if ((m = /^(?:precio(?: de)?|cuanto (?:sale|esta|cuesta)|hay|tenes|busca(?:r|me)?|stock de)\s+(.+?)\??$/i.exec(k))) return T.buscar_productos({ texto: m[1] });
    if (/^(hola|buenas|ayuda|que (podes|sabes) hacer|\?)/.test(k)) return { texto: AYUDA };
    const r = buscar(t, 1);
    if (r.length && r[0].sc > 0.8) return T.buscar_productos({ texto: t });
    return { texto: "En modo prueba entiendo frases simples. Probá:\n\n" + AYUDA };
  }
  const AYUDA = "• pedido de Dani: 3 actron 600 caja, 2 bucoangin miel, 25 encendedores\n• boleta de Dani\n• excel de hoy\n• faltan anaflex, diclofenac 75\n• cuánto gané esta semana\n• pedidos de hoy\n• precio de tafirol";

  /* ================= modo IA ================= */
  const CONF_KEY = "ia";
  let conf = P.store.get(CONF_KEY, { on: false, url: "", dist: "", clave: "" });
  let hist = []; // mensajes en formato de la API (incluye bloques de pensamiento: se devuelven tal cual)

  async function pedirIA(messages) {
    const r = await fetch(conf.url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ distribuidor: conf.dist, clave: conf.clave, messages,
        contexto: `Negocio: ${P.CFG.nombre}. Hoy: ${P.ddmmyyyy(P.hoyISO())}. Tipos de cliente: ${Object.keys(P.CFG.tipos).join(", ")}. Compra mínima: ${fmt(P.CFG.minimo)}. Lista cargada: ${P.CAT ? P.CAT.nombre : "ninguna"}.` })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.mensaje || "Error del servidor"), { codigo: j.error });
    return j;
  }
  async function turnoIA(txt) {
    hist.push({ role: "user", content: txt });
    const acciones = [];
    const pens = burbuja("el", "Pensando…"); pens.classList.add("pens");
    try {
      for (let vuelta = 0; vuelta < 6; vuelta++) {
        const j = await pedirIA(hist);
        if (j.uso) mostrarUso(j.uso);
        hist.push({ role: "assistant", content: j.content });
        if (j.stop_reason === "tool_use") {
          const res = [];
          j.content.filter(b => b.type === "tool_use").forEach(b => {
            let out;
            try { out = T[b.name] ? T[b.name](b.input || {}) : { texto: "Herramienta desconocida" }; } catch (e) { out = { texto: "Error: " + e.message }; }
            if (out.acciones) acciones.push(...out.acciones);
            res.push({ type: "tool_result", tool_use_id: b.id, content: out.texto });
          });
          hist.push({ role: "user", content: res });
          continue;
        }
        pens.remove();
        const texto = j.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
        if (j.stop_reason === "refusal") return decir("No puedo ayudar con eso.");
        decir(texto || "Listo.", acciones);
        if (hist.length > 40) hist = []; // conversación larga: empezamos de nuevo para no gastar de más
        return;
      }
      pens.remove(); decir("Me trabé. ¿Me lo decís de otra forma?", acciones);
    } catch (e) {
      pens.remove(); hist = [];
      const m = { limite: "Se llegó al límite de gasto de la IA de este mes. Sigo en modo prueba.", ia_apagada: "La IA no está activada para esta cuenta. Sigo en modo prueba.", clave: "La clave de acceso no es correcta (Ajustes)." }[e.codigo];
      decir((m || "No pude conectar con la IA (" + e.message + "). Te respondo en modo prueba:") , []);
      responderPrueba(txt);
    }
  }
  function mostrarUso(u) { $("iaUso").textContent = `Este mes: USD ${(+u.usd).toFixed(2)} de ${(+u.limite).toFixed(2)}`; }

  /* ================= chat UI ================= */
  function burbuja(quien, texto) {
    const b = document.createElement("div"); b.className = "bub " + quien; b.textContent = texto;
    $("chat").appendChild(b); b.scrollIntoView({ block: "end", behavior: "smooth" }); return b;
  }
  function decir(texto, acciones) {
    const b = burbuja("el", texto);
    if (acciones && acciones.length) {
      const a = document.createElement("div"); a.className = "acts";
      acciones.forEach(x => { const bt = document.createElement("button"); bt.type = "button"; bt.className = "btn sm " + (x.c || ""); bt.textContent = x.t; bt.onclick = () => x.f(bt); a.appendChild(bt); });
      b.appendChild(a);
    }
  }
  function responderPrueba(txt) { const r = reglas(txt); decir(r.mostrar || r.texto, r.acciones); }
  function enviar(txt) {
    txt = txt.trim(); if (!txt) return;
    burbuja("yo", txt);
    const iaLista = conf.on && conf.url && conf.dist && conf.clave;
    if (iaLista) turnoIA(txt); else responderPrueba(txt);
  }
  function modoTxt() {
    const ia = conf.on && conf.url && conf.dist && conf.clave;
    $("modoTxt").textContent = ia ? "Modo IA activado" : "Modo prueba (gratis, sin IA)";
  }

  $("chatForm").onsubmit = e => { e.preventDefault(); const t = $("chatTxt"); enviar(t.value); t.value = ""; t.style.height = ""; };
  $("chatTxt").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); $("chatForm").requestSubmit(); } });
  $("chatTxt").addEventListener("input", e => { const t = e.target; t.style.height = ""; t.style.height = Math.min(t.scrollHeight, 140) + "px"; });
  ["pedido de ", "boleta de ", "excel de hoy", "pedidos de hoy", "cuánto gané esta semana", "faltan "].forEach(s => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = s.trim();
    b.onclick = () => { if (s.endsWith(" ")) { $("chatTxt").value = s; $("chatTxt").focus(); } else enviar(s); };
    $("sugs").appendChild(b);
  });
  $("ajIA").onclick = () => { $("ajustes").hidden = !$("ajustes").hidden; };
  $("iaOn").checked = conf.on; $("iaUrl").value = conf.url; $("iaDist").value = conf.dist; $("iaClave").value = conf.clave;
  $("iaGuardar").onclick = () => {
    conf = { on: $("iaOn").checked, url: $("iaUrl").value.trim(), dist: $("iaDist").value.trim(), clave: $("iaClave").value };
    P.store.set(CONF_KEY, conf); hist = []; modoTxt(); $("ajustes").hidden = true; P.toast("Ajustes guardados");
  };
  modoTxt();
  decir(`Hola, soy el asistente de ${P.CFG.nombre}. Decime qué necesitás. Por ejemplo:\n\n${AYUDA}`);

  window.Asistente = { buscar, reglas, T };
})();
