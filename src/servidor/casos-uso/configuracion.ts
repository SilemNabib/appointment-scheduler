import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as configuracion from "@/servidor/db/repositorios/configuracion";

// Reglas de reserva y recordatorio (PAN-15, PAN-16; RN-08, RN-09, RN-13, RN-16, RN-21,
// RN-34; D-09, D-20, D-21). Los rangos son los de los `CHECK` de
// `configuracion_negocio` (ARCH §18.2), más un tope para no aceptar valores absurdos.
// Cambiar una regla solo afecta a las reservas siguientes (Q-24). Cambiar el
// recordatorio no recalcula los ya programados: eso llega en la Fase 6 (Q-23). La
// Server Action ya llamó a `requireEscritura`.

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type { Configuracion } from "@/servidor/db/repositorios/configuracion";

/** Un año, en la unidad de cada campo. */
const UN_ANIO = { minutos: 365 * 24 * 60, horas: 365 * 24 };

/** Entero de un formulario. Vacío no es 0: es un dato que falta. */
const entero = (minimo: number, maximo: number) =>
  z.preprocess((valor) => (valor === "" ? undefined : valor), z.coerce.number().int().min(minimo).max(maximo));

export const esquemaReglas = z.object({
  /** Solo 15, 30 o 60 (RN-08). */
  granularidadMinutos: z.coerce.number().pipe(z.union([z.literal(15), z.literal(30), z.literal(60)])),
  anticipacionMinimaMinutos: entero(0, UN_ANIO.minutos),
  anticipacionMaximaDias: entero(1, 365),
  plazoCancelacionHoras: entero(0, UN_ANIO.horas),
  /** Vacío = sin límite (`NULL`); 0 = no se permite reprogramar (RN-34, D-20). */
  maxReprogramacionesCliente: z.preprocess(
    (valor) => (valor === "" || valor === undefined || valor === null ? null : valor),
    entero(0, 99).nullable(),
  ),
  asistenciaPorDefecto: z.enum(["completada", "no_asistio", "manual"]),
});

export type EntradaReglas = z.input<typeof esquemaReglas>;

export const esquemaRecordatorio = z.object({
  /** "ninguno" = sin recordatorio (`NULL`); si no, horas antes de la cita, al menos 1 (RN-21). */
  recordatorio: z.union([z.literal("ninguno").transform(() => null), entero(1, UN_ANIO.horas)]),
});

export async function leerConfiguracion(ctx: Ctx): Promise<configuracion.Configuracion> {
  const fila = await configuracion.leer(ctx.negocioId);
  if (!fila) throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene configuración.`);
  return fila;
}

export async function guardarReglasReserva(ctx: Ctx, entrada: unknown): Promise<Resultado<void, "DATOS_INVALIDOS">> {
  const leida = esquemaReglas.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  if (!(await configuracion.actualizarReglas(ctx.negocioId, leida.data))) {
    throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene configuración.`);
  }
  return exito(undefined);
}

export async function guardarRecordatorio(ctx: Ctx, entrada: unknown): Promise<Resultado<void, "DATOS_INVALIDOS">> {
  const leida = esquemaRecordatorio.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  if (!(await configuracion.actualizarRecordatorio(ctx.negocioId, leida.data.recordatorio))) {
    throw new Error(`El negocio ${ctx.negocioId} del contexto no tiene configuración.`);
  }
  return exito(undefined);
}
