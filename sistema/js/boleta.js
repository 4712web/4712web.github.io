/* Boleta PDF del cliente, con el mismo diseño que la boleta de Distribuidora Martinez. */
(function () {
  const money = n => (Math.round(n * 100) / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // "ACTRON 600 caja x 20" -> "Actron 600 caja x 20"
  const nombreBoleta = s => String(s).replace(/\s+/g, " ").trim()
    .replace(/[A-ZÁÉÍÓÚÑÜ]{2,}/g, w => w[0] + w.slice(1).toLowerCase());

  function imgToPng(src) {
    return new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
        c.getContext("2d").drawImage(im, 0, 0);
        ok({ data: c.toDataURL("image/png"), w: im.naturalWidth, h: im.naturalHeight });
      };
      im.onerror = fail; im.src = src;
    });
  }

  function gradiente(w, h) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, w, h * 0.6);
    gr.addColorStop(0, "#0B3F95"); gr.addColorStop(0.55, "#1F68C8"); gr.addColorStop(1, "#2B93EA");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    return c.toDataURL("image/png");
  }

  function redondeado(doc, x, y, w, h, r) { doc.roundedRect(x, y, w, h, r, r, "F"); }

  /* pedido = { cliente, fecha:"dd/mm/aaaa", lineas:[{cant, nombre, unit}], total }
     neg = { nombre, logo (url) } */
  async function generar(pedido, neg) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 30;

    // Encabezado azul con logo
    const HH = 170;
    doc.addImage(gradiente(600, 170), "PNG", 0, 0, W, HH);
    if (neg.logo) {
      try {
        const lg = await imgToPng(neg.logo);
        const bw = 112, bh = 112, bx = (W - bw) / 2, by = 22;
        doc.setFillColor(255, 255, 255); redondeado(doc, bx, by, bw, bh, 14);
        const sc = Math.min((bw - 16) / lg.w, (bh - 16) / lg.h);
        doc.addImage(lg.data, "PNG", bx + (bw - lg.w * sc) / 2, by + (bh - lg.h * sc) / 2, lg.w * sc, lg.h * sc);
      } catch (e) { /* sin logo */ }
    }
    doc.setTextColor(220, 232, 250); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    doc.text("B O L E T A   D E   V E N T A", W / 2, 152, { align: "center" });

    // Cliente y fecha
    let y = HH + 34;
    doc.setTextColor(120, 132, 150); doc.setFontSize(9);
    doc.text("CLIENTE", M, y); doc.text("FECHA", W - M, y, { align: "right" });
    doc.setTextColor(23, 33, 51); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
    doc.text(String(pedido.cliente || "-"), M, y + 17); doc.text(pedido.fecha, W - M, y + 17, { align: "right" });
    if (pedido.detalle) { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 132, 150); doc.text(pedido.detalle, M, y + 31); }
    y += pedido.detalle ? 44 : 34;
    doc.setDrawColor(210, 218, 228); doc.setLineDashPattern([3, 3], 0); doc.line(0, y, W, y); doc.setLineDashPattern([], 0);

    doc.autoTable({
      startY: y + 1,
      margin: { left: 0, right: 0 },
      head: [["CANT.", "DESCRIPCIÓN", "P. UNIT.", "SUBTOTAL"]],
      body: pedido.lineas.map(l => [String(l.cant), nombreBoleta(l.nombre), money(l.unit), money(l.unit * l.cant)]),
      theme: "plain",
      styles: { font: "helvetica", fontSize: 10, textColor: [33, 41, 56], cellPadding: { top: 9, bottom: 9, left: 6, right: 6 } },
      headStyles: { fontStyle: "bold", fontSize: 8, textColor: [120, 132, 150], fillColor: [238, 242, 247] },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: {
        0: { halign: "center", cellWidth: 70 },
        1: { halign: "left" },
        2: { halign: "right", cellWidth: 100 },
        3: { halign: "right", cellWidth: 110, cellPadding: { top: 9, bottom: 9, left: 6, right: M } }
      },
      didParseCell: d => {
        if (d.section !== "head") return;
        d.cell.styles.halign = ["center", "left", "right", "right"][d.column.index];
        if (d.column.index === 3) d.cell.styles.cellPadding = { top: 9, bottom: 9, left: 6, right: M };
      },
      didDrawCell: d => { if (d.section === "body") { doc.setDrawColor(232, 236, 242); doc.line(0, d.cell.y + d.cell.height, W, d.cell.y + d.cell.height); } }
    });

    y = doc.lastAutoTable.finalY + 26;
    if (y > H - 110) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(130, 140, 156);
    doc.text("Subtotal", M, y); doc.text("$ " + money(pedido.total), W - M, y, { align: "right" });
    y += 14; doc.setDrawColor(40, 52, 72); doc.setLineWidth(1); doc.line(M, y, W - M, y);
    y += 26; doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(18, 76, 170);
    doc.text("TOTAL", M, y); doc.text("$ " + money(pedido.total), W - M, y, { align: "right" });
    y += 50; doc.setFontSize(9); doc.setTextColor(130, 140, 156);
    doc.text(neg.nombre || "", W / 2, y, { align: "center" });
    doc.setFont("helvetica", "normal"); doc.text("¡Gracias por su compra!", W / 2, y + 14, { align: "center" });

    return doc.output("blob");
  }

  window.Boleta = { generar, nombreBoleta, money };
})();
