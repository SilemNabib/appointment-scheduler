"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { guardarRecordatorio } from "@/servidor/casos-uso/configuracion";

// Server Action de PAN-16. Adaptador delgado (ARCH §4): el negocio sale de la sesión
// con `requireEscritura` (D-14); el esquema vive en el caso de uso.

export const guardarRecordatorioPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await guardarRecordatorio(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel/configuracion/recordatorios");
  return resultado;
});
