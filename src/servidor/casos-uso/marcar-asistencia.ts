import "server-only";
import { z } from "zod";
import { ESTADOS_ASISTENCIA, ESTADOS_CITA, eventoDeTransicion, sePuedeMarcar } from "@/dominio/estados-cita";
import { puedeMarcarAsistencia } from "@/dominio/plazos";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";
import { esId } from "./esquemas";

// Marcar la asistencia (PAN-07, F-08; RN-16, D-06, S-08, S-09; ARCH §18.4; Q-55). El
// dueño marca "Asistió" (`completada`) o "No asistió" (`no_asistio`) desde el inicio, y
// corrige entre las dos. No cambia la ocupación (D-06), así que no toma el bloqueo del
// recurso (ARCH §11.3), y el cliente no recibe correo (F-08, paso 5). La Server Action
// ya llamó a `requireEscritura` (D-14), y el negocio sale de la sesión (ARCH §6).

type Ctx = Pick<ContextoMiembro, "negocioId" | "clerkUserId">;

export const esquemaMarcarAsistencia = z.object({
  citaId: z.string(),
  estado: z.enum(ESTADOS_ASISTENCIA),
  /** El estado que vio el dueño (Q-55): si ya cambió, no se aplica. */
  estadoEsperado: z.enum(ESTADOS_CITA),
});

export type EntradaMarcarAsistencia = z.input<typeof esquemaMarcarAsistencia>;

/**
 * Marca o corrige la asistencia (ARCH §18.4):
 *
 * - antes del inicio, `ANTES_DEL_INICIO` (RN-16, con `plazos.ts`);
 * - acepta pasar de `confirmada` a `completada` o `no_asistio`, y corregir entre esas dos
 *   (S-09), según `estados-cita.ts`. Una cita `cancelada` devuelve `ESTADO_INVALIDO` (S-08);
 * - el cambio va con `UPDATE … WHERE estado = estadoEsperado` (Q-55): si el estado ya no
 *   es el que vio el dueño (un doble clic, otra pestaña), `ESTADO_INVALIDO` sin cambiar
 *   nada;
 * - deja el evento de la transición (`completada`, `no_asistio`, o `estado_corregido` con
 *   `{ de, a }`) con el dueño como actor, y no encola ninguna notificación (F-08, paso 5).
 *
 * Una cita inexistente, de otro negocio o un id que no es un uuid devuelven
 * `NO_ENCONTRADO` (ARCH §6); una entrada mal formada, `DATOS_INVALIDOS`.
 */
export async function marcarAsistencia(
  ctx: Ctx,
  entrada: unknown,
  ahora: Date,
): Promise<
  Resultado<{ citaId: string }, "DATOS_INVALIDOS" | "NO_ENCONTRADO" | "ANTES_DEL_INICIO" | "ESTADO_INVALIDO">
> {
  const leida = esquemaMarcarAsistencia.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { citaId, estado, estadoEsperado } = leida.data;
  if (!esId(citaId)) return fallo("NO_ENCONTRADO");

  return enTransaccion(async (tx) => {
    const cita = await citas.paraCambio(ctx.negocioId, citaId, tx);
    if (!cita) return fallo("NO_ENCONTRADO");
    if (!sePuedeMarcar(cita.estado)) return fallo("ESTADO_INVALIDO");
    if (!puedeMarcarAsistencia(cita.inicio, ahora)) return fallo("ANTES_DEL_INICIO");
    const tipo = eventoDeTransicion(estadoEsperado, estado);
    if (tipo === null) return fallo("ESTADO_INVALIDO");

    if (!(await citas.cambiarEstado(ctx.negocioId, citaId, { de: estadoEsperado, a: estado }, tx))) {
      return fallo("ESTADO_INVALIDO");
    }
    await citas.registrarEvento(
      ctx.negocioId,
      citaId,
      {
        tipo,
        actor: { actor: "dueno", actorId: ctx.clerkUserId },
        datos: tipo === "estado_corregido" ? { de: estadoEsperado, a: estado } : {},
      },
      tx,
    );
    return exito({ citaId });
  });
}
