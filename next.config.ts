import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Encabezados de seguridad (ARCH §19.2; Q-47). HSTS, `nosniff` y `Referrer-Policy` van en
// todas las respuestas. La CSP básica, solo en las páginas públicas `/{slug}` y
// `/{slug}/politica/{version}`: el panel y el admin cargan Clerk desde su propio dominio,
// y su CSP llega en la Fase 8. El `no-referrer` de la gestión llega en la Fase 6 (ARCH §13).

const SEGURIDAD = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * El primer segmento de una página pública: cualquiera que no sea una ruta del sistema
 * (ARCH §5). Las rutas propias ganan siempre frente a `[slug]`, así que esta lista solo
 * decide a qué respuestas se les pone la CSP.
 */
const SLUG = ":slug((?!panel|admin|login|registro|sin-acceso|api|_next)[^/.]+)";

const nextConfig: NextConfig = {
  async headers() {
    const reglas = [{ source: "/:ruta*", headers: SEGURIDAD }];
    // En `next dev` la recarga en caliente usa `eval`, que esta CSP bloquea: se aplica en
    // los builds de producción (`npm run build`, `npm run preview` y el Worker).
    if (process.env.NODE_ENV === "production") {
      const csp = [{ key: "Content-Security-Policy", value: CSP }];
      reglas.push({ source: `/${SLUG}`, headers: csp }, { source: `/${SLUG}/politica/:version`, headers: csp });
    }
    return reglas;
  },
};

export default nextConfig;

// Da acceso a los bindings de Cloudflare (`getCloudflareContext()`) en `next dev` (ARCH §21.1).
initOpenNextCloudflareForDev();
