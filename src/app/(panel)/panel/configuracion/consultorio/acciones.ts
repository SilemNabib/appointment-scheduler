"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { guardarConsultorio } from "@/servidor/casos-uso/consultorio";

// Server Action de PAN-13. Adaptador delgado (ARCH §4): el negocio sale de la sesión
// con `requireEscritura` (D-14), y el esquema vive en el caso de uso.

export const guardarConsultorioPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await guardarConsultorio(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});
