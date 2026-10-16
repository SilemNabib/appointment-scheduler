"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { crearBloqueo, eliminarBloqueo } from "@/servidor/casos-uso/bloqueos";

// Server Actions de PAN-08. Adaptadores delgados (ARCH §4): el negocio sale de la
// sesión con `requireEscritura` (D-14); las reglas (D-15) viven en el caso de uso.

export const crearBloqueoPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await crearBloqueo(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel/bloqueos");
  return resultado;
});

export const eliminarBloqueoPanel = accion(async (id: string) => {
  const ctx = await requireEscritura();
  const resultado = await eliminarBloqueo(ctx, id);
  if (resultado.ok) revalidatePath("/panel/bloqueos");
  return resultado;
});
