import "server-only";
import { z } from "zod";
import { exito, fallo, type Fallo, type Resultado } from "@/dominio/resultado";
import { intervaloDeDias, localAUtc } from "@/dominio/tiempo";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as bloqueos from "@/servidor/db/repositorios/bloqueos";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as recursos from "@/servidor/db/repositorios/recursos";
import * as sedes from "@/servidor/db/repositorios/sedes";
import { esId, textoOpcional } from "./esquemas";

// Bloqueos puntuales de la sede principal (PAN-08, F-09; RN-07, D-15, Q-20; ARCH §11.3,
// §17.3 y §18.4). Las fechas y horas que elige el dueño son locales del negocio; aquí
// se convierten a instantes UTC (ARCH §9). La Server Action ya llamó a
// `requireEscritura`.

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type { Bloqueo, CitaQueImpide } from "@/servidor/db/repositorios/bloqueos";

const motivo = textoOpcional(200);

/** Tres tipos: unas horas de un día, un día completo o un rango de días (PAN-08). */
export const esquemaBloqueo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("hora"),
    fecha: z.iso.date(),
    horaInicio: z.iso.time({ precision: -1 }),
    horaFin: z.iso.time({ precision: -1 }),
    motivo,
  }),
  z.object({ tipo: z.literal("dia"), fecha: z.iso.date(), motivo }),
  z.object({ tipo: z.literal("rango"), desde: z.iso.date(), hasta: z.iso.date(), motivo }),
]);

export type EntradaBloqueo = z.input<typeof esquemaBloqueo>;

/** `BLOQUEO_CON_CITAS` trae las citas que lo impiden, para que el panel las liste (F-09). */
export type ErrorBloqueo =
  | Fallo<"DATOS_INVALIDOS">
  | (Fallo<"BLOQUEO_CON_CITAS"> & { citas: bloqueos.CitaQueImpide[] });

/** Intervalo UTC del bloqueo, o `null` si las fechas u horas no forman uno válido. */
function intervalo(datos: z.output<typeof esquemaBloqueo>, zona: string): bloqueos.Intervalo | null {
  try {
    if (datos.tipo === "hora") {
      const inicio = localAUtc(datos.fecha, datos.horaInicio, zona);
      const fin = localAUtc(datos.fecha, datos.horaFin, zona);
      return fin > inicio ? { inicio, fin } : null;
    }
    return datos.tipo === "dia"
      ? intervaloDeDias(datos.fecha, datos.fecha, zona)
      : intervaloDeDias(datos.desde, datos.hasta, zona);
  } catch {
    return null; // una fecha que no existe o un rango que termina antes de empezar
  }
}

/**
 * Crea un bloqueo de la sede principal, salvo que se solape con citas confirmadas que
 * aún no terminan (D-15). En una transacción: toma con `FOR UPDATE` los recursos de
 * la sede, ordenados por `id`, y DESPUÉS busca las citas, así una reserva no se cuela
 * entre la búsqueda y el `INSERT` (ARCH §11.3). Un bloqueo que ya terminó no tiene
 * efecto y devuelve `DATOS_INVALIDOS`.
 */
export async function crearBloqueo(
  ctx: Ctx,
  entrada: unknown,
  ahora: Date = new Date(),
): Promise<Resultado<{ id: string }, never> | ErrorBloqueo> {
  const leida = esquemaBloqueo.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");

  const [negocio, sede] = await Promise.all([negocios.resumen(ctx.negocioId), sedes.principal(ctx.negocioId)]);
  if (!negocio || !sede) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto o su sede principal.`);
  const rango = intervalo(leida.data, negocio.zonaHoraria);
  if (!rango || rango.fin <= ahora) return fallo("DATOS_INVALIDOS");

  return enTransaccion(async (tx): Promise<Resultado<{ id: string }, never> | ErrorBloqueo> => {
    // 1. Primero el bloqueo de fila de los recursos; 2. después, las citas (D-15).
    await recursos.bloquearDeSede(ctx.negocioId, sede.id, tx);
    const citas = await bloqueos.citasQueImpiden(ctx.negocioId, sede.id, rango, ahora, tx);
    if (citas.length > 0) return { ...fallo("BLOQUEO_CON_CITAS" as const), citas };
    // 3. Sin citas en el rango: el bloqueo queda con la sede principal y sin recurso (ARCH §17.3).
    const id = await bloqueos.crear(ctx.negocioId, { sedeId: sede.id, ...rango, motivo: leida.data.motivo }, tx);
    return exito({ id });
  });
}

/** Bloqueos vigentes y futuros, por inicio (PAN-08). Los que ya terminaron no se muestran. */
export async function listarBloqueos(ctx: Ctx, ahora: Date = new Date()): Promise<bloqueos.Bloqueo[]> {
  return bloqueos.vigentesDeLaPrincipal(ctx.negocioId, ahora);
}

/**
 * Elimina un bloqueo. Uno inexistente o de otro negocio responde igual: `NO_ENCONTRADO`
 * (ARCH §6). Eliminarlo no toma el bloqueo de los recursos: solo libera horas.
 */
export async function eliminarBloqueo(ctx: Ctx, id: unknown): Promise<Resultado<void, "NO_ENCONTRADO">> {
  if (!esId(id)) return fallo("NO_ENCONTRADO");
  return (await bloqueos.eliminar(ctx.negocioId, id)) ? exito(undefined) : fallo("NO_ENCONTRADO");
}
