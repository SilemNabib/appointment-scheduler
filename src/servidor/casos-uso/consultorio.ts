import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as recursos from "@/servidor/db/repositorios/recursos";

// Consultorio de la sede principal (PAN-13; RN-06, Q-20). La capacidad es cuántas
// citas puede atender a la vez. Reducirla no toca las citas existentes: la regla
// nueva aplica a las reservas siguientes (Q-24). La Server Action ya llamó a
// `requireEscritura`.

type Ctx = Pick<ContextoMiembro, "negocioId">;

export const esquemaConsultorio = z.object({
  nombre: z.string().trim().min(1).max(120),
  /** Entero ≥ 1 (RN-06; `CHECK` de `recurso`); el tope solo evita valores absurdos. */
  capacidad: z.coerce.number().int().min(1).max(999),
});

export type EntradaConsultorio = z.input<typeof esquemaConsultorio>;

export async function leerConsultorio(ctx: Ctx): Promise<recursos.Consultorio> {
  const consultorio = await recursos.consultorioPrincipal(ctx.negocioId);
  if (!consultorio) throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene consultorio principal.`);
  return consultorio;
}

export async function guardarConsultorio(ctx: Ctx, entrada: unknown): Promise<Resultado<void, "DATOS_INVALIDOS">> {
  const leida = esquemaConsultorio.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  if (!(await recursos.actualizarConsultorioPrincipal(ctx.negocioId, leida.data))) {
    throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene consultorio principal.`);
  }
  return exito(undefined);
}
