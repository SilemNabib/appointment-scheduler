import "server-only";
import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Intervalo } from "@/dominio/disponibilidad";
import { db, type Conexion } from "../cliente";
import { cita } from "../esquema";

// Citas (RN-10, RN-12, RN-17; ARCH §11 y §18.2). Toda función recibe `negocioId` y lo
// usa en el WHERE (ARCH §6, defensa 1). Las citas no se borran: cambian de estado.

/**
 * Citas creadas en el período (el mes calendario local, ARCH §9 regla 5), para el cupo
 * de `max_appointments_per_month` (ARCH §16.3). Cuentan todas, también las canceladas,
 * para que crear y cancelar no sirva para esquivar el límite (Q-29).
 */
export async function contarCreadas(negocioId: string, periodo: Intervalo, conexion: Conexion = db()): Promise<number> {
  const [{ total }] = await conexion
    .select({ total: count() })
    .from(cita)
    .where(and(eq(cita.negocioId, negocioId), gte(cita.creadoEn, periodo.inicio), lt(cita.creadoEn, periodo.fin)));
  return total;
}
