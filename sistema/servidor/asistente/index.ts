// Supabase Edge Function "asistente".
// Recibe la conversación del panel, controla la clave y el límite de gasto del mes,
// le pregunta a Claude y devuelve la respuesta. Las herramientas se ejecutan en el
// navegador del distribuidor; acá solo están sus definiciones.
//
// Variables (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY   clave de la API de Claude (console.anthropic.com)
//   MODELO              opcional, por defecto claude-haiku-5-5
//   PRECIO_IN / PRECIO_OUT  opcional, USD por millón de tokens (por defecto 0.10 / 0.50)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las pone Supabase solo.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODELO = Deno.env.get("MODELO") ?? "claude-haiku-5-5";
const PRECIO_IN = Number(Deno.env.get("PRECIO_IN") ?? "0.10");
const PRECIO_OUT = Number(Deno.env.get("PRECIO_OUT") ?? "0.50");

const anthropic = new Anthropic(); // lee ANTHROPIC_API_KEY
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SISTEMA = `Sos el asistente del panel de pedidos de una distribuidora argentina que le vende a kioscos y almacenes.
Hablás en español rioplatense, corto y claro: el usuario usa el celular y no es técnico.
Usá las herramientas para todo lo que tenga que ver con productos, pedidos, archivos y ganancias; nunca inventes precios, stock ni pedidos.
- Para cargar un pedido usá armar_pedido con el cliente y cada producto tal como lo dijo el usuario (con su variante si la nombró). El pedido queda como borrador: el usuario lo guarda con un botón. Si la herramienta avisa dudas, preguntá.
- Excel para el depósito y boletas: la herramienta prepara un botón para descargar; decile que lo toque.
- Faltantes del depósito: usá marcar_sin_stock; el usuario confirma con un botón.
- Montos en pesos con punto de miles (ej: $ 15.000). Fechas dd/mm/aaaa.
Si te piden algo que no tiene que ver con la distribuidora, respondé brevemente que solo ayudás con el negocio.`;

const TOOLS: Anthropic.Tool[] = [
  { name: "buscar_productos", description: "Busca productos en la lista actual del proveedor. Devuelve precio de lista, precio mayorista, pack mínimo, oferta, sin stock y variantes.",
    input_schema: { type: "object", properties: { texto: { type: "string", description: "Lo que hay que buscar, ej: 'tafirol', 'pilas aa'" } }, required: ["texto"] } },
  { name: "armar_pedido", description: "Arma un borrador de pedido para un cliente. Resuelve los productos contra la lista y avisa sin stock, pack mínimo y compra mínima.",
    input_schema: { type: "object", properties: {
      cliente: { type: "string" },
      tipo: { type: "string", description: "Mayorista, Minorista o Revendedor. Vacío si no se sabe." },
      items: { type: "array", items: { type: "object", properties: {
        producto: { type: "string", description: "Nombre como lo dijo el usuario" },
        variante: { type: "string", description: "Color/aroma si lo dijo, si no vacío" },
        cantidad: { type: "integer" } }, required: ["producto", "cantidad"] } },
      aclaraciones: { type: "string" } }, required: ["cliente", "items"] } },
  { name: "listar_pedidos", description: "Lista los pedidos guardados de un día con totales.",
    input_schema: { type: "object", properties: { dia: { type: "string", description: "'hoy', 'ayer' o dd/mm" } }, required: ["dia"] } },
  { name: "ganancias", description: "Cobrado a clientes, pagado al depósito y ganancia entre dos fechas (inclusive).",
    input_schema: { type: "object", properties: { desde: { type: "string", description: "'hoy', 'ayer', dd/mm o aaaa-mm-dd" }, hasta: { type: "string" } }, required: ["desde", "hasta"] } },
  { name: "excel_proveedor", description: "Prepara el Excel para el depósito: de un cliente, o de todos los pedidos de un día si cliente está vacío.",
    input_schema: { type: "object", properties: { cliente: { type: "string" }, dia: { type: "string" } }, required: ["cliente", "dia"] } },
  { name: "boleta", description: "Prepara la boleta PDF del último pedido de un cliente.",
    input_schema: { type: "object", properties: { cliente: { type: "string" }, dia: { type: "string", description: "Vacío = el último pedido" } }, required: ["cliente"] } },
  { name: "marcar_sin_stock", description: "Propone marcar productos sin stock (el usuario confirma).",
    input_schema: { type: "object", properties: { productos: { type: "array", items: { type: "string" } } }, required: ["productos"] } },
];

async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "metodo" }, 405);

  let body: { distribuidor?: string; clave?: string; messages?: Anthropic.MessageParam[]; contexto?: string };
  try { body = await req.json(); } catch { return json({ error: "json", mensaje: "Pedido inválido" }, 400); }
  const { distribuidor, clave, messages, contexto } = body;
  if (!distribuidor || !clave || !Array.isArray(messages) || !messages.length) return json({ error: "datos", mensaje: "Faltan datos" }, 400);
  if (messages.length > 60 || JSON.stringify(messages).length > 200_000) return json({ error: "largo", mensaje: "Conversación demasiado larga" }, 413);

  // 1) ¿Quién es y está activa la IA?
  const { data: d } = await db.from("distribuidores").select("clave_hash, ia_activa, limite_usd").eq("id", distribuidor).maybeSingle();
  if (!d || d.clave_hash !== (await sha256(clave))) return json({ error: "clave", mensaje: "Clave incorrecta" }, 401);
  if (!d.ia_activa) return json({ error: "ia_apagada", mensaje: "La IA no está activada" }, 403);

  // 2) ¿Le queda presupuesto este mes?
  const mes = new Date().toISOString().slice(0, 7);
  const { data: u } = await db.from("uso_ia").select("usd").eq("distribuidor", distribuidor).eq("mes", mes).maybeSingle();
  const gastado = Number(u?.usd ?? 0), limite = Number(d.limite_usd);
  if (gastado >= limite) return json({ error: "limite", mensaje: "Límite de gasto del mes alcanzado", uso: { usd: gastado, limite } }, 429);

  // 3) Preguntarle a Claude
  let r: Anthropic.Message;
  try {
    r = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
        { type: "text", text: contexto ? String(contexto).slice(0, 1000) : "" },
      ],
      tools: TOOLS,
      messages,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: "ocupado", mensaje: "La IA está ocupada, probá en un rato" }, 503);
    if (e instanceof Anthropic.APIError) return json({ error: "ia", mensaje: `Error de la IA (${e.status})` }, 502);
    return json({ error: "red", mensaje: "No se pudo conectar con la IA" }, 502);
  }

  // 4) Sumar lo gastado. Se cuenta todo lo leído a precio de entrada completo:
  //    sobreestima un poco, así el límite nunca se pasa por abajo.
  const us = r.usage;
  const tokIn = (us.input_tokens ?? 0) + (us.cache_creation_input_tokens ?? 0) + (us.cache_read_input_tokens ?? 0);
  const costo = (tokIn * PRECIO_IN + (us.output_tokens ?? 0) * PRECIO_OUT) / 1_000_000;
  const { data: total } = await db.rpc("sumar_uso", { d: distribuidor, m: mes, c: costo });

  return json({ content: r.content, stop_reason: r.stop_reason, uso: { usd: Number(total ?? gastado + costo), limite } });
});
