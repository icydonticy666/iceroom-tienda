import { json } from "../_lib/http.js";

// Promo 50% (23-oct-2026), clientes de Payhip: la lista llega en el cuerpo (no se guarda en el repo).
// mode=announce manda ya el aviso; mode=lastcall programa "Quedan 12 horas" para el 24-oct 00:00 CL.
// promo_mail_log evita repetir a quien ya recibió cada correo. Token temporal en D1 (SHA-256).
// Borrar este archivo después del envío.
const PROMO_START = "2026-10-23 15:00:00";
const SEND_AT = "2026-10-24T03:00:00.000Z";
const FOOTER = `Recibes este correo porque eres cliente de ICEROOM. Si no quieres más avisos, responde "BAJA".`;
const row = (name, was, now) =>
  `<tr><td style="padding:6px 0;color:#d6d6e0">${name}</td><td style="padding:6px 0 6px 12px;text-align:right;white-space:nowrap"><s style="color:#77778a">${was}</s> <b style="color:#ff5ca8">${now}</b></td></tr>`;
const ROWS = [
  ["Pritti Studio (plantillas FL + Ableton + 4 plugins)", "$29.990", "$14.995"],
  ["Plantilla FL + Grip, Backroom y Eco", "$15.980", "$7.990"],
  ["Pritti Bundle", "$19.990", "$9.995"],
];
const button = (link) => `<p style="margin:0 0 22px"><a href="${link}" style="display:inline-block;background:#ff5ca8;color:#0b0b10;text-decoration:none;font-weight:bold;padding:14px 22px;border-radius:999px">Ver la tienda →</a></p>`;
const page = (kicker, title, intro, rows, link, after) => `<!doctype html><html><body style="margin:0;background:#0b0b10;font-family:Arial,Helvetica,sans-serif;color:#f2f2f7">
<div style="max-width:520px;margin:0 auto;padding:28px 22px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;color:#ff5ca8">${kicker}</p>
<h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">${title}</h1>
${intro ? `<p style="margin:0 0 18px;line-height:1.5;color:#d6d6e0">${intro}</p>` : ""}
<table style="width:100%;border-collapse:collapse;font-size:15px;margin:0 0 18px">${rows.map((r) => row(...r)).join("")}</table>
${button(link)}
<p style="margin:0 0 6px;line-height:1.5;color:#d6d6e0">${after}</p>
<p style="margin:18px 0 0;color:#d6d6e0">— IcyCold · ICEROOM</p>
<p style="margin:28px 0 0;font-size:12px;color:#77778a">${FOOTER}</p>
</div></body></html>`;
const list = (rows) => rows.map(([n, w, x]) => `- ${n}: ${w} → ${x}`).join("\n");

const ANNOUNCE_LINK = "https://iceroom.cl/?utm_source=promo50&utm_medium=email_payhip#plantillas";
const ANNOUNCE_ROWS = [...ROWS, ["Mezcla + Master de 1 canción", "$69.990", "$34.995"]];
const ANNOUNCE = {
  campaign: "promo50-23oct",
  subject: "Mitad de precio. Solo 24 horas.",
  text: `Hola,\n\nGracias por ser parte de ICEROOM. Por eso te aviso antes que nadie: por 24 horas, toda la tienda está a mitad de precio.\n\n${list(ANNOUNCE_ROWS)}\n\nSi ya tienes la plantilla, es el momento de completar los plugins. Si tienes los plugins, llévate la plantilla que ya los trae armados.\n\nVer la tienda: ${ANNOUNCE_LINK}\n\nTermina mañana 24 de octubre a las 12:00 (hora de Chile). El descuento ya viene aplicado: sin código.\n\n— IcyCold · ICEROOM\n\n${FOOTER}`,
  html: page("MITAD DE PRECIO · SOLO 24 HORAS", "50% en toda la tienda.",
    "Gracias por ser parte de ICEROOM. Por eso te aviso antes que nadie: por 24 horas, toda la tienda está a mitad de precio.",
    ANNOUNCE_ROWS, ANNOUNCE_LINK,
    "Termina <b>mañana 24 de octubre a las 12:00</b> (hora de Chile). El descuento ya viene aplicado: sin código."),
};
const LAST_LINK = "https://iceroom.cl/?utm_source=promo50&utm_medium=email_lastcall#plantillas";
const LASTCALL = {
  campaign: "promo50-lastcall",
  subject: "Quedan 12 horas ⏳",
  text: `Hola,\n\nQuedan 12 horas de mitad de precio en ICEROOM. Hoy a las 12:00 (hora de Chile) todo vuelve al precio normal.\n\n${list(ROWS)}\n\nVer la tienda: ${LAST_LINK}\n\nEl descuento ya viene aplicado: sin código.\n\n— IcyCold · ICEROOM\n\n${FOOTER}`,
  html: page("ÚLTIMAS 12 HORAS", "Hoy a las 12:00 se acaba la mitad de precio.", "", ROWS, LAST_LINK,
    "El descuento ya viene aplicado: sin código."),
};

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const EMAIL = /^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/;

function payload(env, mail, to, extra = {}) {
  return {
    from: env.EMAIL_FROM, reply_to: env.EMAIL_REPLY_TO || "soporte@iceroom.cl", to: [to],
    subject: mail.subject, text: mail.text, html: mail.html,
    headers: { "List-Unsubscribe": "<mailto:soporte@iceroom.cl?subject=BAJA>" }, ...extra,
  };
}

export async function onRequestPost({ request, env }) {
  const token = request.headers.get("x-admin-token") || "";
  if (!env.PAYMENTS_DB || token.length < 32) return json({ error: "no" }, 404);
  const valid = await env.PAYMENTS_DB.prepare(
    "SELECT 1 FROM admin_tokens WHERE hash = ?1 AND purpose = 'promo50-payhip' AND expires_at > datetime('now')"
  ).bind(await sha256(token)).first();
  if (!valid) return json({ error: "no" }, 404);
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return json({ error: "email-not-configured" }, 500);

  const mode = new URL(request.url).searchParams.get("mode") || "";
  if (mode === "status") {
    // Conteo por estado de los correos de la promo (sin direcciones), desde la API de Resend.
    const counts = {};
    let after = "", pages = 0, total = 0;
    while (pages++ < 6) {
      const res = await fetch(`https://api.resend.com/emails?limit=100${after ? `&after=${after}` : ""}`, {
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      });
      if (!res.ok) return json({ error: res.status, body: (await res.text()).slice(0, 200) });
      const data = await res.json();
      for (const e of data.data || []) {
        if (!String(e.created_at).startsWith("2026-10-23")) continue;
        const key = `${e.subject} | ${e.last_event}`;
        counts[key] = (counts[key] || 0) + 1;
        total++;
      }
      if (!data.has_more || !data.data?.length) break;
      after = data.data[data.data.length - 1].id;
    }
    return json({ total, counts });
  }
  const mail = mode.startsWith("lastcall") ? LASTCALL : ANNOUNCE;
  const body = await request.json().catch(() => ({}));
  const emails = [...new Set((body.emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
  const { results } = await env.PAYMENTS_DB.prepare(
    `SELECT email FROM promo_mail_log WHERE campaign = ?1
     UNION SELECT lower(trim(email)) FROM payment_intents WHERE state = 'approved' AND created_at >= ?2 AND ?1 = 'promo50-lastcall'`
  ).bind(mail.campaign, PROMO_START).all();
  const skip = new Set((results || []).map((r) => r.email));
  const pending = emails.filter((e) => !skip.has(e));
  if (mode.endsWith("count")) return json({ received: emails.length, pending: pending.length });

  let sent = 0;
  const failed = [];
  const log = (chunk) => env.PAYMENTS_DB.batch(chunk.map((email) => env.PAYMENTS_DB
    .prepare("INSERT OR IGNORE INTO promo_mail_log (campaign, email, sent_at) VALUES (?1, ?2, ?3)")
    .bind(mail.campaign, email, mail === LASTCALL ? SEND_AT : new Date().toISOString())));

  if (mode === "announce") {
    for (let i = 0; i < pending.length; i += 100) {
      const chunk = pending.slice(i, i + 100);
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(chunk.map((e) => payload(env, mail, e))),
      });
      if (!res.ok) { failed.push({ status: res.status, body: (await res.text()).slice(0, 200) }); continue; }
      sent += chunk.length;
      await log(chunk);
    }
  } else if (mode === "lastcall") {
    // Programado: la API de lotes no acepta scheduled_at, así que va uno por uno (máx. 40 por llamada).
    const chunk = pending.slice(0, 40);
    const ok = [];
    for (const e of chunk) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(payload(env, mail, e, { scheduled_at: SEND_AT })),
      });
      if (res.ok) ok.push(e); else failed.push({ status: res.status, body: (await res.text()).slice(0, 200) });
      await wait(550);
    }
    sent = ok.length;
    if (ok.length) await log(ok);
  }
  return json({ sent, failed, left: Math.max(0, pending.length - sent) });
}
