export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function siteOrigin(request, env) {
  if (env.PUBLIC_ORIGIN) return String(env.PUBLIC_ORIGIN).replace(/\/$/, "");
  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.protocol === "https:") {
    return url.origin;
  }
  return "https://iceroom.cl";
}

export function paymentOrigin(env) {
  const raw = String(env.PUBLIC_ORIGIN || "").replace(/\/$/, "");
  try {
    const url = new URL(raw);
    if (url.protocol === "https:" && url.origin === raw && !url.username && !url.password) return raw;
  } catch { /* Falta una URL pública válida. */ }
  return "";
}

/** Clave de las compras de prueba (secreto TEST_KEY). */
export function testAccess(token, env) {
  const key = String(env.TEST_KEY || "").trim();
  return Boolean(key && String(token || "").trim() === key);
}

export function randomClaim() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
