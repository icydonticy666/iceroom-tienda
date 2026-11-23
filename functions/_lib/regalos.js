// Regalos con descarga directa, sin cuenta de Payhip (12-nov-2026).
// Cada regalo es un link privado iceroom.cl/regalo/<token>. El repo es público: aquí solo va el
// sha256 del token; el token lo tiene únicamente quien recibe el link. Los archivos viven en el
// bucket R2 privado `iceroom-entregas` (binding ENTREGAS) y se sirven solo con un token válido.
// SWAP Pro se activa con una invitación de 1 cupo cuyo código se deriva del token (ver codigoSwap):
// la fila de swap_invitaciones existe en D1, pero el código no aparece en el repo.

// Plugins Pritti: versiones del 20-nov-2026 (pritti-20261120/, mismas que Payhip). Al sacar versión nueva,
// subirlas a R2 con otro prefijo y cambiar estas rutas: todos los regalos y alianzas quedan al día.
export const ARCHIVOS = {
  "plantilla-fl": { r2: "pack-swap-pro/Plantilla-FL-Studio.rar", nombre: "Plantilla de Grabación — FL Studio", so: "FL Studio 20+" },
  "vocals-win": { r2: "pritti-20261120/Pritti-Vocals-WIN.rar", nombre: "Pritti Vocals", so: "Windows" },
  "vocals-mac": { r2: "pritti-20261120/Pritti-Vocals-Mac.zip", nombre: "Pritti Vocals", so: "Mac" },
  "backroom-win": { r2: "pritti-20261120/Pritti-Backroom-WIN.rar", nombre: "Pritti Backroom", so: "Windows" },
  "backroom-mac": { r2: "pritti-20261120/Pritti-Backroom-Mac.zip", nombre: "Pritti Backroom", so: "Mac" },
  "riri-win": { r2: "pritti-20261120/Pritti-Riri-fx-WIN.zip", nombre: "Pritti Riri fx", so: "Windows" },
  "riri-mac": { r2: "pritti-20261120/Pritti-Riri-fx-Mac.zip", nombre: "Pritti Riri fx", so: "Mac" },
  "grip-win": { r2: "pritti-20261120/Pritti-Grip-WIN.rar", nombre: "Pritti Grip (beta)", so: "Windows" },
  "grip-mac": { r2: "pritti-20261120/Pritti-Grip-Mac.zip", nombre: "Pritti Grip (beta)", so: "Mac" },
  "eco-win": { r2: "pritti-20261120/Pritti-Eco-Delay-WIN.rar", nombre: "Pritti Eco Delay", so: "Windows" },
  "eco-mac": { r2: "pritti-20261120/Pritti-Eco-Delay-Mac.zip", nombre: "Pritti Eco Delay", so: "Mac" },
};

const PRITTI_FULL = ["vocals-win", "vocals-mac", "backroom-win", "backroom-mac", "eco-win", "eco-mac", "grip-win", "grip-mac", "riri-win", "riri-mac"];

const PACK_SWAP_PRO_FL = ["plantilla-fl", "vocals-win", "vocals-mac", "backroom-win", "backroom-mac", "riri-win", "riri-mac", "grip-win", "grip-mac"];

export const REGALOS = {
  // THEWIZARD (12-nov-2026, pedido del usuario): Pack SWAP Pro versión FL Studio, 1 activación de SWAP Pro.
  "4b53f12f631206f7e563442c18be2a2c436fb138d66cd5d0444f8bb1e1a972f3": {
    titulo: "Pack SWAP Pro",
    detalle: "Plantilla de Grabación FL Studio + SWAP Pro + Pritti Vocals, Backroom, Grip (beta) y Riri fx.",
    archivos: PACK_SWAP_PRO_FL,
    swapPro: true,
  },
  // Pritti Grip suelto (12-nov-2026, pedido del usuario): solo descarga, sin SWAP.
  "2d7c9318017c6884e4057fae52d5048416e436858109b7e73ab338be53f4eead": {
    titulo: "Pritti Grip",
    detalle: "Compresor vocal de la familia Pritti (beta), VST3 / AU para Windows y Mac.",
    archivos: ["grip-win", "grip-mac"],
    swapPro: false,
  },
  // Pritti Eco Delay suelto (12-nov-2026, pedido del usuario): solo descarga, sin SWAP.
  "5a9e11ce277b4d75845b86e810dfd4541bf027b6af419bc719cacf3985e51dc5": {
    titulo: "Pritti Eco Delay",
    detalle: "El delay de la familia Pritti, VST3 / AU para Windows y Mac.",
    archivos: ["eco-win", "eco-mac"],
    swapPro: false,
  },
};

async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Alianza con productores (23-nov-2026): cada productor recibe su propio link con estos paquetes.
// Se crean desde /estudio y viven en D1 (tabla alianzas), no en el repo.
export const PAQUETES = {
  "pritti-full-swap": {
    titulo: "Full Pritti + SWAP Pro",
    detalle: "Los 5 plugins Pritti (Vocals, Backroom, Eco Delay, Grip y Riri fx) y SWAP Pro, para Windows y Mac.",
    archivos: PRITTI_FULL,
    swapPro: true,
  },
};

export async function tablaAlianzas(db) {
  await db.prepare(
    "CREATE TABLE IF NOT EXISTS alianzas (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL UNIQUE, token TEXT NOT NULL, " +
    "nombre TEXT NOT NULL, contacto TEXT, cupon TEXT, descuento INTEGER, paquete TEXT NOT NULL DEFAULT 'pritti-full-swap', " +
    "activa INTEGER NOT NULL DEFAULT 1, visitas INTEGER NOT NULL DEFAULT 0, descargas INTEGER NOT NULL DEFAULT 0, " +
    "creado TEXT NOT NULL, ultima TEXT)"
  ).run();
}

/** Regalo del token: primero los fijos del código, después las alianzas de D1 (si hay env). */
export async function regaloDe(token, env) {
  const t = String(token || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const hash = await sha256(t);
  const fijo = REGALOS[hash];
  if (fijo) return fijo.vence && Date.now() > Date.parse(fijo.vence) ? null : fijo;
  if (!env?.PAYMENTS_DB) return null;
  const fila = await env.PAYMENTS_DB.prepare("SELECT id, nombre, paquete, activa FROM alianzas WHERE hash = ?1")
    .bind(hash).first().catch(() => null);
  if (!fila || !fila.activa || !PAQUETES[fila.paquete]) return null;
  return { ...PAQUETES[fila.paquete], alianzaId: fila.id, para: fila.nombre };
}

/** Cuenta visitas y descargas de un link de alianza (no falla la página si D1 falla). */
export async function contarAlianza(env, regalo, campo) {
  if (!regalo?.alianzaId || !env?.PAYMENTS_DB || !["visitas", "descargas"].includes(campo)) return;
  await env.PAYMENTS_DB.prepare(`UPDATE alianzas SET ${campo} = ${campo} + 1, ultima = ?1 WHERE id = ?2`)
    .bind(new Date().toISOString(), regalo.alianzaId).run().catch(() => {});
}

export { sha256 };

/** Código de la invitación de SWAP Pro de este regalo (fila en D1 swap_invitaciones, 1 cupo). */
export async function codigoSwap(token) {
  return "rg-" + (await sha256(`${token}:swap`)).slice(0, 20);
}
