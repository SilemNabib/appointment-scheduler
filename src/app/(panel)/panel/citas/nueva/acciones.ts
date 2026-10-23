"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accion } from "@/servidor/accion";
import { requireEscritura, requireMiembro } from "@/servidor/auth/sesion";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { buscarClientes } from "@/servidor/casos-uso/clientes";
import { consultarHorasDueno } from "@/servidor/casos-uso/horas-dueno";
import { despacharSiSalioBien } from "@/servidor/notificaciones/despacho";

// Server Actions de la cita manual (PAN-04, F-06). Adaptadores delgados (ARCH §4): el
// negocio sale de la sesión; las lecturas usan `requireMiembro` y crear, `requireEscritura`
// (D-14). Las reglas viven en los casos de uso.

/** Buscar un cliente por teléfono o nombre (Q-53). Solo lee. */
export const buscarClientesPanel = accion(async (texto: string) => {
  const ctx = await requireMiembro();
  return buscarClientes(ctx, texto);
});

/** Las horas libres del servicio en un día, para el dueño (Q-56). Solo lee. */
export const horasDuenoPanel = accion(async (entrada: { servicioId: string; fecha: string; citaExcluida?: string }) => {
  const ctx = await requireMiembro();
  return consultarHorasDueno(ctx, entrada, new Date());
});

/** Guarda la cita manual y, si sale bien, envía C-01 (si tiene correo) y lleva a su detalle (F-06; ARCH §14.4). */
export const crearCitaManualPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = despacharSiSalioBien(await crearCitaManual(ctx, Object.fromEntries(datos), new Date()));
  if (!resultado.ok) return resultado;
  revalidatePath("/panel/agenda");
  // Fuera de cualquier try: `redirect` funciona lanzando un error que Next debe recibir.
  redirect(`/panel/citas/${resultado.valor.citaId}`);
});
