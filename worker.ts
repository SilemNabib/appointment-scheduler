// Entrada del Worker (ARCH §14.5). Por ahora solo reexporta el `fetch` de OpenNext;
// el manejador `scheduled` del Cron Trigger llega con la ruta del cron.

// `@ts-ignore` y no `@ts-expect-error`: el módulo solo existe después del build,
// y con él presente `@ts-expect-error` fallaría por no tener error que suprimir.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: generado por `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;

// Si la configuración de OpenNext usa Durable Objects (caché y colas), también se reexportan desde aquí.
