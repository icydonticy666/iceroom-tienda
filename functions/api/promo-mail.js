import { json } from "../_lib/http.js";

// Envío único del aviso "Mitad de precio · 24 horas" (23-oct-2026) a quienes compraron en pesos.
// Lo protege un token temporal guardado en D1 como SHA-256 (tabla admin_tokens); sin él no hace nada.
// `promo_mail_log` evita mandar dos veces el mismo correo. Borrar este archivo después del envío.
const CAMPAIGN = "promo50-23oct";
const ENDS = "mañana 24 de octubre a las 12:00 (hora de Chile)";
const LINK = "https://iceroom.cl/?utm_source=promo50&utm_medium=email#plantillas";
const SUBJECT = "Mitad de precio. Solo 24 horas.";

const TEXT = `Hola,

Gracias por haber comprado en ICEROOM. Por eso te aviso antes que nadie: por 24 horas, toda la tienda está a mitad de precio.

- Pritti Studio (plantillas FL + Ableton + 4 plugins): $29.990 → $14.995
- Plantilla FL + Grip, Backroom y Eco: $15.980 → $7.990
- Pritti Bundle: $19.990 → $9.995
- Mezcla + Master de 1 canción: $69.990 → $34.995

Si ya tienes la plantilla, es el momento de completar los plugins. Si tienes los plugins, llévate la plantilla que ya los trae armados.

Ver la tienda: ${LINK}

Termina ${ENDS}. El descuento ya viene aplicado: sin código.

— IcyCold · ICEROOM

Recibes este correo porque compraste en ICEROOM. Si no quieres más avisos, responde "BAJA".`;

const row = (name, was, now) =>
  `<tr><td style="padding:6px 0;color:#d6d6e0">${name}</td><td style="padding:6px 0 6px 12px;text-align:right;white-space:nowrap"><s style="color:#77778a">${was}</s> <b style="color:#ff5ca8">${now}</b></td></tr>`;

const HTML = `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:Arial,Helvetica,sans-serif;color:#f2f2f7">
<div style="max-width:520px;margin:0 auto;padding:28px 22px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#ff5ca8">MITAD DE PRECIO · SOLO 24 HORAS</p>
<h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">50% en toda la tienda.</h1>
<p style="margin:0 0 18px;line-height:1.5;color:#d6d6e0">Gracias por haber comprado en ICEROOM. Por eso te aviso antes que nadie: por 24 horas, toda la tienda está a mitad de precio.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px">
${row("Pritti Studio (plantillas FL + Ableton + 4 plugins)", "$29.990", "$14.995")}
${row("Plantilla FL + Grip, Backroom y Eco", "$15.980", "$7.990")}
${row("Pritti Bundle", "$19.990", "$9.995")}
${row("Mezcla + Master de 1 canción", "$69.990", "$34.995")}
</table>
<p style="margin:0 0 22px;line-height:1.5;color:#d6d6e0">Si ya tienes la plantilla, es el momento de completar los plugins. Si tienes los plugins, llévate la plantilla que ya los trae armados.</p>
<p style="margin:0 0 22px"><a href="${LINK}" style="display:inline-block;background:#ff5ca8;color:#0b0b10;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:999px">Ver la tienda →</a></p>
<p style="margin:0 0 6px;line-height:1.5;color:#d6d6e0">Termina <b>${ENDS}</b>. El descuento ya viene aplicado: sin código.</p>
<p style="margin:18px 0 0;color:#d6d6e0">— IcyCold · ICEROOM</p>
<p style="margin:28px 0 0;font-size:12px;color:#77778a">Recibes este correo porque compraste en ICEROOM. Si no quieres más avisos, responde "BAJA".</p>
</div></body></html>`;

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function message(env, to) {
  return {
    from: env.EMAIL_FROM,
    reply_to: env.EMAIL_REPLY_TO || "soporte@iceroom.cl",
    to: [to],
    subject: SUBJECT,
    text: TEXT,
    html: HTML,
    headers: { "List-Unsubscribe": "<mailto:soporte@iceroom.cl?subject=BAJA>" },
  };
}

export async function onRequestPost({ request, env }) {
  const token = request.headers.get("x-admin-token") || "";
  if (!env.PAYMENTS_DB || token.length < 32) return json({ error: "no" }, 404);
  const valid = await env.PAYMENTS_DB.prepare(
    "SELECT 1 FROM admin_tokens WHERE hash = ?1 AND purpose = ?2 AND expires_at > datetime('now')"
  ).bind(await sha256(token), CAMPAIGN).first();
  if (!valid) return json({ error: "no" }, 404);
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: "email-not-configured" }, 500);

  const mode = new URL(request.url).searchParams.get("mode") || "count";
  const { results } = await env.PAYMENTS_DB.prepare(
    `SELECT DISTINCT lower(trim(email)) AS email FROM payment_intents
     WHERE state = 'approved' AND email LIKE '%_@_%._%' AND product_key != 'PRUEBA350'
       AND lower(trim(email)) NOT IN (SELECT email FROM promo_mail_log WHERE campaign = ?1)`
  ).bind(CAMPAIGN).all();
  const pending = (results || []).map((r) => r.email);
  if (mode === "count") return json({ pending: pending.length });

  // Prueba: solo a soporte@ (llega al Gmail del usuario), sin registrar.
  const to = mode === "preview" ? ["soporte@iceroom.cl"] : mode === "send" ? pending : [];
  if (!to.length) return json({ sent: 0, pending: pending.length });

  let sent = 0;
  const failed = [];
  for (let i = 0; i < to.length; i += 50) {
    const chunk = to.slice(i, i + 50);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(chunk.map((email) => message(env, email))),
    });
    if (!res.ok) {
      failed.push({ status: res.status, body: (await res.text()).slice(0, 200) });
      continue;
    }
    sent += chunk.length;
    if (mode === "send") {
      await env.PAYMENTS_DB.batch(chunk.map((email) =>
        env.PAYMENTS_DB.prepare("INSERT OR IGNORE INTO promo_mail_log (campaign, email, sent_at) VALUES (?1, ?2, datetime('now'))").bind(CAMPAIGN, email)));
    }
  }
  return json({ sent, failed });
}
