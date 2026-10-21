"use server";

import { revalidatePath } from "next/cache";
import { accion } from "@/servidor/accion";
import { requireEscritura } from "@/servidor/auth/sesion";
import { guardarContactos, type EntradaContactos } from "@/servidor/casos-uso/contactos";
import { guardarNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { quitarLogo, subirLogo } from "@/servidor/casos-uso/logo-negocio";

// Server Actions de PAN-11. Adaptadores delgados (ARCH §4): el negocio sale de la
// sesión con `requireEscritura`, que con el negocio suspendido corta con
// NEGOCIO_SUSPENDIDO (D-14); el esquema y las reglas viven en los casos de uso.
// Al guardar se revalida todo el panel, porque el encabezado muestra el nombre.

export const guardarDatosNegocio = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await guardarNegocio(ctx, Object.fromEntries(datos));
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});

/** Los contactos (D-29): recibe la lista como objeto, no como FormData; el caso de uso la valida igual. */
export const guardarContactosNegocio = accion(async (entrada: EntradaContactos) => {
  const ctx = await requireEscritura();
  const resultado = await guardarContactos(ctx, entrada);
  if (resultado.ok) revalidatePath("/panel/configuracion/negocio");
  return resultado;
});

export const subirLogoNegocio = accion(async (datos: FormData) => {
  const ctx = await requireEscritura();
  const resultado = await subirLogo(ctx, datos.get("logo"));
  if (resultado.ok) revalidatePath("/panel", "layout");
  return resultado;
});

export const quitarLogoNegocio = accion(async () => {
  const ctx = await requireEscritura();
  const resultado = await quitarLogo(ctx);
  revalidatePath("/panel", "layout");
  return resultado;
});
