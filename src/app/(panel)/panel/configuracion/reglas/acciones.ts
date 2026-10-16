"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { guardarReglasReserva } from "@/servidor/casos-uso/configuracion";

// Server Action de PAN-15. Adaptador delgado (ARCH §4): el negocio sale de la sesión
// con `requireEscritura` (D-14); el esquema vive en el caso de uso.

export const guardarReglasPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await guardarReglasReserva(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel/configuracion/reglas");
  return resultado;
});
