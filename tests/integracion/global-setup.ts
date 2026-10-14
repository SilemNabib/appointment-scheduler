import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import type { TestProject } from "vitest/node";

// Rama efímera de Neon para las pruebas de integración (ARCH §8 y §20; Q-07).
// Se crea a partir de `development`, se vacía, recibe la cadena completa de migraciones
// y se elimina al terminar, también cuando una prueba falla.

declare module "vitest" {
  export interface ProvidedContext {
    /** Cadena con pooler de la rama efímera (la que usa `cliente.ts`). */
    databaseUrl: string;
    /** Cadena directa de la rama efímera. */
    databaseUrlDirecta: string;
  }
}

const API_NEON = "https://console.neon.tech/api/v2";
const RAMA_PADRE = "development";
const PREFIJO_RAMA = "prueba-";
/** Una rama de prueba más vieja que esto quedó de una corrida interrumpida. */
const EDAD_RAMA_HUERFANA_MS = 60 * 60 * 1000;

type Rama = { id: string; name: string; created_at: string };
type Operacion = { id: string; status: string };

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Variables de `process.env` (CI) o, si no están, de `.env.local`. */
function leerConfiguracion() {
  const archivo = existsSync(".env.local")
    ? parseEnv(readFileSync(".env.local", "utf8"))
    : {};
  const leer = (nombre: string) => {
    const valor = process.env[nombre] ?? archivo[nombre];
    if (!valor) {
      throw new Error(`Falta ${nombre} para las pruebas de integración (ver .env.example).`);
    }
    return valor;
  };
  // La rama efímera hereda los roles y las bases de `development`: se usan los mismos nombres.
  const urlDev = new URL(leer("DATABASE_URL_DIRECTA"));
  return {
    apiKey: leer("NEON_API_KEY"),
    proyecto: leer("NEON_PROJECT_ID"),
    rol: decodeURIComponent(urlDev.username),
    baseDeDatos: urlDev.pathname.slice(1),
  };
}

function clienteNeon(apiKey: string, proyecto: string) {
  return async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    for (let intento = 1; ; intento++) {
      const respuesta = await fetch(`${API_NEON}/projects/${proyecto}${ruta}`, {
        method: metodo,
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      // 423: el proyecto tiene otra operación en curso; se reintenta.
      if (respuesta.status === 423 && intento < 30) {
        await esperar(1000);
        continue;
      }
      if (!respuesta.ok) {
        throw new Error(`Neon ${metodo} ${ruta}: ${respuesta.status} ${await respuesta.text()}`);
      }
      return (await respuesta.json()) as T;
    }
  };
}

export default async function prepararRamaEfimera(project: TestProject) {
  const { apiKey, proyecto, rol, baseDeDatos } = leerConfiguracion();
  const pedir = clienteNeon(apiKey, proyecto);

  const { branches } = await pedir<{ branches: Rama[] }>("GET", "/branches");
  const padre = branches.find((rama) => rama.name === RAMA_PADRE);
  if (!padre) {
    throw new Error(`No existe la rama "${RAMA_PADRE}" en el proyecto de Neon.`);
  }

  const huerfanas = branches.filter(
    (rama) =>
      rama.name.startsWith(PREFIJO_RAMA) &&
      Date.now() - Date.parse(rama.created_at) > EDAD_RAMA_HUERFANA_MS,
  );
  for (const rama of huerfanas) {
    await pedir("DELETE", `/branches/${rama.id}`);
  }

  const nombre = `${PREFIJO_RAMA}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const creada = await pedir<{ branch: Rama; operations: Operacion[] }>("POST", "/branches", {
    branch: { name: nombre, parent_id: padre.id },
    endpoints: [{ type: "read_write" }],
  });
  const ramaId = creada.branch.id;
  const eliminar = () => pedir("DELETE", `/branches/${ramaId}`);

  try {
    for (const { id } of creada.operations) {
      await esperarOperacion(pedir, id);
    }

    const uri = async (pooled: boolean) => {
      const consulta = new URLSearchParams({
        branch_id: ramaId,
        database_name: baseDeDatos,
        role_name: rol,
        pooled: String(pooled),
      });
      return (await pedir<{ uri: string }>("GET", `/connection_uri?${consulta}`)).uri;
    };
    const [databaseUrl, databaseUrlDirecta] = await Promise.all([uri(true), uri(false)]);

    await migrarDesdeCero(databaseUrlDirecta);

    project.provide("databaseUrl", databaseUrl);
    project.provide("databaseUrlDirecta", databaseUrlDirecta);
  } catch (error) {
    await eliminar();
    throw error;
  }

  return async () => {
    await eliminar();
  };
}

async function esperarOperacion(
  pedir: ReturnType<typeof clienteNeon>,
  operacionId: string,
) {
  const limite = Date.now() + 120_000;
  while (Date.now() < limite) {
    const { operation } = await pedir<{ operation: Operacion }>("GET", `/operations/${operacionId}`);
    if (operation.status === "finished") return;
    if (operation.status === "failed" || operation.status === "error") {
      throw new Error(`La operación ${operacionId} de Neon terminó en "${operation.status}".`);
    }
    await esperar(500);
  }
  throw new Error(`La operación ${operacionId} de Neon no terminó a tiempo.`);
}

/**
 * La rama copia el esquema y los datos de `development`. Se vacía y se aplica la cadena
 * completa de migraciones, para probar que funciona desde cero y para que las
 * pruebas no vean los datos de `development`.
 */
async function migrarDesdeCero(urlDirecta: string) {
  const pool = new Pool({ connectionString: urlDirecta });
  try {
    await pool.query(
      "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    );
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
