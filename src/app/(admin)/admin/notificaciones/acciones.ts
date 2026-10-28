"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { reintentarNotificacion } from "@/servidor/casos-uso/notificaciones-admin";

// Server Action de ADM-05 (Q-73). Primera línea: `requireSuperadmin`, que responde 404 a
// cualquier otro (ADR-07).

export const reintentarNotificacionAdmin = accion(async (notificacionId: string) => {
  const admin = await requireSuperadmin();
  const resultado = await reintentarNotificacion({ notificacionId }, admin, new Date());
  if (resultado.ok) revalidatePath("/admin/notificaciones");
  return resultado;
});
