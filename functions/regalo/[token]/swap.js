import { codigoSwap, regaloDe } from "../../_lib/regalos.js";
import { onRequestPost as invitacion } from "../../api/swap-invitacion.js";

// POST /regalo/<token>/swap {email, os, web}: activa SWAP Pro para ese correo con la invitación del
// regalo (1 cupo; repetir con el mismo correo no gasta otro) y devuelve el enlace de descarga de SWAP.
export async function onRequestPost({ request, params, env }) {
  const regalo = await regaloDe(params.token);
  if (!regalo || !regalo.swapPro) return new Response(JSON.stringify({ error: "Enlace no válido." }), { status: 404, headers: { "content-type": "application/json" } });
  const cuerpo = await request.json().catch(() => ({}));
  const codigo = await codigoSwap(params.token);
  const interna = new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo, email: cuerpo.email, os: cuerpo.os, web: cuerpo.web }),
  });
  return invitacion({ request: interna, env });
}
