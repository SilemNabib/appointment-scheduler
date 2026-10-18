import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db, type Transaccion } from "../cliente";
import { recurso } from "../esquema";
import { idSedePrincipal } from "./sedes";

// Recursos de las sedes (RN-06, RN-33). Toda función recibe `negocioId` y lo usa en
// el WHERE (ARCH §6, defensa 1).
//
// En el MVP cada servicio lo atiende el consultorio de la sede principal (Q-20): el
// recurso `consultorio` activo de esa sede con menor (`orden`, `creado_en`). El alta
// lo crea y no hay interfaz para crear otro.

export type Consultorio = {
  id: string;
  sedeId: string;
  nombre: string;
  capacidad: number;
};

const columnas = {
  id: recurso.id,
  sedeId: recurso.sedeId,
  nombre: recurso.nombre,
  capacidad: recurso.capacidad,
};

const delConsultorioPrincipal = (negocioId: string) =>
  and(
    eq(recurso.negocioId, negocioId),
    eq(recurso.sedeId, idSedePrincipal(negocioId)),
    eq(recurso.tipo, "consultorio"),
    eq(recurso.activo, true),
  );

const ordenConsultorio = [asc(recurso.orden), asc(recurso.creadoEn), asc(recurso.id)];

/** El consultorio de la sede principal, o `null` si el negocio no existe (Q-20). */
export async function consultorioPrincipal(negocioId: string): Promise<Consultorio | null> {
  const [fila] = await db()
    .select(columnas)
    .from(recurso)
    .where(delConsultorioPrincipal(negocioId))
    .orderBy(...ordenConsultorio)
    .limit(1);
  return fila ?? null;
}

/**
 * Cambia el nombre y la capacidad del consultorio de la sede principal, y de ningún
 * otro recurso (PAN-13). Devuelve si lo encontró.
 */
export async function actualizarConsultorioPrincipal(
  negocioId: string,
  datos: Pick<Consultorio, "nombre" | "capacidad">,
): Promise<boolean> {
  const idPrincipal = new QueryBuilder()
    .select({ id: recurso.id })
    .from(recurso)
    .where(delConsultorioPrincipal(negocioId))
    .orderBy(...ordenConsultorio)
    .limit(1);
  const filas = await db()
    .update(recurso)
    .set(datos)
    .where(and(eq(recurso.negocioId, negocioId), eq(recurso.id, idPrincipal)))
    .returning({ id: recurso.id });
  return filas.length > 0;
}

/**
 * Toma con `FOR UPDATE` el recurso activo del negocio hasta el fin de la transacción y
 * devuelve su capacidad, o `null` si no existe, no está activo o es de otro negocio. Es
 * el paso 1 de la reserva (ARCH §11.2): las demás escrituras de agenda de ESTE recurso
 * esperan aquí; las de otros recursos, no.
 */
export async function bloquear(negocioId: string, recursoId: string, tx: Transaccion): Promise<number | null> {
  const [fila] = await tx
    .select({ capacidad: recurso.capacidad })
    .from(recurso)
    .where(and(eq(recurso.id, recursoId), eq(recurso.negocioId, negocioId), eq(recurso.activo, true)))
    .for("update");
  return fila?.capacidad ?? null;
}

/**
 * Toma con `FOR UPDATE`, ordenados por `id`, todos los recursos de la sede (activos o
 * no), hasta el fin de la transacción. Es el bloqueo que serializa las escrituras de
 * agenda (ARCH §11.3): ordenarlos evita que dos operaciones se esperen en orden
 * cruzado. Devuelve sus ids.
 */
export async function bloquearDeSede(negocioId: string, sedeId: string, tx: Transaccion): Promise<string[]> {
  const filas = await tx
    .select({ id: recurso.id })
    .from(recurso)
    .where(and(eq(recurso.negocioId, negocioId), eq(recurso.sedeId, sedeId)))
    .orderBy(asc(recurso.id))
    .for("update");
  return filas.map((f) => f.id);
}
