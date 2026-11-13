// Regalos con descarga directa, sin cuenta de Payhip (12-nov-2026).
// Cada regalo es un link privado iceroom.cl/regalo/<token>. El repo es público: aquí solo va el
// sha256 del token; el token lo tiene únicamente quien recibe el link. Los archivos viven en el
// bucket R2 privado `iceroom-entregas` (binding ENTREGAS) y se sirven solo con un token válido.
// SWAP Pro se activa con una invitación de 1 cupo cuyo código se deriva del token (ver codigoSwap):
// la fila de swap_invitaciones existe en D1, pero el código no aparece en el repo.

export const ARCHIVOS = {
  "plantilla-fl": { r2: "pack-swap-pro/Plantilla-FL-Studio.rar", nombre: "Plantilla de Grabación — FL Studio", so: "FL Studio 20+" },
  "vocals-win": { r2: "pack-swap-pro/Pritti-Vocals-WIN.rar", nombre: "Pritti Vocals", so: "Windows" },
  "vocals-mac": { r2: "pack-swap-pro/Pritti-Vocals-Mac.zip", nombre: "Pritti Vocals", so: "Mac" },
  "backroom-win": { r2: "pack-swap-pro/Pritti-Backroom-WIN.rar", nombre: "Pritti Backroom", so: "Windows" },
  "backroom-mac": { r2: "pack-swap-pro/Pritti-Backroom-Mac.zip", nombre: "Pritti Backroom", so: "Mac" },
  "riri-win": { r2: "pack-swap-pro/Pritti-Riri-fx-WIN.zip", nombre: "Pritti Riri fx", so: "Windows" },
  "riri-mac": { r2: "pack-swap-pro/Pritti-Riri-fx-Mac.zip", nombre: "Pritti Riri fx", so: "Mac" },
};

const PACK_SWAP_PRO_FL = ["plantilla-fl", "vocals-win", "vocals-mac", "backroom-win", "backroom-mac", "riri-win", "riri-mac"];

export const REGALOS = {
  // THEWIZARD (12-nov-2026, pedido del usuario): Pack SWAP Pro versión FL Studio, 1 activación de SWAP Pro.
  "4b53f12f631206f7e563442c18be2a2c436fb138d66cd5d0444f8bb1e1a972f3": {
    titulo: "Pack SWAP Pro",
    detalle: "Plantilla de Grabación FL Studio + SWAP Pro + Pritti Vocals, Backroom y Riri fx.",
    archivos: PACK_SWAP_PRO_FL,
    swapPro: true,
  },
};

async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function regaloDe(token) {
  const t = String(token || "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(t)) return null;
  const regalo = REGALOS[await sha256(t)];
  if (!regalo) return null;
  if (regalo.vence && Date.now() > Date.parse(regalo.vence)) return null;
  return regalo;
}

/** Código de la invitación de SWAP Pro de este regalo (fila en D1 swap_invitaciones, 1 cupo). */
export async function codigoSwap(token) {
  return "rg-" + (await sha256(`${token}:swap`)).slice(0, 20);
}
