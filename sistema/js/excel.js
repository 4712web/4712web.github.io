/* Lee la lista del proveedor (xlsx) y escribe pedidos sobre el archivo original.
   Trabaja directo sobre el XML del xlsx para que el archivo de salida quede
   identico al original (colores, formulas, anchos) con solo las cantidades. */
(function () {
  const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const RNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

  const key = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(oferta(\s*\d+\s*%)?|liquidacion)\b/g, " ").replace(/\s+/g, " ").trim();

  const colNum = c => c.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  const splitRef = ref => { const m = /^([A-Z]+)(\d+)$/.exec(ref); return { col: m[1], row: +m[2] }; };

  const xml = s => new DOMParser().parseFromString(s, "application/xml");
  const kids = (el, name) => Array.from(el.getElementsByTagNameNS(NS, name));

  async function sheetPath(zip, hoja) {
    const wb = xml(await zip.file("xl/workbook.xml").async("string"));
    const sheets = kids(wb, "sheet");
    const sh = sheets.find(s => s.getAttribute("name") === hoja) || sheets[0];
    const rid = sh.getAttributeNS(RNS, "id");
    const rels = xml(await zip.file("xl/_rels/workbook.xml.rels").async("string"));
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find(r => r.getAttribute("Id") === rid);
    let t = rel.getAttribute("Target");
    t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
    return { path: t, nombre: sh.getAttribute("name") };
  }

  async function sharedStrings(zip) {
    const f = zip.file("xl/sharedStrings.xml");
    if (!f) return [];
    const d = xml(await f.async("string"));
    return kids(d, "si").map(si => kids(si, "t").map(t => t.textContent).join(""));
  }

  // Devuelve para cada indice de estilo (s="..") si la celda esta pintada de amarillo.
  async function yellowStyles(zip) {
    const f = zip.file("xl/styles.xml");
    if (!f) return [];
    const d = xml(await f.async("string"));
    const fillsEl = kids(d, "fills")[0];
    const fills = fillsEl ? kids(fillsEl, "fill").map(fl => {
      const pf = kids(fl, "patternFill")[0];
      if (!pf || (pf.getAttribute("patternType") || "none") === "none") return false;
      const fg = kids(pf, "fgColor")[0];
      if (!fg) return false;
      const rgb = (fg.getAttribute("rgb") || "").toUpperCase();
      if (rgb) {
        const h = rgb.slice(-6), r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
        return r >= 0xE0 && g >= 0xD0 && b <= 0x90;
      }
      const ix = fg.getAttribute("indexed");
      return ix === "13" || ix === "5";
    }) : [];
    const xfsEl = kids(d, "cellXfs")[0];
    return xfsEl ? kids(xfsEl, "xf").map(xf => !!fills[+(xf.getAttribute("fillId") || 0)]) : [];
  }

  // Lee la hoja como mapa { "B3": {v, y} } (v = valor, y = amarillo)
  async function readCells(buf, hoja) {
    const zip = await JSZip.loadAsync(buf);
    const { path, nombre } = await sheetPath(zip, hoja);
    const ss = await sharedStrings(zip);
    const ys = await yellowStyles(zip);
    const d = xml(await zip.file(path).async("string"));
    const cells = {}; let maxRow = 0;
    kids(d, "c").forEach(c => {
      const ref = c.getAttribute("r"); if (!ref) return;
      const t = c.getAttribute("t"), s = +(c.getAttribute("s") || 0);
      const vEl = kids(c, "v")[0], f = kids(c, "f")[0];
      let v = null;
      if (t === "s" && vEl) v = ss[+vEl.textContent];
      else if (t === "inlineStr") v = kids(c, "t").map(x => x.textContent).join("");
      else if (f) v = null; // formula: no nos interesa su resultado
      else if (vEl) { const n = Number(vEl.textContent); v = t === "str" || isNaN(n) ? vEl.textContent : n; }
      if (typeof v === "string" && !v.trim()) v = null;
      cells[ref] = { v, y: !!ys[s] };
      const r = splitRef(ref).row; if (r > maxRow) maxRow = r;
    });
    return { cells, maxRow, hoja: nombre };
  }

  const pretty = s => String(s).trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/(^|[\s\-–(\/])([a-zñáéíóú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\s-\s?|\s?-\s/g, " – ");

  /* Arma el catalogo.
     Columnas: B nombre, C precio, cantidad en A. Variantes en listas al costado
     (F/H) con la cantidad en la columna de la izquierda (E/G). */
  async function parse(buf, memoria) {
    const cfg = memoria.config || {};
    const { cells, maxRow, hoja } = await readCells(buf, cfg.hoja || "1");
    const get = ref => cells[ref] || { v: null, y: false };
    const mp = memoria.productos || {};
    const productos = [], sinPrecio = [], avisos = [];

    // Bloques separados por filas vacias en B -> sirven para adivinar el rubro de productos nuevos
    let bloque = 0, prevVacia = true;
    const filas = [];
    for (let r = 3; r <= maxRow; r++) {
      const b = get("B" + r).v;
      if (b == null) { prevVacia = true; continue; }
      if (prevVacia) bloque++; prevVacia = false;
      filas.push({ r, b: String(b), bloque });
    }

    // Listas de variantes al costado: encabezado + items hasta una celda vacia
    const listas = [];
    ["F", "H", "J", "L"].forEach(col => {
      let cur = null;
      for (let r = 3; r <= maxRow + 1; r++) {
        const c = get(col + r);
        if (c.v == null || typeof c.v !== "string") { if (cur) { listas.push(cur); cur = null; } continue; }
        if (!cur) cur = { col, fila: r, h: key(c.v), titulo: String(c.v).trim(), items: [], usada: false };
        else cur.items.push({ raw: String(c.v), k: key(c.v), cell: String.fromCharCode(col.charCodeAt(0) - 1) + r, s: c.y });
      }
    });

    filas.forEach(f => {
      const c = get("C" + f.r);
      const precio = typeof c.v === "number" ? c.v : null;
      const nombre = f.b.replace(/\s+/g, " ").trim();
      const k = key(nombre);
      const m = mp[k] || null;
      if (precio == null) { sinPrecio.push({ r: f.r, n: nombre }); return; }
      const p = {
        r: f.r, n: nombre, k, p: precio,
        o: /\b(OFERTA|LIQUIDACI[OÓ]N)\b/i.test(nombre),
        s: get("B" + f.r).y || c.y,
        c: m ? m.c : null, bloque: f.bloque, nuevo: !m
      };
      if (m && m.pk) p.pk = m.pk;
      if (m && m.dn) p.dn = m.dn;
      if (m && m.var) {
        const L = listas.find(l => !l.usada && l.col === m.var.col && l.h === m.var.h) || listas.find(l => !l.usada && l.h === m.var.h);
        if (L && L.items.length) {
          L.usada = true;
          p.v = L.items.map(it => ({ n: (m.var.nom && m.var.nom[it.k]) || pretty(it.raw), cell: it.cell, s: it.s }));
          if (p.v.every(x => x.s)) p.s = true;
        } else avisos.push(`No encontré las variantes de "${nombre}" (busqué la lista "${m.var.h}"). Va sin variantes.`);
      }
      productos.push(p);
    });

    // Rubro de productos nuevos: el mas comun de su bloque
    const porBloque = {};
    productos.forEach(p => { if (p.c) { const b = porBloque[p.bloque] = porBloque[p.bloque] || {}; b[p.c] = (b[p.c] || 0) + 1; } });
    productos.forEach(p => {
      if (p.c) return;
      const b = porBloque[p.bloque];
      p.c = b ? Object.entries(b).sort((a, z) => z[1] - a[1])[0][0] : "Otros";
    });

    const nuevos = productos.filter(p => p.nuevo);
    const listasSueltas = listas.filter(l => !l.usada && l.items.length);
    const viejos = new Set(productos.map(p => p.k));
    const desaparecidos = Object.keys(mp).filter(k => !viejos.has(k) && !sinPrecio.some(s => key(s.n) === k));

    return { hoja, productos, sinPrecio, nuevos, listasSueltas, desaparecidos, avisos };
  }

  /* Escribe cantidades sobre el archivo original. qty = { "A12": 3, "E17": 2 } */
  async function writeQty(buf, hoja, qty) {
    const zip = await JSZip.loadAsync(buf);
    const { path } = await sheetPath(zip, hoja);
    const d = xml(await zip.file(path).async("string"));
    const sheetData = kids(d, "sheetData")[0];
    const rows = {};
    kids(sheetData, "row").forEach(r => rows[+r.getAttribute("r")] = r);

    Object.entries(qty).forEach(([ref, n]) => {
      if (!n) return;
      const { col, row } = splitRef(ref);
      let rEl = rows[row];
      if (!rEl) {
        rEl = d.createElementNS(NS, "row"); rEl.setAttribute("r", row);
        const after = Object.keys(rows).map(Number).filter(x => x > row).sort((a, b) => a - b)[0];
        sheetData.insertBefore(rEl, after ? rows[after] : null); rows[row] = rEl;
      }
      const cs = kids(rEl, "c");
      let c = cs.find(x => x.getAttribute("r") === ref);
      if (!c) {
        c = d.createElementNS(NS, "c"); c.setAttribute("r", ref);
        const next = cs.find(x => colNum(splitRef(x.getAttribute("r")).col) > colNum(col));
        // hereda el estilo de la fila si existe
        rEl.insertBefore(c, next || null);
      }
      c.removeAttribute("t");
      while (c.firstChild) c.removeChild(c.firstChild);
      const v = d.createElementNS(NS, "v"); v.textContent = String(n); c.appendChild(v);
      // ajusta el rango "spans" si hace falta
      const sp = rEl.getAttribute("spans");
      if (sp) { const [a, b] = sp.split(":").map(Number); const cn = colNum(col); if (cn < a || cn > b) rEl.setAttribute("spans", Math.min(a, cn) + ":" + Math.max(b, cn)); }
    });

    zip.file(path, new XMLSerializer().serializeToString(d));
    // que Excel recalcule las formulas (subtotales y total) al abrir
    let wb = await zip.file("xl/workbook.xml").async("string");
    if (/<calcPr\b/.test(wb)) wb = wb.replace(/<calcPr\b([^>]*?)\/?>/, (m, a) => "<calcPr" + a.replace(/\sfullCalcOnLoad="[^"]*"/, "") + ' fullCalcOnLoad="1"/>');
    else wb = wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file("xl/workbook.xml", wb);
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE" });
  }

  window.ExcelProveedor = { parse, writeQty, key, pretty };
})();
