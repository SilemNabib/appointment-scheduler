import "server-only";
import { and, asc, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, type Transaccion } from "../cliente";
import { recurso, servicio, servicioSede, servicioSedeRecurso } from "../esquema";
import { idSedePrincipal } from "./sedes";

// Servicios del catálogo y su oferta en la sede principal (RN-05, RN-06, RN-32,
// RN-33). Toda función recibe `negocioId` y lo usa en el WHERE (ARCH §6, defensa 1).
// Los servicios no se borran: se desactivan (ARCH §18.1).

export type DatosServicio = {
  nombre: string;
  descripcion: string | null;
  /** D-26; `null` = sin categoría (Q-39). */
  categoria: string | null;
  duracionMinutos: number;
  bufferMinutos: number;
};

export type Servicio = DatosServicio & { id: string; activo: boolean };

const columnas = {
  id: servicio.id,
  nombre: servicio.nombre,
  descripcion: servicio.descripcion,
  categoria: servicio.categoria,
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

/** Las categorías distintas de los servicios del negocio, en orden alfabético (Q-39). */
export async function categorias(negocioId: string): Promise<string[]> {
  const filas = await db()
    .selectDistinct({ categoria: servicio.categoria })
    .from(servicio)
    .where(and(eq(servicio.negocioId, negocioId), isNotNull(servicio.categoria)))
    .orderBy(asc(servicio.categoria));
  return filas.map((f) => f.categoria!);
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

/** Servicios activos que se ofrecen (con `servicio_sede` activo) en la sede principal (PAN-18). */
export async function contarOfrecidosEnLaPrincipal(negocioId: string): Promise<number> {
  const [{ total }] = await db()
    .select({ total: count() })
    .from(servicio)
    .innerJoin(
      servicioSede,
      and(eq(servicioSede.servicioId, servicio.id), eq(servicioSede.negocioId, servicio.negocioId)),
    )
    .where(
      and(
        eq(servicio.negocioId, negocioId),
        eq(servicio.activo, true),
        eq(servicioSede.activo, true),
        eq(servicioSede.sedeId, idSedePrincipal(negocioId)),
      ),
    );
  return total;
}

/** Un servicio como lo ve el cliente (PUB-02): sin buffer ni precio (D-25). */
export type ServicioOfrecido = {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  /** La de la sede si la sobrescribe (RN-32). */
  duracionMinutos: number;
};

/**
 * Los servicios que se pueden reservar en la sede: el servicio, su oferta en la sede, la
 * asociación con el recurso y el recurso, activos (RN-05; los mismos filtros que
 * `agenda.oferta`). En el orden del catálogo (`servicio.orden`, luego el nombre).
 */
export async function ofrecidosEn(negocioId: string, sedeId: string): Promise<ServicioOfrecido[]> {
  const filas = await db()
    .selectDistinctOn([servicio.orden, servicio.nombre, servicio.id], {
      id: servicio.id,
      nombre: servicio.nombre,
      descripcion: servicio.descripcion,
      categoria: servicio.categoria,
      duracionMinutos: sql<number>`coalesce(${servicioSede.duracionMinutos}, ${servicio.duracionMinutos})`,
    })
    .from(servicio)
    .innerJoin(
      servicioSede,
      and(eq(servicioSede.servicioId, servicio.id), eq(servicioSede.negocioId, servicio.negocioId)),
    )
    .innerJoin(
      servicioSedeRecurso,
      and(
        eq(servicioSedeRecurso.servicioId, servicioSede.servicioId),
        eq(servicioSedeRecurso.sedeId, servicioSede.sedeId),
        eq(servicioSedeRecurso.negocioId, servicioSede.negocioId),
      ),
    )
    .innerJoin(
      recurso,
      and(eq(recurso.id, servicioSedeRecurso.recursoId), eq(recurso.negocioId, servicioSedeRecurso.negocioId)),
    )
    .where(
      and(
        eq(servicio.negocioId, negocioId),
        eq(servicioSede.sedeId, sedeId),
        eq(servicio.activo, true),
        eq(servicioSede.activo, true),
        eq(servicioSedeRecurso.activo, true),
        eq(recurso.activo, true),
      ),
    )
    .orderBy(asc(servicio.orden), asc(servicio.nombre), asc(servicio.id));
  // `coalesce` de dos smallint: el driver HTTP lo puede entregar como texto.
  return filas.map((f) => ({ ...f, duracionMinutos: Number(f.duracionMinutos) }));
}
