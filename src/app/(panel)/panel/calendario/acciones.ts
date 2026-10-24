"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { generarEnlaceCalendario } from "@/servidor/casos-uso/enlace-calendario";

// Server Action de PAN-20. Adaptador delgado (ARCH §4): el negocio sale de la sesión con
// `requireEscritura` (D-14). Crear y regenerar son la misma operación: revoca el vigente,
// si lo hay, y crea otro (ARCH §14.7).

export const generarEnlaceCalendarioPanel = accion(async () => {
  const ctx = await requireEscritura();
  const resultado = await generarEnlaceCalendario(ctx, new Date());
  if (resultado.ok) revalidatePath("/panel/calendario");
  return resultado;
});
