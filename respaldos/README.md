# Respaldos de las bases de datos de iceroom

Creado el 9-nov-2026.

## Qué se respalda

| Base D1 | Qué guarda |
|---|---|
| `iceroom-pagos` | Pedidos en pesos (Webpay y Mercado Pago), entregas, cupones, descargas e invitaciones de swap |
| `swap-licencias` | Cuentas de swap, licencias Pro, equipos activados y pagos que dieron Pro |

## Tres capas

1. **Restauración a un momento (Time Travel de D1).** Cloudflare la incluye: permite volver la base a cualquier minuto reciente (7 días en el plan gratis, 30 en el pagado). Es la forma más rápida de arreglar un borrado o un error:
   `npx wrangler d1 time-travel restore iceroom-pagos --timestamp=2026-11-09T12:00:00Z`
2. **Respaldo diario en R2 (este Worker).** Todos los días a las 04:30 (hora de Chile) copia cada base completa a `iceroom-respaldos/<base>/<fecha>.json` y guarda 60 días. El bucket es privado y el Worker no tiene URL pública.
3. **Copia fuera de Cloudflare.** `RESPALDAR.cmd` exporta las dos bases a `Documents\iiceroom\respaldos-db\<fecha>\` (OneDrive). Sirve aunque se pierda el acceso a la cuenta de Cloudflare. Correrlo una vez al mes, o antes de un cambio grande.

## Restaurar desde un respaldo de R2

1. Bajar el archivo: `npx wrangler r2 object get iceroom-respaldos/iceroom-pagos/2026-11-09.json --remote --file respaldo.json`
2. Convertirlo a SQL: `node respaldos/restaurar.mjs respaldo.json > restaurar.sql`
3. Cargarlo **en una base nueva o de prueba**, revisar, y recién después cambiar el binding.

Los respaldos contienen correos de clientes: no subirlos a git ni compartirlos.

## Publicar cambios del Worker

`cd respaldos && npx wrangler deploy`. Probar un respaldo sin esperar al cron:
`npx wrangler dev --remote --test-scheduled` y abrir `http://localhost:8787/__scheduled`.
