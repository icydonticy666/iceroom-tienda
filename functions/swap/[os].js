import { SWAP_GIFT } from "../_lib/campaign.js";

// Enlaces fijos para descargar swap (iceroom.cl/swap/windows | mac | intel): redirigen al
// instalador de la versión vigente, así los correos ya enviados no se rompen al cambiar de versión.
const OS = { windows: "windows", mac: "macSilicon", intel: "macIntel" };

export function onRequestGet({ params }) {
  const url = SWAP_GIFT.downloads[OS[String(params.os || "").toLowerCase()]];
  if (!url) return Response.redirect("https://iceroom.cl/#swap", 302);
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
