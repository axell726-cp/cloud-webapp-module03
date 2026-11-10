# Verificación gratuita y costos — 2026-11-10

## Fuentes oficiales consultadas

- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- D1 FAQ: https://developers.cloudflare.com/d1/reference/faq/

Workers Free es el nivel por defecto documentado e incluye hasta 100.000 solicitudes por día y 10 ms de CPU por invocación. D1 está incluido en Workers Free: 5 millones de filas leídas por día, 100.000 filas escritas por día, 5 GB de almacenamiento total y hasta 10 bases. Workers Logs Free ofrece 200.000 eventos por día con 3 días de retención hasta el cambio anunciado para el 2026-12-01.

## Verificación de esta ejecución

- Wrangler OAuth autenticado; whoami completó correctamente.
- Se creó una base D1 y se aplicó la migración remota.
- El Worker se publicó en workers.dev con el binding D1 y assets.
- Ningún comando pidió activar Workers Paid o configurar método de pago.
- No se añadió una tarjeta ni se habilitó facturación o servicios adicionales.
- R2 no se configuró.
- Uso generado por pruebas: unas pocas solicitudes y tres escrituras/eliminaciones de tarea, dentro de los límites gratuitos indicados.
- Costo esperado bajo los límites gratuitos: USD 0.00. No se consultó una factura final; los datos de uso y facturación pueden retrasarse.

Wrangler whoami verifica autenticación y cuenta, pero no expone los detalles de Billing. Por ello, esta comprobación de costo documenta la elegibilidad del nivel gratuito según las reglas oficiales y la ausencia de una activación de pago en esta ejecución; no afirma una factura final de cero.

