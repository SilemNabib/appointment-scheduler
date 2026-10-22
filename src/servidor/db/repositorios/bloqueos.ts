import "server-only";
import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db, type Transaccion } from "../cliente";
import { bloqueo, cita } from "../esquema";
import { idSedePrincipal } from "./sedes";

// Bloqueos puntuales (PAN-08; RN-07, D-15; ARCH §11.3 y §17.3). Intervalos UTC
// semiabiertos `[inicio, fin)`. En el MVP se guardan con la sede principal y sin
// recurso, para que no afecten a sedes futuras. Toda función recibe `negocioId` y lo
// usa en el WHERE (ARCH §6, defensa 1).

export type Intervalo = { inicio: Date; fin: Date };

export type CitaQueImpide = {
  id: string;
  inicio: Date;
  servicio: string;
  cliente: string;
};

/**
 * Citas `confirmada` de la sede que aún no terminan (`ocupado_hasta > ahora`) y cuyo
 * intervalo `[inicio, ocupado_hasta)` se solapa con el del bloqueo (D-15). Se llama
 * dentro de la transacción, después de tomar los recursos de la sede, así ve toda
 * reserva confirmada antes (ARCH §11.3). Trae lo que el panel muestra de cada una:
 * la instantánea del servicio y del cliente de la cita.
 */
export async function citasQueImpiden(
  negocioId: string,
  sedeId: string,
  intervalo: Intervalo,
  ahora: Date,
  tx: Transaccion,
): Promise<CitaQueImpide[]> {
  const filas = await tx
    .select({
      id: cita.id,
      inicio: cita.inicio,
      servicio: cita.servicioNombre,
      nombre: cita.clienteNombre,
      apellido: cita.clienteApellido,
    })
    .from(cita)
    .where(
      and(
        eq(cita.negocioId, negocioId),
        eq(cita.sedeId, sedeId),
        eq(cita.estado, "confirmada"),
        gt(cita.ocupadoHasta, ahora),
        lt(cita.inicio, intervalo.fin),
        gt(cita.ocupadoHasta, intervalo.inicio),
      ),
    )
    .orderBy(asc(cita.inicio), asc(cita.id));
  return filas.map(({ nombre, apellido, ...resto }) => ({ ...resto, cliente: `${nombre} ${apellido}`.trim() }));
}

/** Guarda un bloqueo de toda la sede (`recurso_id` en `NULL`). Devuelve su id. */
export async function crear(
  negocioId: string,
  datos: Intervalo & { sedeId: string; motivo: string | null },
  tx: Transaccion,
): Promise<string> {
  const [{ id }] = await tx
    .insert(bloqueo)
    .values({ negocioId, ...datos, recursoId: null })
    .returning({ id: bloqueo.id });
  return id;
}

export type Bloqueo = Intervalo & { id: string; motivo: string | null };

/**
 * Bloqueos que afectan a la sede principal y aún no terminan (`fin > ahora`), por
 * inicio: los de la sede y los de todo el negocio (`sede_id` en `NULL`), como los lee
 * la reserva (ARCH §11.2).
 */
export async function vigentesDeLaPrincipal(negocioId: string, ahora: Date): Promise<Bloqueo[]> {
  return db()
    .select({ id: bloqueo.id, inicio: bloqueo.inicio, fin: bloqueo.fin, motivo: bloqueo.motivo })
    .from(bloqueo)
    .where(
      and(
        eq(bloqueo.negocioId, negocioId),
        or(isNull(bloqueo.sedeId), eq(bloqueo.sedeId, idSedePrincipal(negocioId))),
        gt(bloqueo.fin, ahora),
      ),
    )
    .orderBy(asc(bloqueo.inicio), asc(bloqueo.id));
}

/**
 * Bloqueos que afectan a la sede principal y se solapan con el rango `[inicio, fin)`,
 * por inicio: los de la sede y los de todo el negocio, para mostrarlos en la agenda
 * (PAN-02; Q-58).
 */
export async function deLaPrincipalEnRango(negocioId: string, rango: Intervalo): Promise<Bloqueo[]> {
  return db()
    .select({ id: bloqueo.id, inicio: bloqueo.inicio, fin: bloqueo.fin, motivo: bloqueo.motivo })
    .from(bloqueo)
    .where(
      and(
        eq(bloqueo.negocioId, negocioId),
        or(isNull(bloqueo.sedeId), eq(bloqueo.sedeId, idSedePrincipal(negocioId))),
        lt(bloqueo.inicio, rango.fin),
        gt(bloqueo.fin, rango.inicio),
      ),
    )
    .orderBy(asc(bloqueo.inicio), asc(bloqueo.id));
}

/** Elimina un bloqueo del negocio. Devuelve si lo encontró. */
export async function eliminar(negocioId: string, id: string): Promise<boolean> {
  const filas = await db()
    .delete(bloqueo)
    .where(and(eq(bloqueo.negocioId, negocioId), eq(bloqueo.id, id)))
    .returning({ id: bloqueo.id });
  return filas.length > 0;
}
