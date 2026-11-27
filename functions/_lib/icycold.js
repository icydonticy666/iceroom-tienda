// Membresías ICYCOLD (iceroom.cl/icycold). Desde el 27-nov-2026, en Chile se pagan directo con Flow:
// 1) el artista registra su tarjeta (customer/register), 2) se cobra el primer mes con $10.000 menos
// (customer/charge) y 3) queda suscrito al plan mensual de Flow al precio normal desde el mes siguiente
// (subscription/create con subscription_start = +1 mes). Garantía: si el proyecto no calza, se devuelve
// el 100% dentro de 48 horas (la devolución se hace a mano en el panel de Flow).
import { flowRequest } from "./flow.js";
import { correoAvisos, enviarCorreo } from "./proyectos.js";

export const PLANES = {
  "mix-master":      { nombre: "Mix & Master",         cl: 89990,  usd: 65 },
  "recording-mix":   { nombre: "Recording + Mix",      cl: 119990, usd: null },
  "full-remoto":     { nombre: "Full Prod Remoto",     cl: 119990, usd: 99, nombreInt: "Full Production" },
  "full-presencial": { nombre: "Full Prod Presencial", cl: 149990, usd: null },
  "artist-dev":      { nombre: "Artist Development",   cl: 189990, usd: 149 },
};
export const DESCUENTO_PRIMER_MES = 10000;
export const planFlowId = (plan) => `icycold-${plan}`;

export const limpio = (v, max) => String(v || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);
export const clp = (n) => "$" + Number(n).toLocaleString("es-CL");
export const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export async function tablaMembresias(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS membresias (id INTEGER PRIMARY KEY AUTOINCREMENT, creado TEXT NOT NULL, " +
    "actualizado TEXT, plan TEXT NOT NULL, nombre TEXT NOT NULL, email TEXT NOT NULL, artista TEXT, musica TEXT, objetivo TEXT, " +
    "pais TEXT, estado TEXT NOT NULL DEFAULT 'tarjeta', flow_customer TEXT, flow_subscription TEXT, primer_cobro TEXT, " +
    "primer_monto INTEGER, tarjeta TEXT, nota TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS membresia_cobros (id INTEGER PRIMARY KEY AUTOINCREMENT, creado TEXT NOT NULL, " +
    "membresia INTEGER, flow_order TEXT, commerce_order TEXT, monto INTEGER, estado INTEGER, payer TEXT, origen TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS icycold_config (clave TEXT PRIMARY KEY, valor TEXT)").run();
}

/** El pago directo se abre solo cuando los 5 planes existen en Flow (botón "Crear planes en Flow" de /estudio). */
export async function pagoDirectoListo(env) {
  if (!flowListo(env)) return false;
  await tablaMembresias(env.PAYMENTS_DB);
  const fila = await env.PAYMENTS_DB.prepare("SELECT valor FROM icycold_config WHERE clave = 'planes_flow'").first();
  return fila?.valor === "1";
}

/** Fecha yyyy-mm-dd en Santiago, un mes después de `desde` (si el día no existe, el último del mes). */
export function unMesDespues(desde = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(desde).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  const ultimo = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

const ahora = () => new Date().toISOString();
const llave = (env) => ({ apiKey: env.FLOW_API_KEY });

export function flowListo(env) {
  return Boolean(env.FLOW_API_KEY && env.FLOW_SECRET_KEY && env.PAYMENTS_DB);
}

/** Paso 1: guarda la membresía, crea el cliente en Flow y devuelve la URL para registrar la tarjeta. */
export async function iniciarMembresia(env, origin, datos) {
  const db = env.PAYMENTS_DB;
  await tablaMembresias(db);
  const fila = await db.prepare("INSERT INTO membresias (creado, actualizado, plan, nombre, email, artista, musica, objetivo, pais) " +
    "VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) RETURNING id")
    .bind(ahora(), datos.plan, datos.nombre, datos.email, datos.artista || null, datos.musica || null, datos.objetivo || null, datos.pais || null).first();
  const id = fila.id;
  const cliente = await flowRequest(env, "/customer/create",
    { ...llave(env), name: datos.nombre, email: datos.email, externalId: `icm-${id}` }, "POST");
  await db.prepare("UPDATE membresias SET flow_customer = ?1, actualizado = ?2 WHERE id = ?3").bind(String(cliente.customerId), ahora(), id).run();
  const registro = await flowRequest(env, "/customer/register",
    { ...llave(env), customerId: String(cliente.customerId), url_return: `${origin}/api/icycold-flow-tarjeta?m=${id}` }, "POST");
  if (!registro.url || !registro.token) throw new Error("Flow no devolvió el registro de tarjeta.");
  return { id, url: `${registro.url}?token=${encodeURIComponent(registro.token)}` };
}

/**
 * Paso 2 (vuelta de Flow con la tarjeta registrada): cobra el primer mes y crea la suscripción.
 * Devuelve "ok", "rechazado", "pendiente", "sin-tarjeta" o "error". Nunca cobra dos veces la misma membresía.
 */
export async function completarMembresia(env, id, token) {
  const db = env.PAYMENTS_DB;
  await tablaMembresias(db);
  const m = await db.prepare("SELECT * FROM membresias WHERE id = ?1").bind(Number(id)).first();
  if (!m || !token) return "error";
  if (m.estado === "activa") return "ok";
  if (m.estado !== "tarjeta") return m.estado === "cobro_pendiente" ? "pendiente" : "error";

  const reg = await flowRequest(env, "/customer/getRegisterStatus", { ...llave(env), token }, "GET");
  if (String(reg.customerId) !== String(m.flow_customer)) return "error";
  if (String(reg.status) !== "1") return "sin-tarjeta";

  // Toma la fila para cobrar: si otra vuelta llegó primero, no se cobra de nuevo.
  const tomada = await db.prepare("UPDATE membresias SET estado = 'cobrando', tarjeta = ?1, actualizado = ?2 WHERE id = ?3 AND estado = 'tarjeta'")
    .bind([reg.creditCardType, reg.last4CardDigits].filter(Boolean).join(" ") || null, ahora(), m.id).run();
  if (!tomada.meta?.changes) return "pendiente";

  const plan = PLANES[m.plan];
  const monto = plan.cl - DESCUENTO_PRIMER_MES;
  const orden = `icm-${m.id}-1`;
  let cobro;
  try {
    cobro = await flowRequest(env, "/customer/charge", {
      ...llave(env), customerId: String(m.flow_customer), amount: String(monto), currency: "CLP",
      subject: `ICYCOLD ${plan.nombre} — primer mes`.slice(0, 90), commerceOrder: orden,
    }, "POST");
  } catch (error) {
    // La tarjeta quedó registrada pero el cargo falló: se puede reintentar con otra tarjeta.
    await db.prepare("UPDATE membresias SET estado = 'tarjeta', nota = ?1, actualizado = ?2 WHERE id = ?3")
      .bind(`Cobro rechazado: ${String(error?.message || error).slice(0, 200)}`, ahora(), m.id).run();
    return "rechazado";
  }
  await db.prepare("INSERT INTO membresia_cobros (creado, membresia, flow_order, commerce_order, monto, estado, payer, origen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'primer-mes')")
    .bind(ahora(), m.id, String(cobro.flowOrder || ""), orden, monto, Number(cobro.status || 0), cobro.payer || m.email).run();

  const estado = Number(cobro.status);
  if (estado === 3 || estado === 4) {
    await db.prepare("UPDATE membresias SET estado = 'tarjeta', nota = 'Cobro rechazado por el banco', actualizado = ?1 WHERE id = ?2").bind(ahora(), m.id).run();
    return "rechazado";
  }
  if (estado !== 2) {
    await db.prepare("UPDATE membresias SET estado = 'cobro_pendiente', primer_cobro = ?1, primer_monto = ?2, actualizado = ?3 WHERE id = ?4")
      .bind(String(cobro.flowOrder || ""), monto, ahora(), m.id).run();
    await enviarCorreo(env, { to: correoAvisos(env), subject: `Membresía ICYCOLD #${m.id}: primer cobro pendiente`,
      text: `El primer cobro de ${m.nombre} (${m.email}, ${plan.nombre}) quedó pendiente en Flow (orden ${cobro.flowOrder || "?"}).\nRevísalo en el panel de Flow antes de crear la suscripción. No se creó la suscripción mensual.` });
    return "pendiente";
  }

  let sub = null, notaSub = null;
  try {
    sub = await flowRequest(env, "/subscription/create", {
      ...llave(env), planId: planFlowId(m.plan), customerId: String(m.flow_customer),
      subscription_start: unMesDespues(), external_subscription_id: `icm-${m.id}`,
    }, "POST");
  } catch (error) {
    notaSub = `No se pudo crear la suscripción: ${String(error?.message || error).slice(0, 200)}`;
  }
  await db.prepare("UPDATE membresias SET estado = 'activa', primer_cobro = ?1, primer_monto = ?2, flow_subscription = ?3, nota = ?4, actualizado = ?5 WHERE id = ?6")
    .bind(String(cobro.flowOrder || ""), monto, sub?.subscriptionId ? String(sub.subscriptionId) : null, notaSub, ahora(), m.id).run();
  await avisarAlta(env, m, plan, monto, notaSub);
  return "ok";
}

async function avisarAlta(env, m, plan, monto, notaSub) {
  await enviarCorreo(env, {
    to: correoAvisos(env),
    subject: `Nueva membresía ICYCOLD #${m.id}: ${plan.nombre} · ${m.nombre}`,
    text: [
      `Pagó el primer mes: ${clp(monto)} CLP (Flow). Desde el próximo mes: ${clp(plan.cl)} CLP automático.`,
      notaSub ? `\nATENCIÓN: ${notaSub}. Créala a mano en Flow o desde /estudio.` : "",
      `\nNombre: ${m.nombre}`, `Correo: ${m.email}`,
      m.artista && `Artista / IG: ${m.artista}`, m.musica && `Música: ${m.musica}`,
      m.objetivo && `\nQué quiere lograr:\n${m.objetivo}`,
      "\nGarantía: si el proyecto no calza, devuelve el 100% en el panel de Flow dentro de 48 horas y cancela la membresía en /estudio.",
    ].filter(Boolean).join("\n"),
  });
  await enviarCorreo(env, {
    to: m.email,
    subject: `Bienvenido a ICYCOLD · ${plan.nombre}`,
    text: `Hola ${m.nombre}!\n\n` +
      `Tu membresía ${plan.nombre} está activa. Pagaste ${clp(monto)} CLP por el primer mes; desde el próximo mes se cobran ${clp(plan.cl)} CLP automáticamente a tu tarjeta.\n\n` +
      "Te escribo a este correo para partir con tu primera canción. Si tienes demos, letras o referencias, respóndeme con ellas.\n\n" +
      "Garantía: si en las primeras 48 horas vemos que tu proyecto no calza, te devuelvo el 100%.\n" +
      "Para cancelar la membresía, responde este correo y no se te cobra el mes siguiente." +
      "\n\n— icycold · iceroom",
  });
}

/** Cobro mensual de la suscripción (urlCallback del plan): registra el pago y avisa. */
export async function registrarCobroMensual(env, token) {
  const db = env.PAYMENTS_DB;
  await tablaMembresias(db);
  const st = await flowRequest(env, "/payment/getStatus", { ...llave(env), token }, "GET");
  const ya = await db.prepare("SELECT id FROM membresia_cobros WHERE flow_order = ?1 AND estado = ?2").bind(String(st.flowOrder || ""), Number(st.status || 0)).first();
  if (ya) return st;
  await db.prepare("INSERT INTO membresia_cobros (creado, membresia, flow_order, commerce_order, monto, estado, payer, origen) VALUES (?1, NULL, ?2, ?3, ?4, ?5, ?6, 'mensual')")
    .bind(ahora(), String(st.flowOrder || ""), String(st.commerceOrder || ""), Math.round(Number(st.amount || 0)), Number(st.status || 0), st.payer || null).run();
  const texto = { 1: "pendiente", 2: "pagado", 3: "rechazado", 4: "anulado" }[Number(st.status)] || String(st.status);
  await enviarCorreo(env, {
    to: correoAvisos(env),
    subject: `Cobro mensual ICYCOLD ${texto}: ${clp(st.amount || 0)} · ${st.payer || "?"}`,
    text: `Flow informó un cobro de suscripción.\nEstado: ${texto}\nMonto: ${clp(st.amount || 0)} ${st.currency || "CLP"}\nPagador: ${st.payer || "?"}\nOrden Flow: ${st.flowOrder || "?"}\nConcepto: ${st.subject || ""}`,
  });
  return st;
}

/** Crea en Flow los 5 planes mensuales (una vez). Si un plan ya existe, Flow responde error y se informa. */
export async function crearPlanesFlow(env, origin) {
  const salida = [];
  for (const [clave, plan] of Object.entries(PLANES)) {
    try {
      await flowRequest(env, "/plans/create", {
        ...llave(env), planId: planFlowId(clave), name: `ICYCOLD ${plan.nombre}`, currency: "CLP",
        amount: String(plan.cl), interval: "3", interval_count: "1", urlCallback: `${origin}/api/icycold-flow-cobro`,
      }, "POST");
      salida.push({ plan: planFlowId(clave), ok: true });
    } catch (error) {
      const texto = String(error?.message || error).slice(0, 200);
      // Si el plan ya existía (se apretó el botón dos veces), cuenta como listo.
      salida.push({ plan: planFlowId(clave), ok: /exist/i.test(texto), error: texto });
    }
  }
  if (salida.every((p) => p.ok)) {
    await tablaMembresias(env.PAYMENTS_DB);
    await env.PAYMENTS_DB.prepare("INSERT INTO icycold_config (clave, valor) VALUES ('planes_flow', '1') ON CONFLICT(clave) DO UPDATE SET valor = '1'").run();
  }
  return salida;
}

export async function cancelarMembresia(env, id, inmediato) {
  const db = env.PAYMENTS_DB;
  await tablaMembresias(db);
  const m = await db.prepare("SELECT * FROM membresias WHERE id = ?1").bind(Number(id)).first();
  if (!m) throw new Error("No existe esa membresía.");
  if (m.flow_subscription) {
    await flowRequest(env, "/subscription/cancel", { ...llave(env), subscriptionId: m.flow_subscription, at_period_end: inmediato ? "0" : "1" }, "POST");
  }
  await db.prepare("UPDATE membresias SET estado = 'cancelada', nota = ?1, actualizado = ?2 WHERE id = ?3")
    .bind(inmediato ? "Cancelada de inmediato" : "Cancelada al terminar el mes pagado", ahora(), m.id).run();
}
