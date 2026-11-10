# TaskFlow — Module 03

Aplicación web pública de gestión de tareas para el internship Codomax Digital Solutions. Frontend en HTML, CSS y JavaScript; API REST con Cloudflare Workers; persistencia con Cloudflare D1.

## Entregables

- Sitio público: https://taskflow-module03.cloud-webapp-module03.workers.dev
- Repositorio: https://github.com/axell726-cp/cloud-webapp-module03
- Evidencias de ejecución: carpeta evidence/

La lista es pública y compartida. No ingreses datos personales, contraseñas, tokens ni información confidencial.

## Arquitectura

    Navegador HTTPS (workers.dev)
         ├── HTML / CSS / JavaScript estáticos
         └── Cloudflare Worker (API REST)
                    └── Cloudflare D1 (SQLite administrado)

El Worker ejecuta en la red distribuida de Cloudflare. Este proyecto NO crea una VPC ni subredes tradicionales. Usa el subdominio workers.dev, sin dominio comprado, AWS, Azure ni OCI.

## Funciones y API

- Crear, listar, completar y eliminar tareas.
- Filtrar todas, pendientes y completadas; mostrar contadores.
- D1 conserva los datos entre solicitudes.
- GET /api/health — estado del Worker y conexión D1.
- GET /api/tasks?status=all|pending|completed — tareas filtradas.
- POST /api/tasks — crear.
- PATCH /api/tasks/:id — cambiar estado de completado.
- DELETE /api/tasks/:id — eliminar.
- GET /api/stats — total, pendientes y completadas.

Las consultas usan sentencias preparadas y parámetros SQL. El Worker valida títulos de 1 a 120 caracteres, limita cuerpos a 2 KB, verifica el origen de las mutaciones, limita escrituras de forma best-effort a 20 por minuto por IP y aislamiento, y aplica encabezados CSP y otros controles HTTP. El límite en memoria no es global ni una protección completa contra abuso; no hay cuentas ni datos privados por usuario.

## Cloudflare, plan y costos

Precios y límites consultados en documentación oficial el 10 de noviembre de 2026:

- Workers Free es el nivel predeterminado documentado: 100.000 solicitudes por día y 10 ms de CPU por solicitud.
- D1 Free está disponible con Workers Free: 5 millones de filas leídas/día, 100.000 escritas/día, 5 GB de almacenamiento total y hasta 10 bases D1.
- Workers Logs Free: 200.000 eventos/día y 3 días de retención hasta el cambio anunciado para el 1 de diciembre de 2026.
- D1 deja de aceptar consultas al superar los límites diarios gratuitos; el exceso no se presenta como gasto autorizado.
- No se creó bucket R2. Los assets son pequeños y se sirven con Workers; se evita cualquier configuración de facturación de R2.
- Esta ejecución no activó un plan pago, facturación, tarjeta, dominio de pago ni un servicio de pago. Se usaron los niveles gratuitos y los recursos creados caben en sus cuotas. El costo esperado es USD 0.00 mientras se mantenga dentro de esas cuotas. No se revisó una factura final; los datos de facturación pueden demorarse.

Fuentes oficiales:
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/reference/faq/

## Seguridad, credenciales e IAM

Wrangler OAuth fue autorizado por el operador en esta máquina. Ninguna credencial o secreto se incluye en el repositorio; no hay secretos necesarios para la app. .wrangler/, .dev.vars y archivos .env locales se excluyen de Git. La autorización OAuth estándar de Wrangler incluye alcances más amplios que los recursos de este demo; para CI/CD, crea un token separado y revocable con Workers Scripts Edit y D1 Edit solamente. No uses Global API Key. No compartas capturas con datos de cuenta.

## Desarrollo y despliegue

Requisitos: Node.js y npm.

    npm install
    npm run db:migrate:local
    npm run dev

En otra terminal:

    npm run test:smoke

Para desplegar en una cuenta elegible, Wrangler requiere autenticación. Crea D1, copia el database_id que devuelve el comando en wrangler.jsonc, aplica migración y publica:

    npx wrangler d1 create taskflow-module03
    npm run db:migrate:remote
    npm run deploy

La configuración workers_dev mantiene la app accesible en workers.dev. No se elimina al finalizar el módulo.

## Pruebas y evidencias reales

- Pruebas locales: 13 checks aprobados; salida en evidence/local-smoke.txt.
- Migración local y remota: salidas en evidence/local-migration.txt y evidence/remote-migration.txt.
- Prueba REST pública desde Edge: health, HTTP 200, creación, lectura persistida, actualización, filtro, estadísticas, eliminación y persistencia de la eliminación; evidencia en evidence/public-smoke-browser.txt. La tarea de prueba se eliminó. evidence/remote-smoke-cleanup.txt registra 0 filas de prueba remanentes en D1.
- Prueba de UI pública desde Edge: creación con formulario, completar, filtro visual, estadísticas y eliminación; 5 checks aprobados y viewport móvil 390 px sin desbordamiento horizontal; evidencia en evidence/public-ui-smoke.txt.
- La primera ejecución del cliente Node del entorno tuvo un fallo de handshake TLS; la misma URL respondió desde Edge y pasó las pruebas públicas. El fallo inicial se conserva en evidence/public-smoke-node-tls-error.txt para distinguir ambos clientes.
- Logs de solicitudes reales del Worker, anonimizados para retirar IP, ubicación y cabeceras: evidence/worker-tail.txt.
- Capturas reales de la versión pública: evidence/taskflow-public.png y evidence/taskflow-mobile.png.
- El endpoint de salud responde con estado OK y base de datos conectada. Wrangler confirmó la versión desplegada en evidence/deploy.txt.

