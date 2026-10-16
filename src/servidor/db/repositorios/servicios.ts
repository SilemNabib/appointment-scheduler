import "server-only";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, type Transaccion } from "../cliente";
import { servicio, servicioSede, servicioSedeRecurso } from "../esquema";

// Servicios del catálogo y su oferta en la sede principal (RN-05, RN-06, RN-32,
// RN-33). Toda función recibe `negocioId` y lo usa en el WHERE (ARCH §6, defensa 1).
// Los servicios no se borran: se desactivan (ARCH §18.1).

export type DatosServicio = {
  nombre: string;
  descripcion: string | null;
  duracionMinutos: number;
  bufferMinutos: number;
};

export type Servicio = DatosServicio & { id: string; activo: boolean };

const columnas = {
  id: servicio.id,
  nombre: servicio.nombre,
  descripcion: servicio.descripcion,
  duracionMinutos: servicio.duracionMinutos,
  bufferMinutos: servicio.bufferMinutos,
  activo: servicio.activo,
};

/** Servicios del negocio: primero los activos, luego por orden y nombre. */
export async function listar(negocioId: string): Promise<Servicio[]> {
  return db()
    .select(columnas)
    .from(servicio)
    .where(eq(servicio.negocioId, negocioId))
    .orderBy(desc(servicio.activo), asc(servicio.orden), asc(servicio.nombre), asc(servicio.id));
}

/** Servicios activos, para el cupo de `max_services` (ARCH §16.3). */
export async function contarActivos(negocioId: string, tx: Transaccion): Promise<number> {
  const [{ total }] = await tx
    .select({ total: count() })
    .from(servicio)
    .where(and(eq(servicio.negocioId, negocioId), eq(servicio.activo, true)));
  return total;
}

/**
 * Crea el servicio, lo ofrece en la sede (`servicio_sede`, sin `cliente_elige`) y lo
 * asocia al recurso que lo atiende (`servicio_sede_recurso`). En el MVP, la sede
 * principal y su consultorio (ARCH §18.4, `guardarServicio`). Devuelve el id.
 */
export async function crear(
  negocioId: string,
  datos: DatosServicio,
  oferta: { sedeId: string; recursoId: string },
  tx: Transaccion,
): Promise<string> {
  const [{ id }] = await tx
    .insert(servicio)
    .values({ negocioId, ...datos })
    .returning({ id: servicio.id });
  await tx.insert(servicioSede).values({ negocioId, servicioId: id, sedeId: oferta.sedeId });
  await tx.insert(servicioSedeRecurso).values({ negocioId, servicioId: id, ...oferta });
  return id;
}

/** Cambia los datos de un servicio del negocio. Devuelve si lo encontró. */
export async function actualizar(negocioId: string, id: string, datos: DatosServicio): Promise<boolean> {
  const filas = await db()
    .update(servicio)
    .set(datos)
    .where(and(eq(servicio.negocioId, negocioId), eq(servicio.id, id)))
    .returning({ id: servicio.id });
  return filas.length > 0;
}

/** Si el servicio del negocio está activo, con su fila tomada hasta el fin de la transacción; `null` si no existe. */
export async function activoParaCambiar(negocioId: string, id: string, tx: Transaccion): Promise<boolean | null> {
  const [fila] = await tx
    .select({ activo: servicio.activo })
    .from(servicio)
    .where(and(eq(servicio.negocioId, negocioId), eq(servicio.id, id)))
    .for("update");
  return fila ? fila.activo : null;
}

// Activar o desactivar solo cambia `servicio.activo`: la oferta en la sede y las
// citas existentes quedan como estaban (RN-05). Devuelven si encontraron el servicio.

/** Activa, dentro de la transacción que comprobó el cupo (`activoParaCambiar`). */
export async function activar(negocioId: string, id: string, tx: Transaccion): Promise<boolean> {
  const filas = await tx
    .update(servicio)
    .set({ activo: true })
    .where(and(eq(servicio.negocioId, negocioId), eq(servicio.id, id)))
    .returning({ id: servicio.id });
  return filas.length > 0;
}

export async function desactivar(negocioId: string, id: string): Promise<boolean> {
  const filas = await db()
    .update(servicio)
    .set({ activo: false })
    .where(and(eq(servicio.negocioId, negocioId), eq(servicio.id, id)))
    .returning({ id: servicio.id });
  return filas.length > 0;
}
