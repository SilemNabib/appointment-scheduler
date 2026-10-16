"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { activarServicio, desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";

// Server Actions de PAN-12. Adaptadores delgados (ARCH §4): el negocio sale de la
// sesión con `requireEscritura` (D-14), y el cupo de `max_services` lo exige el caso
// de uso en el servidor, aunque la acción se llame sin pasar por la página (RN-25).
// Se revalida todo el panel, porque el inicio cuenta los servicios activos (PAN-18).

export const guardarServicioPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await guardarServicio(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});

export const activarServicioPanel = accion(async (id: string) => {
  const ctx = await requireEscritura();
  const resultado = await activarServicio(ctx, id);
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});

export const desactivarServicioPanel = accion(async (id: string) => {
  const ctx = await requireEscritura();
  const resultado = await desactivarServicio(ctx, id);
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});
