import { json } from "../_lib/http.js";

// Última llamada de la promo 50% (pedida el 23-oct-2026): queda programada en Resend para el
// 24-oct a las 00:00 CL, 12 horas antes del cierre, a quienes recibieron el primer aviso y no han
// comprado desde que empezó la promo. Lo protege un token temporal en D1 (SHA-256, tabla
// admin_tokens). Borrar este archivo después de programar.
const CAMPAIGN = "promo50-lastcall";
const FIRST = "promo50-23oct";
const PROMO_START = "2026-10-23 15:00:00";
const SEND_AT = "2026-10-24T03:00:00.000Z";
const LINK = "https://iceroom.cl/?utm_source=promo50&utm_medium=email_lastcall#plantillas";
const SUBJECT = "Quedan 12 horas ⏳";

const TEXT = `Hola,

Quedan 12 horas de mitad de precio en ICEROOM. Hoy a las 12:00 (hora de Chile) todo vuelve al precio normal.

- Pritti Studio (plantillas FL + Ableton + 4 plugins): $29.990 → $14.995
- Plantilla FL + Grip, Backroom y Eco: $15.980 → $7.990
- Pritti Bundle: $19.990 → $9.995

Ver la tienda: ${LINK}

El descuento ya viene aplicado: sin código.

— IcyCold · ICEROOM

Recibes este correo porque compraste en ICEROOM. Si no quieres más avisos, responde "BAJA".`;

const row = (name, was, now) =>
  `<tr><td style="padding:6px 0;color:#d6d6e0">${name}</td><td style="padding:6px 0 6px 12px;text-align:right;white-space:nowrap"><s style="color:#77778a">${was}</s> <b style="color:#ff5ca8">${now}</b></td></tr>`;

const HTML = `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:Arial,Helvetica,sans-serif;color:#f2f2f7">
<div style="max-width:520px;margin:0 auto;padding:28px 22px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#ff5ca8">ÚLTIMAS 12 HORAS</p>
<h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">Hoy a las 12:00 se acaba la mitad de precio.</h1>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px">
${row("Pritti Studio (plantillas FL + Ableton + 4 plugins)", "$29.990", "$14.995")}
${row("Plantilla FL + Grip, Backroom y Eco", "$15.980", "$7.990")}
${row("Pritti Bundle", "$19.990", "$9.995")}
</table>
<p style="margin:0 0 22px"><a href="${LINK}" style="display:inline-block;background:#ff5ca8;color:#0b0b10;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:999px">Ver la tienda →</a></p>
<p style="margin:0 0 6px;line-height:1.5;color:#d6d6e0">El descuento ya viene aplicado: sin código.</p>
<p style="margin:18px 0 0;color:#d6d6e0">— IcyCold · ICEROOM</p>
<p style="margin:28px 0 0;font-size:12px;color:#77778a">Recibes este correo porque compraste en ICEROOM. Si no quieres más avisos, responde "BAJA".</p>
</div></body></html>`;

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    `SELECT email FROM promo_mail_log WHERE campaign = ?1
       AND email NOT IN (SELECT email FROM promo_mail_log WHERE campaign = ?2)
       AND email NOT IN (SELECT lower(trim(email)) FROM payment_intents WHERE state = 'approved' AND created_at >= ?3)`
  ).bind(FIRST, CAMPAIGN, PROMO_START).all();
  const pending = (results || []).map((r) => r.email);
  if (mode === "count") return json({ pending: pending.length });

  // Prueba: solo a soporte@ (llega al Gmail del usuario), inmediata y sin registrar.
  const to = mode === "preview" ? ["soporte@iceroom.cl"] : mode === "schedule" ? pending : [];
  let scheduled = 0;
  const failed = [];
  for (const email of to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        reply_to: env.EMAIL_REPLY_TO || "soporte@iceroom.cl",
        to: [email],
        subject: SUBJECT,
        text: TEXT,
        html: HTML,
        headers: { "List-Unsubscribe": "<mailto:soporte@iceroom.cl?subject=BAJA>" },
        ...(mode === "schedule" ? { scheduled_at: SEND_AT } : {}),
      }),
    });
    if (!res.ok) failed.push({ status: res.status, body: (await res.text()).slice(0, 200) });
    else {
      scheduled++;
      if (mode === "schedule") {
        await env.PAYMENTS_DB.prepare("INSERT OR IGNORE INTO promo_mail_log (campaign, email, sent_at) VALUES (?1, ?2, ?3)")
          .bind(CAMPAIGN, email, SEND_AT).run();
      }
    }
    await wait(550); // Resend: 2 envíos por segundo.
  }
  return json({ scheduled, failed, sendAt: SEND_AT });
}
