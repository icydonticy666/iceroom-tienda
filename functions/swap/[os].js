import { SWAP_GIFT } from "../_lib/campaign.js";
import { firmaValida } from "../_lib/swap-descarga.js";

// Enlaces fijos para descargar swap (iceroom.cl/swap/windows | mac | intel): redirigen al
// instalador de la versión vigente, así los correos ya enviados no se rompen al cambiar de versión.
// Solo con firma vigente de /api/swap-descarga (se pide el correo antes); sin firma vuelve a la
// página de swap con el formulario de correo abierto para ese sistema.
const OS = { windows: "windows", mac: "macSilicon", intel: "macIntel" };

export async function onRequestGet({ params, request, env }) {
  const os = String(params.os || "").toLowerCase();
  const url = SWAP_GIFT.downloads[OS[os]];
  if (!url) return Response.redirect("https://iceroom.cl/#swap", 302);
  const q = new URL(request.url).searchParams;
  if (!await firmaValida(env.ORDER_SECRET, os, q.get("e"), q.get("t"))) {
    return new Response(null, { status: 302, headers: { location: `/swap.html?descargar=${os}`, "cache-control": "no-store" } });
  }
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}
