import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Carga los archivos .env como Next. En modo desarrollo (por defecto) lee .env.local
// y nunca .env.production.local, para no migrar `production` por accidente; las
// migraciones de producción se ejecutan con NODE_ENV=production.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

// Cadena directa, sin pooler: las migraciones no pasan por PgBouncer (ARCH §8).
const url = process.env.DATABASE_URL_DIRECTA;
if (!url) {
  throw new Error("Falta DATABASE_URL_DIRECTA (ver .env.example).");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/servidor/db/esquema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
