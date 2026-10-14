import { Pool } from "@neondatabase/serverless";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as esquema from "@/servidor/db/esquema";
import { sembrarPlanes } from "@/servidor/planes/semilla";

// `npm run db:semilla`: siembra los planes (T1.30). Corre fuera de Next, con la
// condición `react-server` para que `import 'server-only'` resuelva al módulo vacío.
//
// Como drizzle.config.ts: en desarrollo (por defecto) lee .env.local y nunca
// .env.production.local; con NODE_ENV=production siembra `production`. Usa la cadena
// directa, igual que las migraciones (ARCH §8; Q-07).
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

async function main() {
  const url = process.env.DATABASE_URL_DIRECTA;
  if (!url) {
    throw new Error("Falta DATABASE_URL_DIRECTA (ver .env.example).");
  }
  const pool = new Pool({ connectionString: url });
  try {
    const { creadas } = await drizzle({ client: pool, schema: esquema }).transaction(sembrarPlanes);
    console.log(
      `Plan "ilimitado": ${creadas.plan} plan, ${creadas.funcionalidades} funcionalidades y ` +
        `${creadas.limites} límites nuevos (las filas que ya existían no se tocan).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
