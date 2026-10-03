import { json } from "../_lib/http.js";

// El checkout anterior no persistía el intento en D1. Se conserva la ruta
// para responder claramente a enlaces antiguos, sin iniciar cobros nuevos.
export async function onRequestPost() {
  return json({ error: "Este checkout ya no está disponible. Abre el producto desde la tienda." }, 410);
}
