import "server-only";
import { z } from "zod";
import { MAXIMO_CONTACTOS, validarContactos, type Contacto, type ErrorContactos } from "@/dominio/contactos";
import { exito, fallo, type Fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as contactos from "@/servidor/db/repositorios/contactos";
import * as sedes from "@/servidor/db/repositorios/sedes";

// Contactos del negocio (PAN-11; D-29, Q-40): los de la sede principal (Q-20), aunque el
// panel los muestre como del negocio (RN-32). Se guarda la lista completa en una
// transacción, en el orden recibido. La Server Action ya llamó a `requireEscritura`.
// Zod valida la forma; las reglas (normalización, máximo y qué contacto falla) son de
// `dominio/contactos.ts`, como en el horario.

type Ctx = Pick<ContextoMiembro, "negocioId">;

export const esquemaContactos = z.object({
  // El máximo real lo decide el dominio, que responde "demasiados"; este tope solo
  // descarta listas absurdas antes de recorrerlas.
  contactos: z
    .array(z.object({ tipo: z.string(), valor: z.string(), etiqueta: z.string().nullish() }))
    .max(MAXIMO_CONTACTOS * 4),
});

export type EntradaContactos = z.input<typeof esquemaContactos>;

/** `DATOS_INVALIDOS` trae qué contacto falló, para marcar el error junto a él (T4.10). */
export type ErrorGuardarContactos = Fallo<"DATOS_INVALIDOS"> & { contacto?: ErrorContactos };

export async function listarContactos(ctx: Ctx): Promise<Contacto[]> {
  return contactos.dePrincipal(ctx.negocioId);
}

/** Valida la lista y reemplaza los contactos de la sede principal. Si falla, no cambia nada. */
export async function guardarContactos(ctx: Ctx, entrada: unknown): Promise<Resultado<void, never> | ErrorGuardarContactos> {
  const leida = esquemaContactos.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const validos = validarContactos(leida.data.contactos);
  if (!validos.ok) return { ...fallo("DATOS_INVALIDOS" as const), contacto: validos.error };

  await enTransaccion(async (tx) => {
    const sedeId = await sedes.bloquearPrincipal(ctx.negocioId, tx);
    if (!sedeId) throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene sede principal.`);
    await contactos.reemplazar(ctx.negocioId, sedeId, validos.valor, tx);
  });
  return exito(undefined);
}
