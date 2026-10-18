import "server-only";
import { and, asc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Intervalo } from "@/dominio/disponibilidad";
import type { FranjaValida } from "@/dominio/horario";
import { db, type Conexion } from "../cliente";
import { bloqueo, cita, horarioSemanal, recurso, sede, servicio, servicioSede, servicioSedeRecurso } from "../esquema";

// Lecturas de la agenda de UN servicio en UNA sede, para el motor de disponibilidad
// (ARCH §10, §11.2). Funcionan con la conexión HTTP (la consulta de disponibilidad) y
// dentro de una transacción (la reserva, después de tomar el bloqueo del recurso).
// Toda función recibe `negocioId` y lo usa en el WHERE (ARCH §6, defensa 1); la sede
// es un filtro dentro del negocio.

/** Un servicio que se ofrece en una sede, con el recurso que lo atiende y el horario de la sede. */
export type Oferta = {
  servicio: { id: string; nombre: string; duracionMinutos: number; bufferMinutos: number };
  sedeId: string;
  /** En el MVP, el único recurso activo de la oferta: el consultorio (ARCH §10.3). */
  recurso: { id: string; capacidad: number };
  /** Franjas de la sede (`recurso_id` en `NULL`), por día e inicio, en `HH:mm`. */
  franjas: FranjaValida[];
};

/**
 * La oferta de un servicio en una sede, o `null` si el servicio, la sede, su
 * `servicio_sede` o su recurso no están activos, o no son del negocio (RN-05; ARCH §6).
 * La duración y el buffer son los de la sede si los sobrescribe y, si no, los del
 * servicio (RN-32).
 */
export async function oferta(
  negocioId: string,
  sedeId: string,
  servicioId: string,
  conexion: Conexion = db(),
): Promise<Oferta | null> {
  const [filas, franjas] = await Promise.all([
    conexion
      .select({
        id: servicio.id,
        nombre: servicio.nombre,
        duracionMinutos: sql<number>`coalesce(${servicioSede.duracionMinutos}, ${servicio.duracionMinutos})`,
        bufferMinutos: sql<number>`coalesce(${servicioSede.bufferMinutos}, ${servicio.bufferMinutos})`,
        recursoId: recurso.id,
        capacidad: recurso.capacidad,
      })
      .from(servicio)
      .innerJoin(
        servicioSede,
        and(eq(servicioSede.servicioId, servicio.id), eq(servicioSede.negocioId, servicio.negocioId)),
      )
      .innerJoin(sede, and(eq(sede.id, servicioSede.sedeId), eq(sede.negocioId, servicioSede.negocioId)))
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
          eq(servicio.id, servicioId),
          eq(servicioSede.sedeId, sedeId),
          eq(servicio.activo, true),
          eq(servicioSede.activo, true),
          eq(sede.activa, true),
          eq(servicioSedeRecurso.activo, true),
          eq(recurso.activo, true),
        ),
      )
      .orderBy(asc(recurso.orden), asc(recurso.id))
      .limit(1),
    franjasDeSede(negocioId, sedeId, conexion),
  ]);
  const [fila] = filas;
  if (!fila) return null;
  return {
    servicio: {
      id: fila.id,
      nombre: fila.nombre,
      // `coalesce` de dos smallint: el driver HTTP lo puede entregar como texto.
      duracionMinutos: Number(fila.duracionMinutos),
      bufferMinutos: Number(fila.bufferMinutos),
    },
    sedeId,
    recurso: { id: fila.recursoId, capacidad: fila.capacidad },
    franjas,
  };
}

/** Franjas del horario de la sede, sin las de los empleados, por día e inicio (ARCH §10). */
async function franjasDeSede(negocioId: string, sedeId: string, conexion: Conexion): Promise<FranjaValida[]> {
  const filas = await conexion
    .select({ dia: horarioSemanal.diaSemana, inicio: horarioSemanal.horaInicio, fin: horarioSemanal.horaFin })
    .from(horarioSemanal)
    .where(
      and(
        eq(horarioSemanal.negocioId, negocioId),
        eq(horarioSemanal.sedeId, sedeId),
        isNull(horarioSemanal.recursoId),
      ),
    )
    .orderBy(asc(horarioSemanal.diaSemana), asc(horarioSemanal.horaInicio));
  // El CHECK de `dia_semana` garantiza 1 a 7; las horas llegan como `HH:mm:ss`.
  return filas.map((f) => ({ dia: f.dia as FranjaValida["dia"], inicio: f.inicio.slice(0, 5), fin: f.fin.slice(0, 5) }));
}

/**
 * Bloqueos que aplican al recurso y se solapan con el rango `[inicio, fin)` (ARCH
 * §11.2): los de todo el negocio (`sede_id` en `NULL`), los de su sede (`recurso_id` en
 * `NULL`) y los suyos. Los de otra sede o de otro recurso no aplican (RN-32).
 */
export async function bloqueos(
  negocioId: string,
  alcance: { sedeId: string; recursoId: string },
  rango: Intervalo,
  conexion: Conexion = db(),
): Promise<Intervalo[]> {
  return conexion
    .select({ inicio: bloqueo.inicio, fin: bloqueo.fin })
    .from(bloqueo)
    .where(
      and(
        eq(bloqueo.negocioId, negocioId),
        or(isNull(bloqueo.sedeId), eq(bloqueo.sedeId, alcance.sedeId)),
        or(isNull(bloqueo.recursoId), eq(bloqueo.recursoId, alcance.recursoId)),
        lt(bloqueo.inicio, rango.fin),
        gt(bloqueo.fin, rango.inicio),
      ),
    )
    .orderBy(asc(bloqueo.inicio));
}

/**
 * Ocupación del recurso en el rango (ARCH §11.2): `[inicio, ocupado_hasta)` de cada
 * cita no cancelada que se solapa con él. Toda cita no cancelada ocupa, también las
 * `completada` y `no_asistio` (RN-10, D-06). `citaExcluida` deja fuera la propia cita
 * al reprogramarla o moverla (RN-14). El filtro `estado <> 'cancelada'` es el de
 * `cita_ocupacion_idx`.
 */
export async function ocupacion(
  negocioId: string,
  recursoId: string,
  rango: Intervalo,
  citaExcluida: string | null = null,
  conexion: Conexion = db(),
): Promise<Intervalo[]> {
  return conexion
    .select({ inicio: cita.inicio, fin: cita.ocupadoHasta })
    .from(cita)
    .where(
      and(
        eq(cita.negocioId, negocioId),
        eq(cita.recursoId, recursoId),
        ne(cita.estado, "cancelada"),
        lt(cita.inicio, rango.fin),
        gt(cita.ocupadoHasta, rango.inicio),
        citaExcluida === null ? undefined : ne(cita.id, citaExcluida),
      ),
    )
    .orderBy(asc(cita.inicio));
}
