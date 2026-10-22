import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import { cambiarHora, negocioDelPanel, type HorarioNoDisponible } from "./agendar";
import { esId } from "./esquemas";

// Mover una cita (PAN-05, F-07; RN-11, RN-14, RN-15, D-11, D-20, S-06, S-07; ARCH
// §11.2, §14.1 y §18.4; Q-55, Q-60). El dueño elige otra hora libre del mismo servicio,
// sin anticipación y sin plazo. La cita conserva su id, su código y su servicio. La
// Server Action ya llamó a `requireEscritura` (D-14), y el negocio sale de la sesión
// (ARCH §6).

type Ctx = Pick<ContextoMiembro, "negocioId" | "clerkUserId">;

export const esquemaMoverCita = z.object({
  citaId: z.string(),
  /** Una de las horas libres de `consultarHorasDueno` con `citaExcluida`, en ISO 8601 UTC. */
  inicio: z.iso.datetime(),
  /** La `version` que se mostró al dueño (control optimista; Q-55). */
  version: z.coerce.number().int().min(1),
});

export type EntradaMoverCita = z.input<typeof esquemaMoverCita>;

/** La cita en su hora nueva, con la versión que el detalle muestra después. */
export type CitaMovida = { citaId: string; inicio: string; fin: string; version: number };

export type ResultadoMoverCita =
  | Resultado<CitaMovida, "DATOS_INVALIDOS" | "NO_ENCONTRADO" | "ESTADO_INVALIDO" | "CONFLICTO_VERSION">
  | HorarioNoDisponible;

/**
 * Mueve una cita `confirmada` a otra hora (ARCH §18.4). En una transacción, el cambio de
 * hora del núcleo con actor `dueno` (`cambiarHora`): el bloqueo del recurso, la cita
 * leída después del bloqueo, su estado y su `version`, la nueva hora evaluada sin la
 * propia cita (RN-14, D-11), la misma fila con `version + 1` y sin tocar
 * `reprogramaciones_cliente` (D-20), el recordatorio de la versión nueva y el evento
 * `reprogramada` del dueño. Después encola C-04 si la cita tiene correo, con la clave
 * `reprogramacion:{citaId}:v{version}` y la hora anterior en `datos`, sin C-06 (S-06;
 * Q-60).
 *
 * Errores: `NO_ENCONTRADO` (cita inexistente, de otro negocio o id que no es un uuid),
 * `ESTADO_INVALIDO` (no está `confirmada`), `CONFLICTO_VERSION` (otro cambio llegó antes),
 * `HORARIO_NO_DISPONIBLE` con sus motivos y `DATOS_INVALIDOS` (una entrada mal formada o
 * la misma hora que ya tiene). En todos, no cambia nada.
 */
export async function moverCita(ctx: Ctx, entrada: unknown, ahora: Date): Promise<ResultadoMoverCita> {
  const leida = esquemaMoverCita.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { citaId, version } = leida.data;
  if (!esId(citaId)) return fallo("NO_ENCONTRADO");
  const inicio = new Date(leida.data.inicio);

  const { negocio } = await negocioDelPanel(ctx.negocioId);
  return enTransaccion(async (tx): Promise<ResultadoMoverCita> => {
    const cambio = await cambiarHora(
      { negocio, citaId, inicio, version, quien: { actor: "dueno", actorId: ctx.clerkUserId } },
      ahora,
      tx,
    );
    if (!cambio.ok) return cambio;
    const c = cambio.valor;
    if (c.clienteCorreo !== null) {
      // Nadie lo envía hasta la Fase 6 (Q-60). Sin C-06: el dueño no recibe avisos de lo que él hace (S-06).
      await notificaciones.encolar(
        negocio.id,
        c.clienteCorreo,
        [
          {
            citaId: c.citaId,
            tipo: "reprogramacion",
            claveIdempotencia: `reprogramacion:${c.citaId}:v${c.version}`,
            programadaPara: ahora,
            datos: { version: c.version, inicio_anterior: c.inicioAnterior.toISOString() },
          },
        ],
        tx,
      );
    }
    return exito({ citaId: c.citaId, inicio: c.inicio.toISOString(), fin: c.fin.toISOString(), version: c.version });
  });
}
