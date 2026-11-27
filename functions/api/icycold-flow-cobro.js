import { flowListo, registrarCobroMensual } from "../_lib/icycold.js";

// urlCallback de los planes de Flow: cada cobro mensual de una membresía ICYCOLD llega aquí (POST con `token`).
export async function onRequestPost({ request, env }) {
  if (!flowListo(env)) return new Response(null, { status: 503 });
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") || "");
  if (!token) return new Response(null, { status: 200 });
  try {
    await registrarCobroMensual(env, token);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.log(JSON.stringify({ icycold_cobro_error: String(error?.message || error) }));
    return new Response(null, { status: 500 });
  }
}
