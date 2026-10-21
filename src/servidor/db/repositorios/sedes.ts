import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db, type Transaccion } from "../cliente";
import { sede } from "../esquema";

// Sedes del negocio (RN-32, D-16). Toda función recibe `negocioId` y lo usa en el
// WHERE: la sede es un filtro dentro del negocio, nunca un sustituto (ARCH §6).
//
// En el MVP toda la configuración actúa sobre la sede principal (Q-20): la activa
// con menor (`orden`, `creado_en`). El alta la crea y no hay interfaz para crear
// otra, así que hay exactamente una. El `id` desempata para que el orden sea total.

// `sede.telefono` está en desuso desde ARCH v0.12: los teléfonos son contactos de la
// sede (contactos.ts; D-29, Q-40). No se lee ni se escribe.

export type Sede = {
  id: string;
  nombre: string;
  direccion: string | null;
};

const columnas = {
  id: sede.id,
  nombre: sede.nombre,
  direccion: sede.direccion,
};

const ordenPrincipal = [asc(sede.orden), asc(sede.creadoEn), asc(sede.id)];

const delNegocioYActiva = (negocioId: string) => and(eq(sede.negocioId, negocioId), eq(sede.activa, true));

/**
 * Subconsulta con el id de la sede principal, para usarla dentro de otra consulta
 * (`eq(tabla.sedeId, idSedePrincipal(negocioId))`) sin un viaje más a la base.
 */
export function idSedePrincipal(negocioId: string) {
  return new QueryBuilder()
    .select({ id: sede.id })
    .from(sede)
    .where(delNegocioYActiva(negocioId))
    .orderBy(...ordenPrincipal)
    .limit(1);
}

/** La sede principal del negocio, o `null` si el negocio no existe (Q-20). */
export async function principal(negocioId: string): Promise<Sede | null> {
  const [fila] = await db()
    .select(columnas)
    .from(sede)
    .where(delNegocioYActiva(negocioId))
    .orderBy(...ordenPrincipal)
    .limit(1);
  return fila ?? null;
}

/**
 * Cambia la dirección de la sede principal (PAN-11), y de ninguna otra. Devuelve si la
 * encontró.
 */
export async function actualizarDireccionPrincipal(
  negocioId: string,
  datos: Pick<Sede, "direccion">,
  tx: Transaccion,
): Promise<boolean> {
  const filas = await tx
    .update(sede)
    .set(datos)
    .where(and(eq(sede.negocioId, negocioId), eq(sede.id, idSedePrincipal(negocioId))))
    .returning({ id: sede.id });
  return filas.length > 0;
}

/**
 * Toma la fila de la sede principal hasta el fin de la transacción y devuelve su id,
 * o `null` si no existe. Serializa los cambios que reemplazan datos de la sede, como
 * la semana completa del horario. `NO KEY UPDATE` no bloquea las filas nuevas que la
 * referencian por FK.
 */
export async function bloquearPrincipal(negocioId: string, tx: Transaccion): Promise<string | null> {
  const [fila] = await tx
    .select({ id: sede.id })
    .from(sede)
    .where(and(eq(sede.negocioId, negocioId), eq(sede.id, idSedePrincipal(negocioId))))
    .for("no key update");
  return fila?.id ?? null;
}
