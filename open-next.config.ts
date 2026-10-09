import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Sin caché incremental en R2 ni colas por ahora: R2 llega en la fase que lo usa.
export default defineCloudflareConfig({});
