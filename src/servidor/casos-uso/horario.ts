import "server-only";
import { z } from "zod";
import { validarSemana, type DiaSemana, type FranjaValida } from "@/dominio/horario";
import { exito, fallo, type Fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as horarios from "@/servidor/db/repositorios/horarios";
import * as sedes from "@/servidor/db/repositorios/sedes";

// Horario semanal de la sede principal (PAN-14; RN-07, RN-32, Q-20; ARCH §17.3 y
// §18.4). Se guarda la semana completa en una transacción. Cambiarlo no toca las
// citas existentes: aplica a las reservas siguientes (Q-24). La Server Action ya
// llamó a `requireEscritura`.

type Ctx = Pick<ContextoMiembro, "negocioId">;

/** Tope por día, para no aceptar listas absurdas. */
const MAXIMO_FRANJAS_POR_DIA = 12;

export const esquemaSemana = z.object({
  franjas: z
    .array(z.object({ dia: z.coerce.number(), inicio: z.string(), fin: z.string() }))
    .max(7 * MAXIMO_FRANJAS_POR_DIA),
});

export type EntradaSemana = z.input<typeof esquemaSemana>;

/** `FRANJAS_SOLAPADAS` trae los días afectados, para marcar el error sobre cada uno. */
export type ErrorHorario = Fallo<"DATOS_INVALIDOS"> | (Fallo<"FRANJAS_SOLAPADAS"> & { dias: DiaSemana[] });

export async function leerHorarioSemanal(ctx: Ctx): Promise<FranjaValida[]> {
  return horarios.semanaPrincipal(ctx.negocioId);
}

/** Valida la semana (`validarSemana`) y reemplaza todas las franjas de la sede principal. */
export async function guardarHorarioSemanal(ctx: Ctx, entrada: unknown): Promise<Resultado<void, never> | ErrorHorario> {
  const leida = esquemaSemana.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const semana = validarSemana(leida.data.franjas);
  if (!semana.ok) {
    return semana.error.codigo === "FRANJAS_SOLAPADAS"
      ? { ...fallo("FRANJAS_SOLAPADAS" as const), dias: semana.error.dias }
      : fallo("DATOS_INVALIDOS");
  }

  await enTransaccion(async (tx) => {
    const sedeId = await sedes.bloquearPrincipal(ctx.negocioId, tx);
    if (!sedeId) throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene sede principal.`);
    await horarios.reemplazarSemana(ctx.negocioId, sedeId, semana.valor, tx);
  });
  return exito(undefined);
}
