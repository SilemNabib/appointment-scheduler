"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura, requireMiembro } from "@/servidor/auth/sesion";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { consultarHorasDueno } from "@/servidor/casos-uso/horas-dueno";
import { marcarAsistencia } from "@/servidor/casos-uso/marcar-asistencia";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { despacharSiSalioBien } from "@/servidor/notificaciones/despacho";

// Server Actions del detalle de la cita (PAN-05 a PAN-07). Adaptadores delgados (ARCH §4):
// el negocio sale de la sesión con `requireEscritura` (D-14), y los ids que llegan del
// navegador solo se usan junto con ese negocio (ARCH §6). Las reglas viven en los casos
// de uso. Después de un cambio se revalidan el detalle y la agenda, y salen sus correos
// (C-04 al mover y C-03 al cancelar; ARCH §14.4).

function revalidar(citaId: string) {
  revalidatePath(`/panel/citas/${citaId}`);
  revalidatePath("/panel/agenda");
}

/** Las horas libres del servicio de la cita en un día, sin contar la propia cita (RN-14; Q-56). Solo lee. */
export const horasParaMoverPanel = accion(async (entrada: { servicioId: string; fecha: string; citaExcluida?: string }) => {
  const ctx = await requireMiembro();
  return consultarHorasDueno(ctx, entrada, new Date());
});

/** Mover la cita a otra hora libre del mismo servicio, con la `version` que se mostró (PAN-05; Q-55). */
export const moverCitaPanel = accion(async (entrada: { citaId: string; inicio: string; version: number }) => {
  const ctx = await requireEscritura();
  const resultado = despacharSiSalioBien(await moverCita(ctx, entrada, new Date()));
  if (resultado.ok) revalidar(entrada.citaId);
  return resultado;
});

/** Cancelar la cita, sin plazo para el dueño (PAN-06; RN-15). */
export const cancelarCitaPanel = accion(async (citaId: string) => {
  const ctx = await requireEscritura();
  const resultado = despacharSiSalioBien(await cancelarCita(ctx, { citaId }, new Date()));
  if (resultado.ok) revalidar(citaId);
  return resultado;
});

/** Marcar o corregir la asistencia, con el estado que vio el dueño (PAN-07; S-09; Q-55). */
export const marcarAsistenciaPanel = accion(
  async (entrada: { citaId: string; estado: string; estadoEsperado: string }) => {
    const ctx = await requireEscritura();
    const resultado = await marcarAsistencia(ctx, entrada, new Date());
    if (resultado.ok) revalidar(entrada.citaId);
    return resultado;
  },
);
