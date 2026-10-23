import "server-only";
import { enTransaccion, fijarActor } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";

// Vencimientos de la suscripción en el cron (RN-30, RN-31, D-13, S-16; ADR-14; ARCH §7.6,
// §14.1 y §18.3; Q-75). El estado efectivo ya se calcula en cada solicitud, así que la
// suspensión llega a tiempo aunque el cron se retrase; esta tarea la persiste, para que
// quede auditada con el autor `sistema` y el admin la vea, y encola los avisos del dueño.
// Es la primera tarea del cron, para que las siguientes vean el estado actualizado (ARCH §14.4).

export type ResultadoVencimientos = { avisosDeGracia: number; suspendidos: number };

/**
 * En una transacción con `app.actor = 'sistema'`: encola C-07 a los negocios en gracia,
 * una vez por vencimiento, y suspende los que terminaron la gracia, con su C-08 en la
 * misma sentencia (RN-31, S-16).
 */
export async function aplicarVencimientos(ahora: Date): Promise<ResultadoVencimientos> {
  return enTransaccion(async (tx) => {
    await fijarActor(tx, "sistema");
    const avisosDeGracia = await negocios.encolarAvisosDeGracia(ahora, tx);
    const suspendidos = await negocios.suspenderPorFinDeGracia(ahora, tx);
    return { avisosDeGracia, suspendidos: suspendidos.length };
  });
}
