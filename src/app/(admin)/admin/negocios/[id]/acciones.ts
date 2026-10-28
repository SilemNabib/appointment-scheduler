"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireSuperadmin } from "@/servidor/auth/sesion";
import { reenviarInvitacion } from "@/servidor/casos-uso/invitacion-admin";
import { cambiarFinPrueba, registrarPago, suspenderNegocio } from "@/servidor/casos-uso/suscripcion-admin";

// Server Actions de ADM-03 y "Reenviar invitación" (T6.33). Adaptadores delgados (ARCH §4): cada una empieza con
// `requireSuperadmin`, que responde 404 a cualquier otro; el admin elige el negocio
// (ARCH §6, "Admin: explícito"). Las reglas y la auditoría viven en los casos de uso.
// Se revalida todo /admin, porque la lista muestra el estado de cada negocio.

export const registrarPagoAdmin = accion(async (datos: FormData) => {
  const admin = await requireSuperadmin();
  const resultado = await registrarPago(Object.fromEntries(datos), admin);
  if (resultado.ok) revalidatePath("/admin", "layout");
  return resultado;
});

export const cambiarFinPruebaAdmin = accion(async (datos: FormData) => {
  const admin = await requireSuperadmin();
  const resultado = await cambiarFinPrueba(Object.fromEntries(datos), admin);
  if (resultado.ok) revalidatePath("/admin", "layout");
  return resultado;
});

export const suspenderNegocioAdmin = accion(async (negocioId: string) => {
  const admin = await requireSuperadmin();
  const resultado = await suspenderNegocio({ negocioId }, admin);
  if (resultado.ok) revalidatePath("/admin", "layout");
  return resultado;
});

// No cambia nada en la base de datos: no revalida.
export const reenviarInvitacionAdmin = accion(async (negocioId: string) => {
  const admin = await requireSuperadmin();
  return reenviarInvitacion({ negocioId }, admin);
});
