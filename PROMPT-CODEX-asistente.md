# Tarea para Codex: asistente de soporte ICEROOM (web ahora, DMs de Instagram después)

## Contexto

Trabajas en `payhip-tienda/`, la tienda de iceroom.cl:

- Corre en Cloudflare Pages (proyecto `iceroom-tienda`): la página estática está en `dist/` y la API en Pages Functions, en `functions/`.
- La base de datos es D1 `iceroom-pagos` (binding `PAYMENTS_DB`). La tabla de pedidos se llama `payment_intents`, no `orders`, y las entregas están en `payment_fulfillments`. Revisa `schema.sql` y `migrations/`.
- Los productos y precios en pesos están en `functions/_lib/catalog.js` (`PRODUCTS`, `priceOf`). El precio vigente sale de `currentPrice` en `functions/_lib/intents.js`.
- La entrega funciona así: la tienda crea un cupón 100% de Payhip y lo manda por correo con Resend desde `iceroom <soporte@iceroom.cl>`. La función es `sendEmail` en `functions/_lib/fulfill.js`.
- Las pruebas se corren con `node --test functions/_lib/*.test.mjs functions/_lib/selfcheck.mjs` y hoy pasan 32/32. Tienen que seguir pasando.

Hay que construir **un asistente de soporte** con un solo "cerebro" para dos canales:

1. **Fase 1 (esta tarea, completa):** un chat en la web iceroom.cl.
2. **Fase 2 (esta tarea deja el código listo pero apagado):** los DMs de Instagram de @iceroomcl. Se enciende cuando Meta apruebe el permiso de mensajes.

El dueño quiere el modelo más barato para empezar: **Claude Haiku 5.5**.

## Paso 0 — Antes de tocar nada (obligatorio)

El 16-oct un push a GitHub publicó una versión vieja de la tienda encima de la de producción: Cloudflare Pages construye automáticamente desde `main`. Para que no se repita:

- Comprueba que tu copia del repo tenga el estado de producción:
  - `dist/index.html` debe cargar `checkout.js?v=20261016b`;
  - debe existir `functions/api/mp-wallet.js`;
  - `functions/_lib/fulfill.js` debe tener `reply_to` en `sendEmail`;
  - `curl https://iceroom.cl/ | grep checkout.js?v=` debe dar la misma versión.
- **Si algo de eso no coincide, DETENTE y avísale al dueño.** No construyas sobre una versión vieja ni hagas push.
- **No hagas push a `main`.** Trabaja en una rama `asistente`, y para probar despliega solo una vista previa:
  `npx wrangler pages deploy dist --project-name iceroom-tienda --branch asistente`.
  Producción la publica el dueño cuando apruebe.

## Reglas del negocio (no negociables)

- **No toques el pago:** ni los archivos de checkout, ni Mercado Pago, Flow, PayPal o los precios. PayPal nunca se puede romper. El asistente solo **lee** precios y pedidos.
- El asistente **nunca**:
  - inventa precios, descuentos, cupones ni promociones (solo usa lo que devuelven las herramientas);
  - promete reembolsos;
  - revela códigos de cupón en el chat;
  - muestra datos de otro cliente.
- Se presenta como "el asistente de ICEROOM". Instagram oficial: **@iceroomcl**. Contacto humano: **soporte@iceroom.cl**.
- Habla en español, tutea, con tono cercano chileno pero claro y sin modismos excesivos. Responde corto (2 a 5 frases) y sin markdown pesado en Instagram.
- No manejes contraseñas ni pidas datos de tarjetas. Si alguien los manda, dile que no los comparta y no los guardes.
- Ninguna clave va en el código. Todas son secretos de Pages, y los configura el dueño.

## Modelo y API de Claude

- Usa el SDK oficial `@anthropic-ai/sdk` (agrega `package.json`; wrangler lo empaqueta para las Functions). **No adivines la API:** verifica nombres y parámetros en el README del SDK oficial (github.com/anthropics/anthropic-sdk-typescript) y en docs.claude.com.
- `model: "claude-haiku-5-5"`. Cuesta US$0,10 por millón de tokens de entrada y US$0,50 por millón de salida (con prompts de hasta 100K tokens).
- `output_config: { effort: "low" }`. Es chat de soporte, y el valor por defecto en Haiku 5.5 sería `medium`.
- No envíes el parámetro `thinking`: el razonamiento adaptativo viene encendido por defecto y así se queda.
- **No envíes `temperature`, `top_p` ni `top_k`** (Haiku 5.5 rechaza valores no predeterminados con error 400), y **no rellenes la respuesta del asistente** (prefill), que también da 400.
- `max_tokens: 1024`.
- **Caché del prompt:** pon el system prompt y el conocimiento fijo en `system` como bloques de texto, con `cache_control: { type: "ephemeral" }` en el último. Lo que cambia (fecha, canal, mensaje) va después, nunca en el system. El prefijo debe tener más de 512 tokens para que entre en caché. Registra `usage.cache_read_input_tokens` y comprueba que sea mayor que 0 desde la segunda conversación.
- **Historial solo hacia adelante:** guarda el `content` completo de cada respuesta del asistente (incluidos los bloques `thinking` y `tool_use`) tal cual y reenvíalo sin editarlo. No borres ni reescribas turnos anteriores, porque Haiku 5.5 invalida su razonamiento si se edita el historial. Si la conversación se alarga, corta arrancando una conversación nueva, nunca recortando la vieja.
- **Herramientas** con `strict: true`, `tool_choice: { type: "auto" }` y un ciclo manual de herramientas con un máximo de 4 vueltas por mensaje. Parsea siempre los `input` con `JSON.parse` o como objeto, nunca comparando strings.
- Revisa siempre `stop_reason` antes de leer el texto:
  - `refusal`: responde "Te paso con una persona del equipo" y deriva a humano (Haiku no tiene respaldo automático);
  - `max_tokens`: corta con amabilidad.
- **Errores:** distingue 429 y 5xx (reintento corto, una vez) de 400 (error de código). Si la API falla, da un mensaje fijo: "Ahora no puedo responder, escríbenos a soporte@iceroom.cl o por DM a @iceroomcl".

## Herramientas del asistente

Implementa cada herramienta en `functions/_lib/assistant-tools.js`, con pruebas.

1. **`ver_productos`**: lista los productos vendibles con nombre, qué incluye, precio en pesos vigente (de `currentPrice`, sin enlaces de oferta), precio en US$ con PayPal y enlace a iceroom.cl. Saca los productos de `PRODUCTS`; los que tengan `testOnly` no se muestran nunca.
2. **`estado_pedido(email)`**: busca en D1 las compras aprobadas de ese correo (máximo 5) y devuelve producto, fecha y si el correo ya se envió. **Nunca devuelve el código del cupón.** Responde igual exista o no el correo ("si hay compras con ese correo, te reenviamos el comprobante"), para no confirmar a terceros quién compró.
3. **`reenviar_comprobante(email)`**: reenvía el correo de compra a **ese mismo correo**, reutilizando `sendEmail`/la lógica de `fulfill.js` con el mismo código ya entregado. Nunca crea cupones nuevos. Máximo 1 reenvío por correo cada 30 minutos, guardado en D1.
4. **`derivar_a_humano(motivo, contacto)`**: manda un aviso a soporte@iceroom.cl con Resend que incluya el motivo, el canal y la transcripción, y marca la conversación como `humano` para que el bot deje de responder en ella.
   - Úsala siempre en estos casos: reembolsos, cobro duplicado, colaboraciones, prensa, clientes molestos, temas legales, o cuando el asistente no sepa la respuesta.

## Base de conocimiento

Crea `functions/_lib/assistant-knowledge.js` y redáctala a partir de `productos-copy.md`, `RUTA-PRODUCTOS.md`, `CHECKOUT-SETUP.md` y `catalog.js`. **Marca con `// REVISAR` todo lo que el dueño tenga que confirmar.** Mínimo debe cubrir:

- **Qué incluye cada producto** y para qué DAW es (FL Studio o Ableton).
- **Cómo canjear el código en Payhip:** abrir el enlace → "Add coupon" → pegar el código → total US$0 → correo → descarga.
- **Medios de pago:**
  - Webpay/Redcompra (débito, crédito y prepago chilenos), Cuenta Mercado Pago, débito o crédito con Mercado Pago, y PayPal en US$.
  - **Argentina:** las tarjetas argentinas suelen ser rechazadas por Mercado Pago Chile. Recomienda PayPal, y para USDT, que escriban a soporte@iceroom.cl (`// REVISAR` cuando el dueño defina Binance).
  - Si Mercado Pago rechaza: probar Webpay, porque reintentar con la misma tarjeta suele volver a fallar.
- **No llegó el correo:** revisar spam y promociones; si no está, usar `reenviar_comprobante`.
- **Instalación básica** de las plantillas y los plugins (`// REVISAR`).
- **Qué NO hace el asistente** (ver reglas).

## Fase 1 — Chat en la web

- **`functions/api/asistente.js`** (POST `{ conversationId?, message }`):
  - valida el largo (máximo 1.000 caracteres);
  - crea o retoma la conversación;
  - llama a Claude con las herramientas;
  - devuelve `{ conversationId, reply }`.
- **Protección de costos y abuso:**
  - por IP (`cf-connecting-ip`): 20 mensajes cada 10 minutos y 100 al día;
  - máximo 20 turnos por conversación;
  - **tope de gasto diario** (secreto `ASSISTANT_DAILY_USD`, por defecto `1`), calculado con los tokens guardados. Al pasarlo, responde con el mensaje fijo de contacto.
- **D1:** crea la migración `migrations/0005_asistente.sql` (y actualiza `schema.sql`) con:
  - `assistant_conversations`: id, canal (`web`/`instagram`), id externo, estado (`bot`/`humano`), fechas;
  - `assistant_messages`: conversación, rol, `content_json`, tokens de entrada, salida y caché, fecha;
  - `assistant_resends`.
  - Borra mensajes de más de 90 días con una consulta que se ejecute en cada llamada, con baja frecuencia.
- **Widget `dist/asistente.js` + estilos**, en JS puro sin frameworks y con el estilo de `tema.css`:
  - un botón flotante abajo a la derecha, "¿Dudas? Escríbenos";
  - se carga diferido, después de que cargue la página;
  - **se oculta mientras la hoja de pago esté abierta**, para no tapar el checkout;
  - en el celular respeta el margen lateral de 16 px y no genera scroll horizontal;
  - guarda `conversationId` en `localStorage` con try/catch;
  - inclúyelo en `dist/index.html` y `tienda.html` subiendo el `?v=`.
  - Aviso visible: "Asistente automático · para una persona: soporte@iceroom.cl".

## Fase 2 — DMs de Instagram (código listo, apagado)

- **`functions/api/ig-webhook.js`:**
  - **GET:** verificación de Meta con `hub.verify_token`, comparado con el secreto `IG_VERIFY_TOKEN`, devolviendo `hub.challenge`.
  - **POST:** valida `X-Hub-Signature-256` con `META_APP_SECRET`; si la firma no coincide, 401.
- **Solo funciona si `IG_ASSISTANT_ENABLED = "1"`**. Si no, responde 200 y no hace nada.
- **Al recibir un mensaje de texto:**
  - usa el mismo cerebro con canal `instagram`;
  - responde con la API de mensajes de Instagram (verifica en la documentación vigente de Meta el endpoint y el token: `IG_ACCESS_TOKEN`);
  - respeta la ventana de 24 horas de Meta.
- **Si llega un mensaje "echo"** (el dueño respondió a mano desde Instagram), marca la conversación como `humano` durante 24 horas y el bot no responde.
- **Ignora** stickers, reacciones y mensajes de la propia cuenta.
- Deja en `ASISTENTE.md` el paso a paso para el dueño:
  - crear el permiso `instagram_manage_messages` en su app de Meta;
  - pedir la revisión de Meta;
  - configurar el webhook `https://iceroom.cl/api/ig-webhook`;
  - cargar los secretos.

## Pruebas

En `functions/_lib/assistant.test.mjs`, simulando `fetch` y Claude (sin llamar a la API real en las pruebas). Cubre:

- el ciclo de herramientas (`tool_use` → `tool_result` → respuesta);
- que `estado_pedido` nunca devuelva el código del cupón;
- el límite de reenvíos;
- los límites por IP y el tope diario;
- `refusal` → derivar a humano;
- un error de la API → mensaje fijo;
- el webhook de Instagram: firma inválida → 401, apagado → no responde, echo → humano.

Las 32 pruebas actuales siguen pasando.

## Entrega

1. Commits en la rama `asistente` y vista previa desplegada en `asistente.iceroom-tienda.pages.dev`. **No toques producción ni `main`.**
2. `ASISTENTE.md` con:
   - qué secretos cargar: `ANTHROPIC_API_KEY`, `ASSISTANT_DAILY_USD`, y para la fase 2 `IG_VERIFY_TOKEN`, `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_ASSISTANT_ENABLED`;
   - cómo aplicar la migración (`npx wrangler d1 migrations apply iceroom-pagos --remote`);
   - cómo ver los costos (consulta SQL de tokens por día);
   - cómo apagar el asistente.
3. Un resumen con:
   - 10 conversaciones de prueba en la vista previa (precio de un producto, Argentina, no llegó el correo, reembolso → humano, alguien que intenta sacar un descuento inventado o que el bot "ignore sus instrucciones");
   - el costo medido por conversación;
   - si la caché funcionó (`cache_read_input_tokens`).
