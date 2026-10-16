import "server-only";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { FranjaValida } from "@/dominio/horario";
import { db, type Transaccion } from "../cliente";
import { horarioSemanal } from "../esquema";
import { idSedePrincipal } from "./sedes";

// Horario semanal de las sedes (RN-07; ARCH §17.3). Las horas son locales de la sede.
// `recurso_id` en `NULL` es el horario de la sede; con valor, el horario propio de un
// empleado (D-19), que en el MVP no tiene interfaz. Toda función recibe `negocioId` y
// lo usa en el WHERE (ARCH §6, defensa 1).

const deLaSede = (negocioId: string, sedeId: string | ReturnType<typeof idSedePrincipal>) =>
  and(eq(horarioSemanal.negocioId, negocioId), eq(horarioSemanal.sedeId, sedeId), isNull(horarioSemanal.recursoId));

/** Franjas de la sede principal, por día e inicio, con las horas en `HH:mm` (Q-20). */
export async function semanaPrincipal(negocioId: string): Promise<FranjaValida[]> {
  const filas = await db()
    .select({ dia: horarioSemanal.diaSemana, inicio: horarioSemanal.horaInicio, fin: horarioSemanal.horaFin })
    .from(horarioSemanal)
    .where(deLaSede(negocioId, idSedePrincipal(negocioId)))
    .orderBy(asc(horarioSemanal.diaSemana), asc(horarioSemanal.horaInicio));
  return filas.map((f) => ({ dia: f.dia as FranjaValida["dia"], inicio: f.inicio.slice(0, 5), fin: f.fin.slice(0, 5) }));
}

/**
 * Reemplaza todas las franjas de la sede (no las de los empleados) por las de la
 * semana nueva, ya validada (ARCH §17.3). Va dentro de la transacción que tomó la
 * fila de la sede, para que dos reemplazos no se mezclen.
 */
export async function reemplazarSemana(
  negocioId: string,
  sedeId: string,
  franjas: FranjaValida[],
  tx: Transaccion,
): Promise<void> {
  await tx.delete(horarioSemanal).where(deLaSede(negocioId, sedeId));
  if (franjas.length === 0) return;
  await tx.insert(horarioSemanal).values(
    franjas.map((f) => ({ negocioId, sedeId, diaSemana: f.dia, horaInicio: f.inicio, horaFin: f.fin })),
  );
}

/** Franjas del horario de la sede principal, sin las de los empleados (PAN-18). */
export async function contarFranjasPrincipal(negocioId: string): Promise<number> {
  const [{ total }] = await db()
    .select({ total: count() })
    .from(horarioSemanal)
    .where(deLaSede(negocioId, idSedePrincipal(negocioId)));
  return total;
}
