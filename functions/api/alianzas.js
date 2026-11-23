import { json, siteOrigin } from "../_lib/http.js";
import { PAQUETES, codigoSwap, sha256, tablaAlianzas } from "../_lib/regalos.js";

// Alianza con productores (23-nov-2026), desde el panel /estudio (Bearer ESTUDIO_TOKEN).
// Cada alianza = link privado /regalo/<token> con el paquete (Full Pritti + SWAP Pro, 1 activación de
// Pro) + opcionalmente un cupón de Payhip para la audiencia del productor (sirve en PayPal y en pesos),
// que es lo que permite medir cuántas ventas trae cada uno.

function igual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function autorizado(request, env) {
  const clave = String(env.ESTUDIO_TOKEN || "").trim();
  const enviado = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return clave.length >= 32 && igual(enviado, clave);
}
const limpio = (v, max) => String(v || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

async function tablaInvitaciones(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS swap_invitaciones (codigo TEXT PRIMARY KEY, cupos INTEGER NOT NULL, " +
    "usados INTEGER NOT NULL DEFAULT 0, activa INTEGER NOT NULL DEFAULT 1, nota TEXT, creado TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS swap_invitacion_usos (codigo TEXT NOT NULL, email TEXT NOT NULL, " +
    "creado TEXT NOT NULL, PRIMARY KEY (codigo, email))").run();
}

/** Cupón de Payhip sobre el total del pedido. Devuelve null si salió bien o el motivo si no. */
async function crearCupon(env, codigo, descuento, nombre) {
  if (!env.PAYHIP_API_KEY) return "Falta la clave de Payhip.";
  const body = new URLSearchParams({ code: codigo, coupon_type: "multi", percent_off: String(descuento), notes: `Alianza productores: ${nombre}` });
  const res = await fetch("https://payhip.com/api/v2/coupons", {
    method: "POST",
    headers: { "payhip-api-key": env.PAYHIP_API_KEY, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (res.ok) return null;
  const texto = (await res.text()).slice(0, 200);
  console.error(JSON.stringify({ alianza_cupon_error: res.status, texto }));
  return /exist|already|taken/i.test(texto) ? "Ese código ya existe en Payhip: elige otro." : "Payhip no aceptó el cupón; créalo a mano en Payhip.";
}

async function vista(env, fila, origin) {
  const codigo = await codigoSwap(fila.token);
  const usos = await env.PAYMENTS_DB.prepare("SELECT email, creado FROM swap_invitacion_usos WHERE codigo = ?1").bind(codigo).all().catch(() => ({ results: [] }));
  return {
    id: fila.id, nombre: fila.nombre, contacto: fila.contacto || "", cupon: fila.cupon || "", descuento: fila.descuento || 0,
    paquete: PAQUETES[fila.paquete]?.titulo || fila.paquete, activa: Boolean(fila.activa),
    visitas: fila.visitas, descargas: fila.descargas, creado: fila.creado, ultima: fila.ultima,
    link: `${origin}/regalo/${fila.token}`, swapActivado: (usos.results || []).map((u) => u.email),
  };
}

export async function onRequestGet({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  await tablaAlianzas(env.PAYMENTS_DB);
  const { results } = await env.PAYMENTS_DB.prepare("SELECT * FROM alianzas ORDER BY id DESC LIMIT 200").all();
  const origin = siteOrigin(request, env);
  return json({ alianzas: await Promise.all((results || []).map((f) => vista(env, f, origin))) });
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  const db = env.PAYMENTS_DB;
  await tablaAlianzas(db);
  const datos = await request.json().catch(() => ({})) || {};
  const origin = siteOrigin(request, env);

  if (datos.accion === "activa") {
    await db.prepare("UPDATE alianzas SET activa = ?1 WHERE id = ?2").bind(datos.activa ? 1 : 0, Number(datos.id)).run();
    const fila = await db.prepare("SELECT * FROM alianzas WHERE id = ?1").bind(Number(datos.id)).first();
    if (!fila) return json({ error: "No existe." }, 404);
    // Desactivar también cierra la activación de SWAP Pro que no se haya usado.
    await db.prepare("UPDATE swap_invitaciones SET activa = ?1 WHERE codigo = ?2").bind(datos.activa ? 1 : 0, await codigoSwap(fila.token)).run().catch(() => {});
    return json(await vista(env, fila, origin));
  }

  if (datos.accion !== "crear") return json({ error: "Acción no válida." }, 400);
  const nombre = limpio(datos.nombre, 80);
  if (nombre.length < 2) return json({ error: "Escribe el nombre o @ del productor." }, 400);
  const contacto = limpio(datos.contacto, 160);
  const descuento = Math.round(Number(datos.descuento) || 0);
  if (descuento < 0 || descuento > 50) return json({ error: "El descuento va de 0 a 50%." }, 400);
  let cupon = "";
  if (descuento > 0) {
    cupon = limpio(datos.cupon, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!cupon) cupon = (nombre.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "ALIANZA") + descuento;
    if (cupon.length < 4) return json({ error: "El código del cupón es muy corto." }, 400);
  }
  const paquete = PAQUETES[datos.paquete] ? datos.paquete : "pritti-full-swap";

  // Cupón primero: si Payhip lo rechaza (código repetido), no se crea nada y se puede reintentar.
  if (cupon) {
    const error = await crearCupon(env, cupon, descuento, nombre);
    if (error) return json({ error }, 409);
  }
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const ahora = new Date().toISOString();
  await db.prepare("INSERT INTO alianzas (hash, token, nombre, contacto, cupon, descuento, paquete, creado) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(await sha256(token), token, nombre, contacto || null, cupon || null, descuento || null, paquete, ahora).run();
  if (PAQUETES[paquete].swapPro) {
    await tablaInvitaciones(db);
    await db.prepare("INSERT OR IGNORE INTO swap_invitaciones (codigo, cupos, nota, creado) VALUES (?1, 1, ?2, ?3)")
      .bind(await codigoSwap(token), `Alianza productores: ${nombre}`, ahora).run();
  }
  const fila = await db.prepare("SELECT * FROM alianzas WHERE hash = ?1").bind(await sha256(token)).first();
  return json(await vista(env, fila, origin));
}
