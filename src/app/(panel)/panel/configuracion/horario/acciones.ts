"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { guardarHorarioSemanal } from "@/servidor/casos-uso/horario";

// Server Action de PAN-14. Adaptador delgado (ARCH §4): el negocio sale de la sesión
// con `requireEscritura` (D-14); la validación de la semana vive en el caso de uso.
// Recibe la semana como objeto, no como FormData: el caso de uso la valida igual.
// Se revalida todo el panel, porque el inicio cuenta las franjas (PAN-18).

export const guardarHorarioPanel = accion(async (entrada: { franjas: { dia: number; inicio: string; fin: string }[] }) => {
  const ctx = await requireEscritura();
  const resultado = await guardarHorarioSemanal(ctx, entrada);
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});
