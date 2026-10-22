"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura, requireMiembro } from "@/servidor/auth/sesion";
import { consultarHorasDueno } from "@/servidor/casos-uso/horas-dueno";
import { moverCita } from "@/servidor/casos-uso/mover-cita";

// Server Actions del detalle de la cita (PAN-05 a PAN-07). Adaptadores delgados (ARCH §4):
// el negocio sale de la sesión con `requireEscritura` (D-14), y los ids que llegan del
// navegador solo se usan junto con ese negocio (ARCH §6). Las reglas viven en los casos
// de uso. Después de un cambio se revalidan el detalle y la agenda.

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
  const resultado = await moverCita(ctx, entrada, new Date());
  if (resultado.ok) revalidar(entrada.citaId);
  return resultado;
});
