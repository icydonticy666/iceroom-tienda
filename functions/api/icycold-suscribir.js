import { json, paymentOrigin } from "../_lib/http.js";
import { PLANES, emailValido, iniciarMembresia, limpio, pagoDirectoListo, tablaMembresias } from "../_lib/icycold.js";

export async function onRequestGet({ env }) {
  return json({ directo: await pagoDirectoListo(env).catch(() => false) });
}

// Pago directo de una membresía ICYCOLD en Chile (Flow): devuelve la URL para registrar la tarjeta.
export async function onRequestPost({ request, env }) {
  if (!(await pagoDirectoListo(env).catch(() => false))) return json({ error: "El pago con tarjeta no está disponible en este momento. Escríbenos a soporte@iceroom.cl." }, 503);
  const origin = paymentOrigin(env);
  if (!origin) return json({ error: "El pago no está disponible en este momento." }, 503);
  const d = await request.json().catch(() => null);
  if (!d || typeof d !== "object") return json({ error: "Datos no válidos." }, 400);
  if (d.web) return json({ error: "Datos no válidos." }, 400); // campo trampa
  if (!PLANES[d.plan]) return json({ error: "Elige una membresía." }, 400);
  const datos = {
    plan: d.plan,
    nombre: limpio(d.nombre, 80),
    email: limpio(d.email, 160).toLowerCase(),
    artista: limpio(d.artista, 120),
    musica: limpio(d.musica, 600),
    objetivo: limpio(d.objetivo, 2000),
    pais: limpio(request.cf?.country, 4),
  };
  if (datos.nombre.length < 2) return json({ error: "Escribe tu nombre." }, 400);
  if (!emailValido(datos.email)) return json({ error: "Revisa tu correo: ahí te llega el comprobante." }, 400);

  const db = env.PAYMENTS_DB;
  await tablaMembresias(db);
  const hace = new Date(Date.now() - 3600e3).toISOString();
  const previas = await db.prepare("SELECT COUNT(*) AS n FROM membresias WHERE email = ?1 AND creado > ?2").bind(datos.email, hace).first();
  if ((previas?.n || 0) >= 5) return json({ error: "Hiciste varios intentos seguidos. Espera un rato o escríbenos a soporte@iceroom.cl." }, 429);

  try {
    const { url } = await iniciarMembresia(env, origin, datos);
    return json({ url });
  } catch (error) {
    console.log(JSON.stringify({ icycold_flow_error: String(error?.message || error), status: error?.status || 0 }));
    if (/email/i.test(String(error?.message || ""))) return json({ error: "Flow no aceptó ese correo. Revisa que esté bien escrito." }, 400);
    return json({ error: "No se pudo conectar con Flow. Intenta de nuevo en un momento." }, 502);
  }
}
