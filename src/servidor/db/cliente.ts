import "server-only";
import { neon, Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  drizzle as drizzleWs,
  type NeonDatabase,
} from "drizzle-orm/neon-serverless";
import * as esquema from "./esquema";

// Clientes de Neon (ARCH §8, ADR-03).

export type Transaccion = Parameters<
  Parameters<NeonDatabase<typeof esquema>["transaction"]>[0]
>[0];

/**
 * Lo que tienen en común la conexión HTTP (`db()`) y una transacción: para las lecturas
 * que se hacen con cualquiera de las dos, como la agenda, que la consulta de
 * disponibilidad lee por HTTP y la reserva, dentro de su transacción (ARCH §10).
 */
export type Conexion = PgDatabase<PgQueryResultHKT, typeof esquema>;

function urlBaseDeDatos(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Falta DATABASE_URL (ver .env.example).");
  }
  return url;
}

/** Consultas y escrituras de una sola sentencia: HTTP, sin conexión persistente. */
export const db = () =>
  drizzleHttp({ client: neon(urlBaseDeDatos()), schema: esquema });

/**
 * Transacciones interactivas (RN-11): WebSocket, con `READ COMMITTED` a propósito (ARCH §11.3).
 * En Workers una conexión WebSocket no sobrevive a la solicitud que la abrió, así que
 * el `Pool` se crea y se cierra dentro de cada transacción y ninguna variable de
 * módulo lo guarda.
 */
export async function enTransaccion<T>(
  fn: (tx: Transaccion) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: urlBaseDeDatos() });
  try {
    return await drizzleWs({ client: pool, schema: esquema }).transaction(fn, {
      isolationLevel: "read committed",
    });
  } finally {
    await pool.end();
  }
}

/**
 * Autor de los cambios que auditan los triggers en esta transacción (RN-30, ARCH §16.4):
 * el `clerk_user_id` del admin, 'sistema' para el cron o 'semilla'. Sin él, el autor
 * es el rol de la base de datos. Solo vive hasta el fin de la transacción.
 */
export async function fijarActor(tx: Transaccion, actor: string): Promise<void> {
  await tx.execute(sql`select set_config('app.actor', ${actor}, true)`);
}
