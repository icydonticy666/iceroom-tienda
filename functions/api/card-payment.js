import { bindPayment, getIntent, paymentMatchesIntent, requireDb } from "../_lib/intents.js";
import { json, paymentOrigin } from "../_lib/http.js";
import { PRODUCTS } from "../_lib/catalog.js";
import { activateCouponReservation, settleCouponReservation } from "../_lib/coupon-reservations.js";

export const DEVICE_ID = /^[A-Za-z0-9._:-]{8,512}$/;

export async function onRequestPost({ request, env }) {
  if (!paymentOrigin(env) || !env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET || !env.PAYHIP_API_KEY || !env.ORDER_SECRET) {
    return json({ error: "Pago con tarjeta no configurado." }, 503);
  }
  if (Number(request.headers.get("content-length") || 0) > 16384) {
    return json({ error: "Solicitud demasiado grande." }, 413);
  }
  let sentToProvider = false;
  try {
    requireDb(env);
    const body = await request.json();
    const intent = await getIntent(env, body?.claim);
    if (!intent || intent.provider !== "mp") return json({ error: "Pedido inválido." }, 404);
    if (intent.state !== "created") return json({ error: "Este intento de pago ya fue enviado. Revisa su estado antes de intentarlo de nuevo." }, 409);
    const form = body?.formData || {};
    const email = String(form.payer?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !/^[A-Za-z0-9_-]{8,256}$/.test(String(form.token || "")) ||
        !/^[A-Za-z0-9_-]{2,80}$/.test(String(form.payment_method_id || "")) ||
        !Number.isInteger(Number(form.installments)) || Number(form.installments) < 1 || Number(form.installments) > 48) {
      return json({ error: "Revisa los datos de la tarjeta." }, 400);
    }
    if (!await activateCouponReservation(env, intent)) {
      return json({ error: "El cupón venció o ya fue utilizado. Vuelve al checkout y revisa el total." }, 409);
    }
    const lock = await env.PAYMENTS_DB.prepare(
      "UPDATE payment_intents SET state = 'processing', email = ? WHERE claim = ? AND state = 'created'"
    ).bind(email, intent.claim).run();
    if (lock.meta.changes !== 1) return json({ error: "El pago ya se está procesando." }, 409);

    const payload = {
      transaction_amount: intent.amount_clp,
      token: form.token,
      installments: Number(form.installments),
      payment_method_id: form.payment_method_id,
      description: `iceroom — ${intent.product_key}`,
      three_d_secure_mode: "optional",
      external_reference: `tienda:${intent.product_key}:${intent.claim}:${intent.amount_clp}`,
      notification_url: `${paymentOrigin(env)}/api/mp-webhook`,
      payer: { email },
      statement_descriptor: "ICEROOM",
      // Datos del ítem, IP y device ID: el antifraude de MP rechaza más cuando llegan vacíos.
      additional_info: {
        items: [{
          id: intent.product_key,
          title: PRODUCTS[intent.product_key]?.name || `iceroom ${intent.product_key}`,
          description: "Producto digital descargable",
          category_id: "others",
          quantity: 1,
          unit_price: intent.amount_clp,
        }],
      },
    };
    const ip = request.headers.get("cf-connecting-ip");
    if (ip) payload.additional_info.ip_address = ip;
    if (form.issuer_id) payload.issuer_id = String(form.issuer_id);
    if (form.payer?.identification?.type && form.payer?.identification?.number) {
      payload.payer.identification = {
        type: String(form.payer.identification.type),
        number: String(form.payer.identification.number),
      };
    }
    // La llave persistida permite que MP deduplique una llamada repetida, incluso tras timeout.
    sentToProvider = true;
    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        "content-type": "application/json",
        "X-Idempotency-Key": intent.idempotency_key,
        // El device ID real es "armor.<192 hex>.<32 hex>" (~230 caracteres, con puntos). El filtro
        // viejo ({8,128} sin puntos) lo botaba siempre y MP rechazaba por cc_rejected_high_risk.
        ...(DEVICE_ID.test(String(body?.deviceId || "")) ? { "X-meli-session-id": String(body.deviceId) } : {}),
      },
      body: JSON.stringify(payload),
    });
    const payment = await response.json().catch(() => ({}));
    if (!response.ok && !payment.id) {
      // Un 4xx definitivo permite un intento nuevo; ante 5xx el cobro podría existir.
      if ([400, 402, 422].includes(response.status)) {
        await env.PAYMENTS_DB.prepare("UPDATE payment_intents SET state = 'rejected' WHERE claim = ? AND state = 'processing'")
          .bind(intent.claim).run();
        await settleCouponReservation(env, intent.claim, "rejected");
        return json({ status: "rejected", error: "No se pudo procesar esa tarjeta. Puedes intentar de nuevo." }, 402);
      }
      return json({ status: "pending", claim: intent.claim, url: `/gracias.html?claim=${intent.claim}` }, 202);
    }
    if (!paymentMatchesIntent(payment, intent) || !await bindPayment(env, intent, payment.id, payment.status)) {
      return json({ error: "La respuesta del proveedor no coincide con el pedido." }, 502);
    }
    console.log(JSON.stringify({ card: payment.status, detail: payment.status_detail, product: intent.product_key }));
    if (payment.status === "rejected") {
      const risk = /high_risk|blacklist|fraud/.test(String(payment.status_detail || ""));
      return json({ status: "rejected", detail: payment.status_detail || "",
        error: risk ? "Mercado Pago no aprobó este pago por seguridad. Paga con Webpay (Redcompra) aquí abajo."
          : "Tu banco no aprobó el pago. Prueba otra tarjeta o paga con Webpay (Redcompra)." }, 402);
    }
    if (payment.status_detail === "pending_challenge" && payment.three_ds_info?.external_resource_url && payment.three_ds_info?.creq) {
      return json({ status: "pending_challenge", claim: intent.claim, paymentId: String(payment.id),
        challenge: { externalResourceURL: payment.three_ds_info.external_resource_url,
          creq: payment.three_ds_info.creq } });
    }
    return json({ status: payment.status, claim: intent.claim, url: `/gracias.html?claim=${intent.claim}` });
  } catch {
    if (!sentToProvider) return json({ error: "No se pudo preparar el cobro. Intenta nuevamente." }, 503);
    return json({ error: "No se pudo confirmar el cobro. Si enviaste la tarjeta, no vuelvas a pagar hasta verificarlo." }, 502);
  }
}
