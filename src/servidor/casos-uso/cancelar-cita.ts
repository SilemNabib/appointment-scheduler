import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import { esId } from "./esquemas";

// Cancelar una cita (PAN-06, F-07; RN-10, RN-15, S-06, S-08; ARCH §14.1 y §18.4; Q-55,
// Q-60). Esta fase trae la rama del dueño, que no tiene plazo (RN-15); la del cliente,
// con el link firmado y el plazo de RN-13, llega en la Fase 6. Cancelar reduce la
// ocupación, así que no toma el bloqueo del recurso (ARCH §11.3). La Server Action ya
// llamó a `requireEscritura` (D-14), y el negocio sale de la sesión (ARCH §6).

type Ctx = Pick<ContextoMiembro, "negocioId" | "clerkUserId">;

export const esquemaCancelarCita = z.object({ citaId: z.string() });

export type EntradaCancelarCita = z.input<typeof esquemaCancelarCita>;

/**
 * El dueño cancela una cita `confirmada`, aunque ya haya empezado (Q-55). En una
 * transacción: `UPDATE … WHERE estado = 'confirmada'` la deja `cancelada`, con
 * `cancelada_en = ahora` y `cancelada_por = 'dueno'`, y libera su cupo de inmediato
 * (RN-10); anula el recordatorio pendiente, registra el evento `cancelada` del dueño y
 * encola C-03 si tiene correo, con la clave `cancelacion:{citaId}`, sin C-06 (S-06; Q-60).
 *
 * Cancelarla otra vez, o cancelar una que ya no está `confirmada`, devuelve
 * `ESTADO_INVALIDO` sin crear otro evento ni otra notificación: así los dobles clics no
 * repiten nada (ARCH §18.4; S-08). Una cita inexistente, de otro negocio o un id que no
 * es un uuid devuelven `NO_ENCONTRADO` (ARCH §6).
 */
export async function cancelarCita(
  ctx: Ctx,
  entrada: unknown,
  ahora: Date,
): Promise<Resultado<{ citaId: string }, "NO_ENCONTRADO" | "ESTADO_INVALIDO">> {
  const leida = esquemaCancelarCita.safeParse(entrada);
  if (!leida.success || !esId(leida.data.citaId)) return fallo("NO_ENCONTRADO");
  const { citaId } = leida.data;

  return enTransaccion(async (tx) => {
    const cancelada = await citas.cancelar(ctx.negocioId, citaId, { canceladaEn: ahora, canceladaPor: "dueno" }, tx);
    if (!cancelada) {
      return (await citas.paraCambio(ctx.negocioId, citaId, tx)) ? fallo("ESTADO_INVALIDO") : fallo("NO_ENCONTRADO");
    }
    await notificaciones.anularRecordatorios(ctx.negocioId, citaId, tx);
    await citas.registrarEvento(ctx.negocioId, citaId, { tipo: "cancelada", actor: { actor: "dueno", actorId: ctx.clerkUserId } }, tx);
    if (cancelada.clienteCorreo !== null) {
      // Nadie lo envía hasta la Fase 6 (Q-60). Sin C-06: el dueño no recibe avisos de lo que él hace (S-06).
      await notificaciones.encolar(
        ctx.negocioId,
        cancelada.clienteCorreo,
        [{ citaId, tipo: "cancelacion", claveIdempotencia: `cancelacion:${citaId}`, programadaPara: ahora }],
        tx,
      );
    }
    return exito({ citaId });
  });
}
