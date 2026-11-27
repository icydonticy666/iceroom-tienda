import { json } from "../_lib/http.js";
import { correoAvisos, enviarCorreo } from "../_lib/proyectos.js";

// Postulación a las membresías ICYCOLD (iceroom.cl/icycold, 27-nov-2026).
// Desde el 27-nov-2026 solo para planes internacionales (Chile paga directo con Flow: icycold-suscribir.js).
// No cobra. Guarda la postulación, avisa a soporte@ y le confirma al artista;
// si icycold acepta, se le manda el link de pago del primer mes (Chile: $10.000 menos).

import { DESCUENTO_PRIMER_MES, PLANES } from "../_lib/icycold.js";
export { DESCUENTO_PRIMER_MES, PLANES };

const limpio = (v, max) => String(v || "").replace(/[\u0000-\u0008\u000b-\u001f]/g, " ").trim().slice(0, max);
const clp = (n) => "$" + n.toLocaleString("es-CL");

async function tabla(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS membresia_postulaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, " +
    "creado TEXT NOT NULL, region TEXT NOT NULL, plan TEXT NOT NULL, nombre TEXT NOT NULL, email TEXT NOT NULL, " +
    "artista TEXT, musica TEXT, objetivo TEXT, pais TEXT, estado TEXT NOT NULL DEFAULT 'nueva')").run();
}

export async function onRequestPost({ request, env }) {
  if (!env.PAYMENTS_DB) return json({ error: "Las postulaciones no están disponibles en este momento." }, 503);
  const d = await request.json().catch(() => null);
  if (!d || typeof d !== "object") return json({ error: "Datos no válidos." }, 400);
  if (d.web) return json({ ok: true }); // campo trampa: lo llenan solo los bots

  const region = d.region === "int" ? "int" : "cl";
  const base = PLANES[d.plan];
  if (!base) return json({ error: "Elige una membresía." }, 400);
  const plan = { ...base, nombre: region === "int" && base.nombreInt ? base.nombreInt : base.nombre };
  if (region === "int" && !plan.usd) return json({ error: "Ese plan es solo en Chile (incluye estudio presencial)." }, 400);
  const nombre = limpio(d.nombre, 80);
  const email = limpio(d.email, 160).toLowerCase();
  const artista = limpio(d.artista, 120);
  const musica = limpio(d.musica, 600);
  const objetivo = limpio(d.objetivo, 2000);
  if (nombre.length < 2) return json({ error: "Escribe tu nombre." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Revisa tu correo." }, 400);
  if (musica.length < 4) return json({ error: "Déjanos un link a tu música (Spotify, YouTube, SoundCloud, Drive…)." }, 400);

  const db = env.PAYMENTS_DB;
  await tabla(db);
  const hace = new Date(Date.now() - 3600e3).toISOString();
  const previas = await db.prepare("SELECT COUNT(*) AS n FROM membresia_postulaciones WHERE email = ?1 AND creado > ?2").bind(email, hace).first();
  if ((previas?.n || 0) >= 3) return json({ error: "Ya recibimos tu reserva. Te respondemos pronto." }, 429);

  const pais = limpio(request.cf?.country, 4);
  const creado = new Date().toISOString();
  const r = await db.prepare("INSERT INTO membresia_postulaciones (creado, region, plan, nombre, email, artista, musica, objetivo, pais) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
    .bind(creado, region, d.plan, nombre, email, artista || null, musica, objetivo || null, pais || null).run();
  const id = r.meta?.last_row_id || "";

  const precio = region === "cl"
    ? `${clp(plan.cl - DESCUENTO_PRIMER_MES)} el primer mes, luego ${clp(plan.cl)} CLP al mes`
    : `desde US$${plan.usd} al mes (remoto)`;

  await enviarCorreo(env, {
    to: correoAvisos(env),
    subject: `Nueva reserva ICYCOLD #${id}: ${plan.nombre} · ${nombre}`,
    text: [
      `Membresía: ${plan.nombre} (${region === "cl" ? "Chile" : "Internacional"}) · ${precio}`,
      `Nombre: ${nombre}`,
      `Correo: ${email}`,
      artista && `Artista / IG: ${artista}`,
      `Música: ${musica}`,
      objetivo && `\nQué quiere lograr:\n${objetivo}`,
      pais && `\nPaís (Cloudflare): ${pais}`,
    ].filter(Boolean).join("\n"),
  });

  await enviarCorreo(env, {
    to: email,
    subject: `Recibimos tu reserva de ${plan.nombre} · ICYCOLD`,
    text: `Hola ${nombre}!\n\n` +
      `Recibimos tu reserva de la membresía ${plan.nombre} (${precio}).\n\n` +
      "Escucho tu música y te confirmo el cupo a este correo en los próximos días, con el link para pagar " +
      "el primer mes. Apenas pagas, partimos con tu primera canción.\n\n" +
      "No se ha cobrado nada todavía." +
      "\n\n— icycold · iceroom\nResponde este correo si tienes cualquier duda.",
  });

  return json({ ok: true, id });
}

// ─── Panel /estudio (Bearer ESTUDIO_TOKEN) ───────────────────────────────────
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
const ESTADOS = new Set(["nueva", "aceptada", "descartada"]);

export async function onRequestGet({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  await tabla(env.PAYMENTS_DB);
  const { results } = await env.PAYMENTS_DB.prepare("SELECT * FROM membresia_postulaciones ORDER BY id DESC LIMIT 200").all();
  return json({ postulaciones: (results || []).map((p) => {
    const plan = PLANES[p.plan];
    return { ...p, planNombre: plan ? (p.region === "int" && plan.nombreInt) || plan.nombre : p.plan };
  }) });
}

export async function onRequestPatch({ request, env }) {
  if (!env.PAYMENTS_DB || !env.ESTUDIO_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (!autorizado(request, env)) return json({ error: "Clave incorrecta." }, 401);
  const d = await request.json().catch(() => ({})) || {};
  if (!ESTADOS.has(d.estado)) return json({ error: "Estado no válido." }, 400);
  await env.PAYMENTS_DB.prepare("UPDATE membresia_postulaciones SET estado = ?1 WHERE id = ?2").bind(d.estado, Number(d.id)).run();
  return json({ ok: true });
}
