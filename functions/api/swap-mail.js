import { json } from "../_lib/http.js";

// Aviso único (26-oct-2026): "tu plantilla ahora viene con swap" a quienes ya compraron una plantilla
// de grabación. La lista llega en el cuerpo (no se guarda en el repo). promo_mail_log evita repetir.
// mode=count cuenta, mode=test manda una prueba marcada a soporte@, mode=send envía. Token temporal en D1.
// Borrar este archivo después del envío.
const CAMPAIGN = "swap-aviso-26oct";
const SUBJECT = "Tu plantilla ahora viene con swap (gratis)";
const FOOTER = `Recibes este correo porque compraste una plantilla de ICEROOM. Si no quieres más avisos, responde "BAJA".`;
const DL = (os) => `https://iceroom.cl/swap/${os}?utm_source=swap&utm_medium=email_clientes`;
const LINKS = [["Windows", DL("windows")], ["Mac con chip M1, M2, M3 o M4", DL("mac")], ["Mac con Intel", DL("intel")]];
const FEATURES = [
  ["Abre la plantilla en TU versión", "De FL Studio o Ableton Live. swap detecta sola la que tienes instalada: se acabó el «este proyecto fue creado con una versión más nueva»."],
  ["Arregla los plugins que no cargan", "Cambia los VST2 por su versión VST3, con los mismos ajustes."],
  ["Tus cadenas de Ableton, en FL", "Convierte tus racks de Ableton en presets de canal del mixer de FL."],
];

const TEXT = `Hola,

Tienes una plantilla de grabación de ICEROOM, así que swap es tuyo, gratis.

swap es nuestra app para Windows y Mac:

${FEATURES.map(([t, d]) => `- ${t}. ${d}`).join("\n")}

Siempre trabaja sobre una copia: tu proyecto original no se toca.

Descárgalo (se actualiza solo):

${LINKS.map(([n, l]) => `${n}:\n${l}`).join("\n\n")}

También quedó en tu descarga de Payhip, junto a la plantilla.

La primera vez que lo abras:
- Windows puede decir «Windows protegió su PC»: pulsa «Más información» y luego «Ejecutar de todas formas».
- En Mac: Ajustes del Sistema > Privacidad y seguridad > «Abrir igualmente».

¿Dudas? Responde este correo o escríbenos por Instagram a @iceroomcl.

— IcyCold · ICEROOM

${FOOTER}`;

const HTML = `<!doctype html><html><body style="margin:0;background:#0c0c0d;font-family:Arial,Helvetica,sans-serif;color:#f2f2f7">
<div style="max-width:520px;margin:0 auto;padding:28px 22px">
<img src="https://iceroom.cl/img/swap.png" width="56" height="56" alt="swap" style="display:block;border-radius:14px;margin:0 0 18px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#9fe8fb">GRATIS CON TU PLANTILLA</p>
<h1 style="margin:0 0 14px;font-size:30px;line-height:1.1">Tu plantilla ahora viene con swap.</h1>
<p style="margin:0 0 20px;line-height:1.5;color:#d6d6e0">Tienes una plantilla de grabación de ICEROOM, así que swap es tuyo, gratis. Es nuestra app para Windows y Mac:</p>
${FEATURES.map(([t, d]) => `<p style="margin:0 0 14px;line-height:1.5;color:#d6d6e0"><b style="color:#fff">${t}.</b> ${d}</p>`).join("")}
<p style="margin:0 0 22px;line-height:1.5;color:#d6d6e0">Siempre trabaja sobre una copia: tu proyecto original no se toca.</p>
<p style="margin:0 0 10px"><a href="${LINKS[0][1]}" style="display:inline-block;background:#9fe8fb;color:#050505;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:999px">Descargar para Windows</a></p>
<p style="margin:0 0 22px;line-height:1.6;color:#d6d6e0">Mac: <a href="${LINKS[1][1]}" style="color:#c9c1ff">chip M1–M4</a> · <a href="${LINKS[2][1]}" style="color:#c9c1ff">Intel</a><br><span style="color:#9a9aa8">Se actualiza solo. También quedó en tu descarga de Payhip.</span></p>
<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#9a9aa8">La primera vez: en Windows, «Más información» → «Ejecutar de todas formas». En Mac, Ajustes del Sistema → Privacidad y seguridad → «Abrir igualmente».</p>
<p style="margin:18px 0 0;color:#d6d6e0">— IcyCold · ICEROOM</p>
<p style="margin:28px 0 0;font-size:12px;color:#77778a">${FOOTER}</p>
</div></body></html>`;

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/;
const payload = (env, to, subject) => ({
  from: env.EMAIL_FROM, reply_to: env.EMAIL_REPLY_TO || "soporte@iceroom.cl", to: [to],
  subject, text: TEXT, html: HTML,
  headers: { "List-Unsubscribe": "<mailto:soporte@iceroom.cl?subject=BAJA>" },
});

export async function onRequestPost({ request, env }) {
  const token = request.headers.get("x-admin-token") || "";
  if (!env.PAYMENTS_DB || token.length < 32) return json({ error: "no" }, 404);
  const valid = await env.PAYMENTS_DB.prepare(
    "SELECT 1 FROM admin_tokens WHERE hash = ?1 AND purpose = 'swap-aviso' AND expires_at > datetime('now')"
  ).bind(await sha256(token)).first();
  if (!valid) return json({ error: "no" }, 404);
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: "email-not-configured" }, 500);

  const send = (list) => fetch("https://api.resend.com/emails/batch", {
    method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(list),
  });
  const mode = new URL(request.url).searchParams.get("mode") || "";
  if (mode === "test") {
    const res = await send([payload(env, "soporte@iceroom.cl", `[PRUEBA — no enviado a clientes] ${SUBJECT}`)]);
    return json({ test: res.status });
  }

  const body = await request.json().catch(() => ({}));
  const emails = [...new Set((body.emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
  const { results } = await env.PAYMENTS_DB.prepare("SELECT email FROM promo_mail_log WHERE campaign = ?1").bind(CAMPAIGN).all();
  const skip = new Set((results || []).map((r) => r.email));
  const pending = emails.filter((e) => !skip.has(e));
  if (mode !== "send") return json({ received: emails.length, pending: pending.length });

  let sent = 0;
  const failed = [];
  for (let i = 0; i < pending.length; i += 100) {
    const chunk = pending.slice(i, i + 100);
    const res = await send(chunk.map((e) => payload(env, e, SUBJECT)));
    if (!res.ok) { failed.push({ status: res.status, body: (await res.text()).slice(0, 200) }); break; }
    await env.PAYMENTS_DB.batch(chunk.map((email) => env.PAYMENTS_DB
      .prepare("INSERT OR IGNORE INTO promo_mail_log (campaign, email, sent_at) VALUES (?1, ?2, ?3)")
      .bind(CAMPAIGN, email, new Date().toISOString())));
    sent += chunk.length;
  }
  return json({ sent, failed });
}
