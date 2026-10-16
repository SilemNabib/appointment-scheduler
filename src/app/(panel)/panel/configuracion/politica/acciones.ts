"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";

// Server Action de PAN-17. Adaptador delgado (ARCH §4): el negocio sale de la sesión
// con `requireEscritura` (D-14); publicar siempre crea una versión nueva.

export const publicarPoliticaPanel = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await publicarPolitica(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel/configuracion/politica");
  return resultado;
});
