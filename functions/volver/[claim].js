export async function onRequest({ request, params }) {
  if (!/^[a-f0-9]{32}$/.test(params.claim || "")) {
    return new Response("Enlace inválido", { status: 400 });
  }
  const incoming = new URL(request.url);
  const dest = new URL("/gracias.html", incoming.origin);
  incoming.searchParams.forEach((value, key) => dest.searchParams.set(key, value));
  dest.searchParams.set("claim", params.claim);
  return Response.redirect(dest.toString(), 302);
}
