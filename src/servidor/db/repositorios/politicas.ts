import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, type Transaccion } from "../cliente";
import { politicaDatos } from "../esquema";

// Versiones de la política de tratamiento de datos (PAN-17; D-05, RN-17; ARCH §17.3 y
// §18.3). Son inmutables: la que aceptó un cliente no cambia nunca. Por eso este
// repositorio solo lee e inserta; no hay UPDATE ni DELETE (los borra solo la cascada
// del negocio). La vigente es la de mayor `version`. Toda función recibe `negocioId`
// y lo usa en el WHERE (ARCH §6, defensa 1).

export type VersionPolitica = {
  id: string;
  version: number;
  contenido: string;
  publicadaEn: Date;
};

/** Todas las versiones del negocio, de la más nueva (la vigente) a la más vieja. */
export async function listar(negocioId: string): Promise<VersionPolitica[]> {
  return db()
    .select({
      id: politicaDatos.id,
      version: politicaDatos.version,
      contenido: politicaDatos.contenido,
      publicadaEn: politicaDatos.publicadaEn,
    })
    .from(politicaDatos)
    .where(eq(politicaDatos.negocioId, negocioId))
    .orderBy(desc(politicaDatos.version));
}

/** La versión vigente (la de mayor número), sin su texto, o `null` si el negocio no tiene política. */
export async function vigente(negocioId: string): Promise<{ id: string; version: number } | null> {
  const [fila] = await db()
    .select({ id: politicaDatos.id, version: politicaDatos.version })
    .from(politicaDatos)
    .where(eq(politicaDatos.negocioId, negocioId))
    .orderBy(desc(politicaDatos.version))
    .limit(1);
  return fila ?? null;
}

/** Una versión de la política del negocio, con su texto, o `null` si no existe en ese negocio (RN-01). */
export async function porVersion(negocioId: string, version: number): Promise<VersionPolitica | null> {
  const [fila] = await db()
    .select({
      id: politicaDatos.id,
      version: politicaDatos.version,
      contenido: politicaDatos.contenido,
      publicadaEn: politicaDatos.publicadaEn,
    })
    .from(politicaDatos)
    .where(and(eq(politicaDatos.negocioId, negocioId), eq(politicaDatos.version, version)));
  return fila ?? null;
}

/**
 * Si la versión es del negocio. Cualquier versión vale para una reserva, no solo la
 * vigente: se guarda la que vio el cliente (F-01).
 */
export async function esDelNegocio(negocioId: string, id: string): Promise<boolean> {
  const filas = await db()
    .select({ id: politicaDatos.id })
    .from(politicaDatos)
    .where(and(eq(politicaDatos.negocioId, negocioId), eq(politicaDatos.id, id)));
  return filas.length > 0;
}

/**
 * Inserta la versión siguiente a la mayor del negocio. Va dentro de la transacción
 * que tomó la fila del negocio, para que dos publicaciones no pidan el mismo número.
 */
export async function publicar(negocioId: string, contenido: string, tx: Transaccion): Promise<VersionPolitica> {
  const siguiente = sql<number>`(select coalesce(max(${politicaDatos.version}), 0) + 1 from ${politicaDatos} where ${politicaDatos.negocioId} = ${negocioId})`;
  const [fila] = await tx
    .insert(politicaDatos)
    .values({ negocioId, version: siguiente, contenido })
    .returning({
      id: politicaDatos.id,
      version: politicaDatos.version,
      contenido: politicaDatos.contenido,
      publicadaEn: politicaDatos.publicadaEn,
    });
  return fila;
}
