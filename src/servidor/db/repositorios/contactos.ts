import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Contacto } from "@/dominio/contactos";
import { db, type Conexion, type Transaccion } from "../cliente";
import { contactoSede } from "../esquema";
import { idSedePrincipal } from "./sedes";

// Contactos de las sedes (D-29; Q-40; ARCH §18.2). Toda función recibe `negocioId` y lo
// usa en el WHERE (ARCH §6, defensa 1); la FK compuesta impide mezclar sedes de dos
// negocios (defensa 2). En el MVP se editan los de la sede principal (Q-20).

const columnas = { tipo: contactoSede.tipo, valor: contactoSede.valor, etiqueta: contactoSede.etiqueta };

const deLaSede = (negocioId: string, sedeId: string | ReturnType<typeof idSedePrincipal>) =>
  and(eq(contactoSede.negocioId, negocioId), eq(contactoSede.sedeId, sedeId));

/** Los contactos de una sede, en su orden. */
export async function deSede(negocioId: string, sedeId: string, conexion: Conexion = db()): Promise<Contacto[]> {
  return conexion
    .select(columnas)
    .from(contactoSede)
    .where(deLaSede(negocioId, sedeId))
    .orderBy(asc(contactoSede.orden), asc(contactoSede.id));
}

/** Los contactos de la sede principal, en su orden (Q-20). */
export async function dePrincipal(negocioId: string): Promise<Contacto[]> {
  return db()
    .select(columnas)
    .from(contactoSede)
    .where(deLaSede(negocioId, idSedePrincipal(negocioId)))
    .orderBy(asc(contactoSede.orden), asc(contactoSede.id));
}

/**
 * Inserta los contactos de una sede con `orden` 0, 1, 2… según su posición. Va dentro de
 * una transacción: la del alta o la de `reemplazar`.
 */
export async function insertar(negocioId: string, sedeId: string, contactos: Contacto[], tx: Transaccion): Promise<void> {
  if (contactos.length === 0) return;
  await tx.insert(contactoSede).values(contactos.map((c, orden) => ({ negocioId, sedeId, ...c, orden })));
}

/**
 * Reemplaza todos los contactos de la sede por la lista nueva, ya validada. Va dentro
 * de la transacción que tomó la fila de la sede, para que dos reemplazos no se mezclen.
 */
export async function reemplazar(negocioId: string, sedeId: string, contactos: Contacto[], tx: Transaccion): Promise<void> {
  await tx.delete(contactoSede).where(deLaSede(negocioId, sedeId));
  await insertar(negocioId, sedeId, contactos, tx);
}
