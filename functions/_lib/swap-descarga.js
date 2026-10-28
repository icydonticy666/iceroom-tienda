// Descarga de swap con registro: antes de bajar el instalador se pide (solo) el correo.
// /api/swap-descarga guarda el correo y entrega un enlace /swap/<os>?e=<vence>&t=<firma>;
// /swap/<os> solo redirige al instalador con una firma vigente (15 min). Sin firma, vuelve a la
// página con el formulario abierto, así también los enlaces viejos de correos pasan por el registro.

export const SISTEMAS = ["windows", "mac", "intel"];
export const VIGENCIA = 15 * 60;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function correoValido(valor) {
  const email = String(valor || "").trim().toLowerCase();
  return CORREO.test(email) && email.length <= 200 ? email : "";
}

async function hmac(secreto, texto) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(texto));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function enlaceFirmado(secreto, os, ahora = Math.floor(Date.now() / 1000)) {
  const vence = ahora + VIGENCIA;
  return `/swap/${os}?e=${vence}&t=${await hmac(secreto, `swap-descarga:${os}:${vence}`)}`;
}

export async function firmaValida(secreto, os, vence, firma, ahora = Math.floor(Date.now() / 1000)) {
  if (!secreto || !SISTEMAS.includes(os) || !/^\d{9,12}$/.test(String(vence)) || Number(vence) < ahora) return false;
  const esperada = await hmac(secreto, `swap-descarga:${os}:${vence}`);
  const dada = String(firma || "");
  if (dada.length !== esperada.length) return false;
  let r = 0;
  for (let i = 0; i < dada.length; i++) r |= dada.charCodeAt(i) ^ esperada.charCodeAt(i);
  return r === 0;
}

// ── Invitaciones a swap Pro desde iceroom.cl ─────────────────────────────
// iceroom.cl/swap.html?invitacion=<código>: el productor deja su correo y elige sistema; si el
// código existe, está activo y le quedan cupos, se activa Pro para ese correo en el servidor de
// licencias y empieza la descarga. Cada correo gasta un cupo una sola vez (repetir no descuenta).
// Los códigos se crean en D1: INSERT INTO swap_invitaciones (codigo, cupos, nota, creado) …
export function codigoValido(valor) {
  const codigo = String(valor || "").trim();
  return /^[A-Za-z0-9_-]{6,40}$/.test(codigo) ? codigo : "";
}

async function tablasInvitacion(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS swap_invitaciones (codigo TEXT PRIMARY KEY, cupos INTEGER NOT NULL, " +
    "usados INTEGER NOT NULL DEFAULT 0, activa INTEGER NOT NULL DEFAULT 1, nota TEXT, creado TEXT NOT NULL)"
  ).run();
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS swap_invitacion_usos (codigo TEXT NOT NULL, email TEXT NOT NULL, " +
    "creado TEXT NOT NULL, PRIMARY KEY (codigo, email))"
  ).run();
}

/** { ok: true, nuevo } si el correo queda con su cupo (o ya lo tenía); { error } si no. */
export async function usarInvitacion(db, codigo, email) {
  await tablasInvitacion(db);
  const inv = await db.prepare("SELECT cupos, usados, activa FROM swap_invitaciones WHERE codigo = ?1").bind(codigo).first();
  if (!inv || !inv.activa) return { error: "invalida" };
  const previo = await db.prepare("SELECT 1 FROM swap_invitacion_usos WHERE codigo = ?1 AND email = ?2").bind(codigo, email).first();
  if (previo) return { ok: true, nuevo: false };
  // Descuenta el cupo solo si queda alguno (atómico en una sola sentencia).
  const r = await db.prepare("UPDATE swap_invitaciones SET usados = usados + 1 WHERE codigo = ?1 AND usados < cupos AND activa = 1")
    .bind(codigo).run();
  if (!r.meta?.changes) return { error: "agotada" };
  await db.prepare("INSERT OR IGNORE INTO swap_invitacion_usos (codigo, email, creado) VALUES (?1, ?2, ?3)")
    .bind(codigo, email, new Date().toISOString()).run();
  return { ok: true, nuevo: true };
}

export async function devolverCupo(db, codigo, email) {
  await db.prepare("DELETE FROM swap_invitacion_usos WHERE codigo = ?1 AND email = ?2").bind(codigo, email).run();
  await db.prepare("UPDATE swap_invitaciones SET usados = usados - 1 WHERE codigo = ?1 AND usados > 0").bind(codigo).run();
}

export async function registrarDescarga(db, email, os, origen = "") {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS swap_descargas (email TEXT NOT NULL, os TEXT NOT NULL, origen TEXT, " +
    "creado TEXT NOT NULL, veces INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (email, os))"
  ).run();
  await db.prepare(
    "INSERT INTO swap_descargas (email, os, origen, creado) VALUES (?1, ?2, ?3, ?4) " +
    "ON CONFLICT(email, os) DO UPDATE SET veces = veces + 1"
  ).bind(email, os, String(origen).slice(0, 200), new Date().toISOString()).run();
}
