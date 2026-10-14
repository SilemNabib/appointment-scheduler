import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Transaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { CLAVES_FUNCIONALIDADES, CLAVES_LIMITES } from "./catalogo";

// Semilla de los planes (RN-26, RN-27; ARCH §18.2, Semilla). Se genera desde el
// catálogo, así un cambio en él llega a la semilla sin tocar SQL.

/** Plan interno del MVP: todas las funcionalidades habilitadas y todos los límites en `NULL` (ilimitado). */
export const PLAN_ILIMITADO = { codigo: "ilimitado", nombre: "Ilimitado (interno)" } as const;

/**
 * Crea el plan `ilimitado` con una fila por cada funcionalidad y cada límite del
 * catálogo. Es idempotente y no sobrescribe: cada fila se inserta con
 * `ON CONFLICT DO NOTHING`, así un valor cambiado después a mano (y auditado,
 * RN-30) se conserva. Devuelve cuántas filas creó.
 *
 * Se ejecuta dentro de la transacción que recibe, con `app.actor = 'semilla'`
 * para que la auditoría muestre de dónde salieron las filas.
 */
export async function sembrarPlanes(tx: Transaccion) {
  await tx.execute(sql`select set_config('app.actor', 'semilla', true)`);

  const planes = await tx
    .insert(esquema.plan)
    .values(PLAN_ILIMITADO)
    .onConflictDoNothing({ target: esquema.plan.codigo })
    .returning({ id: esquema.plan.id });

  const [{ id: planId }] = await tx
    .select({ id: esquema.plan.id })
    .from(esquema.plan)
    .where(eq(esquema.plan.codigo, PLAN_ILIMITADO.codigo));

  const funcionalidades = await tx
    .insert(esquema.planFuncionalidad)
    .values(CLAVES_FUNCIONALIDADES.map((funcionalidad) => ({ planId, funcionalidad, habilitada: true })))
    .onConflictDoNothing()
    .returning({ clave: esquema.planFuncionalidad.funcionalidad });

  const limites = await tx
    .insert(esquema.planLimite)
    .values(CLAVES_LIMITES.map((limite) => ({ planId, limite, valor: null })))
    .onConflictDoNothing()
    .returning({ clave: esquema.planLimite.limite });

  return {
    planId,
    creadas: { plan: planes.length, funcionalidades: funcionalidades.length, limites: limites.length },
  };
}
