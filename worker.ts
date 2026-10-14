// Entrada del Worker (ARCH §14.5): el `fetch` de OpenNext y el manejador `scheduled`
// del Cron Trigger.

// `@ts-ignore` y no `@ts-expect-error`: el módulo solo existe después del build,
// y con él presente `@ts-expect-error` fallaría por no tener error que suprimir.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: generado por `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  // Cada 5 minutos (wrangler.jsonc, `triggers.crons`). Invoca la ruta interna dentro
  // del mismo Worker, sin pasar por la red pública.
  async scheduled(_evento, env, ctx) {
    const url = new URL("/api/interno/cron", env.APP_URL);
    const solicitud = new Request(url, {
      method: "POST",
      headers: {
        // Sin `host`, OpenNext toma la URL absoluta como externa y la reenvía por la red
        // (`isExternal` de @opennextjs/aws); con él, la atiende el mismo Worker.
        host: url.host,
        authorization: `Bearer ${env.CRON_SECRET}`,
      },
    });
    ctx.waitUntil(
      (handler.fetch(solicitud, env, ctx) as Promise<Response>).then((respuesta) =>
        // Workers Logs: el cron corrió y con qué respuesta (ARCH §21.4).
        console.log(JSON.stringify({ evento: "cron", ruta: "/api/interno/cron", estado: respuesta.status })),
      ),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Si la configuración de OpenNext usa Durable Objects (caché y colas), también se reexportan desde aquí.
