import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { ErrorNegocio } from "@/dominio/resultado";
import { db } from "@/servidor/db/cliente";
import {
  negocio,
  negocioFuncionalidad,
  negocioLimite,
  plan,
  planFuncionalidad,
  planLimite,
} from "@/servidor/db/esquema";
import { FUNCIONALIDADES, LIMITES, type Funcionalidad, type Limite } from "./catalogo";

// Función de acceso a planes (RN-25, ARCH §16.3): el ÚNICO módulo que lee las tablas
// de planes y de excepciones (lo hace cumplir el lint, T1.32).
//
// Resolución: excepción del negocio, luego el plan y, por último, el catálogo. Como
// `NULL` significa ilimitado, no se puede usar `COALESCE`: se distingue "la fila no
// existe" (la clave del LEFT JOIN es NULL) de "la fila existe con `NULL`".

/** Un negocio inexistente responde igual que uno de otro negocio (ARCH §6, defensa 3). */
function unaFila<T>(filas: T[]): T {
  if (filas.length === 0) throw new ErrorNegocio("NO_ENCONTRADO");
  return filas[0];
}

export async function tieneFuncionalidad(negocioId: string, clave: Funcionalidad): Promise<boolean> {
  const fila = unaFila(
    await db()
      .select({
        excepcion: negocioFuncionalidad.negocioId,
        valorNegocio: negocioFuncionalidad.habilitada,
        delPlan: planFuncionalidad.planId,
        valorPlan: planFuncionalidad.habilitada,
      })
      .from(negocio)
      .leftJoin(
        negocioFuncionalidad,
        and(eq(negocioFuncionalidad.negocioId, negocio.id), eq(negocioFuncionalidad.funcionalidad, clave)),
      )
      .leftJoin(
        planFuncionalidad,
        and(eq(planFuncionalidad.planId, negocio.planId), eq(planFuncionalidad.funcionalidad, clave)),
      )
      .where(eq(negocio.id, negocioId)),
  );
  if (fila.excepcion !== null) return fila.valorNegocio!;
  if (fila.delPlan !== null) return fila.valorPlan!;
  return FUNCIONALIDADES[clave].porDefecto;
}

/** Valor del límite para el negocio; `null` = ilimitado. */
export async function limite(negocioId: string, clave: Limite): Promise<number | null> {
  const fila = unaFila(
    await db()
      .select({
        excepcion: negocioLimite.negocioId,
        valorNegocio: negocioLimite.valor,
        delPlan: planLimite.planId,
        valorPlan: planLimite.valor,
      })
      .from(negocio)
      .leftJoin(negocioLimite, and(eq(negocioLimite.negocioId, negocio.id), eq(negocioLimite.limite, clave)))
      .leftJoin(planLimite, and(eq(planLimite.planId, negocio.planId), eq(planLimite.limite, clave)))
      .where(eq(negocio.id, negocioId)),
  );
  if (fila.excepcion !== null) return fila.valorNegocio;
  if (fila.delPlan !== null) return fila.valorPlan;
  return LIMITES[clave].porDefecto;
}

/**
 * Lanza `ErrorNegocio('LIMITE_PLAN')` si `usoActual >= limite`. Solo se llama al
 * CREAR o REACTIVAR (RN-28): reducir un límite no afecta lo que ya existe.
 */
export async function exigirCupo(negocioId: string, clave: Limite, usoActual: number): Promise<void> {
  const maximo = await limite(negocioId, clave);
  if (maximo !== null && usoActual >= maximo) throw new ErrorNegocio("LIMITE_PLAN");
}

export type PlanResumen = { id: string; codigo: string; nombre: string };

/** Planes existentes, para el alta y la lista del admin, que así no leen `plan` fuera de este módulo. */
export async function listarPlanes(): Promise<PlanResumen[]> {
  return db()
    .select({ id: plan.id, codigo: plan.codigo, nombre: plan.nombre })
    .from(plan)
    .orderBy(asc(plan.nombre), asc(plan.codigo));
}
