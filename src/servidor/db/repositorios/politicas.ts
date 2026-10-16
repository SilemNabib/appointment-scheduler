import "server-only";
import { desc, eq, sql } from "drizzle-orm";
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
