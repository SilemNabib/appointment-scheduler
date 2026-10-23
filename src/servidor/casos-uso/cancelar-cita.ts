import "server-only";
import { z } from "zod";
import { accionesDelCliente, reprogramacionesRestantes } from "@/dominio/plazos";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as citas from "@/servidor/db/repositorios/citas";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import { esId } from "./esquemas";
import { verificarLink, type CitaGestionada, type EntradaLink } from "./gestion-cita";

// Cancelar una cita (PAN-06, F-07, GES-02, F-02; RN-10, RN-13, RN-15, S-06, S-08; ARCH §14.1
// y §18.4; Q-55, Q-60, Q-68, Q-69). Dos ramas: la del dueño, sin plazo (RN-15), cuya Server
// Action ya llamó a `requireEscritura` (D-14) y cuyo negocio sale de la sesión (ARCH §6); y
// la del cliente, con el link firmado y el plazo de RN-13. Cancelar reduce la ocupación,
// así que no toma el bloqueo del recurso (ARCH §11.3).

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

export type ResultadoCancelarPorLink = Resultado<
  CitaGestionada,
  "NO_ENCONTRADO" | "NEGOCIO_SUSPENDIDO" | "FUERA_DE_PLAZO" | "ESTADO_INVALIDO"
>;

/**
 * El cliente cancela desde su link (GES-02, F-02). Con el link verificado (`verificarLink`)
 * y el negocio no suspendido (D-14), en una transacción: vuelve a aplicar
 * `accionesDelCliente` a la cita leída en ella (el plazo de RN-13; T6.03), la cancela con
 * `UPDATE … WHERE estado = 'confirmada'` y `cancelada_por = 'cliente'`, anula su
 * recordatorio, registra el evento `cancelada` del cliente y encola C-03 al correo de la
 * reserva y un solo C-06 al dueño, con la clave `dueno_cambio:{citaId}:{eventoId}` y
 * `{ "cambio": "cancelada" }` (RN-22; Q-68). Fuera del plazo devuelve `FUERA_DE_PLAZO`, y
 * cancelada otra vez, `ESTADO_INVALIDO`, sin cambiar nada (S-08).
 */
export async function cancelarCitaDelCliente(entrada: EntradaLink, ahora: Date): Promise<ResultadoCancelarPorLink> {
  const v = await verificarLink(entrada);
  if (!v) return fallo("NO_ENCONTRADO");
  const suscripcion = estadoEfectivo(v.negocio, ahora);
  if (suscripcion.estado === "suspendida") return fallo("NEGOCIO_SUSPENDIDO");
  const negocioId = v.negocio.id;
  const citaId = v.cita.id;

  return enTransaccion(async (tx): Promise<ResultadoCancelarPorLink> => {
    const actual = await citas.paraCambio(negocioId, citaId, tx);
    if (!actual) return fallo("NO_ENCONTRADO");
    const { cancelar } = accionesDelCliente(actual, v.reglas, suscripcion, ahora);
    if (!cancelar.permitida) return fallo(cancelar.error === "FUERA_DE_PLAZO" ? "FUERA_DE_PLAZO" : "ESTADO_INVALIDO");

    const cancelada = await citas.cancelar(negocioId, citaId, { canceladaEn: ahora, canceladaPor: "cliente" }, tx);
    // Otra cancelación ganó la carrera: la de un doble clic o la del dueño.
    if (!cancelada) return fallo("ESTADO_INVALIDO");
    await notificaciones.anularRecordatorios(negocioId, citaId, tx);
    const eventoId = await citas.registrarEvento(negocioId, citaId, { tipo: "cancelada", actor: { actor: "cliente" } }, tx);
    if (cancelada.clienteCorreo !== null) {
      await notificaciones.encolar(
        negocioId,
        cancelada.clienteCorreo,
        [{ citaId, tipo: "cancelacion", claveIdempotencia: `cancelacion:${citaId}`, programadaPara: ahora }],
        tx,
      );
    }
    await notificaciones.encolarAlDueno(
      negocioId,
      {
        citaId,
        tipo: "dueno_cambio",
        claveIdempotencia: `dueno_cambio:${citaId}:${eventoId}`,
        programadaPara: ahora,
        datos: { cambio: "cancelada" },
      },
      tx,
    );
    return exito({
      citaId,
      estado: "cancelada",
      inicio: actual.inicio.toISOString(),
      fin: actual.fin.toISOString(),
      reprogramacionesRestantes: reprogramacionesRestantes(actual.reprogramacionesCliente, v.reglas.maxReprogramacionesCliente),
    });
  });
}
