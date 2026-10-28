// Activación de swap Pro en el servidor de licencias de swap (Worker «swap-licencias»).
// La tienda ya validó el pago (proveedor, importe, idempotencia); aquí solo se avisa
// {email, pago, proveedor, estado}. Un reembolso manda el mismo pago con «cancelado» y el
// servidor quita Pro solo si al cliente no le queda otro pago aprobado.
// Secretos de Pages: SWAP_LICENCIAS_TOKEN (= ICEROOM_TOKEN del Worker). Sin él no avisa.
// Nunca lanza: un fallo deja la venta igual y queda en el log para darlo a mano.

const LICENCIAS_URL = "https://swap-licencias.n-alvarezpena26.workers.dev/iceroom";

export function daSwapPro(product) {
  return product?.swapAccess === "pro" && !product.testOnly;
}

// id de pago de la tienda -> proveedor: Flow viene como «flow-<orden>», Mercado Pago es numérico.
export function proveedorDe(paymentId) {
  return String(paymentId).startsWith("flow-") ? "flow" : "mp";
}

export async function avisarLicencia(env, { email, pago, proveedor, estado }) {
  if (!env.SWAP_LICENCIAS_TOKEN || !email || !pago) {
    console.error(JSON.stringify({ swap_licencia: "sin-datos", pago, proveedor, estado, email: Boolean(email) }));
    return false;
  }
  try {
    const res = await fetch(env.SWAP_LICENCIAS_URL || LICENCIAS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SWAP_LICENCIAS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ email, pago: String(pago), proveedor, estado }),
    });
    if (!res.ok) console.error(JSON.stringify({ swap_licencia: res.status, pago, proveedor, estado }));
    return res.ok;
  } catch (error) {
    console.error(JSON.stringify({ swap_licencia: String(error?.message || error), pago, proveedor, estado }));
    return false;
  }
}
