import "server-only";
import { z } from "zod";
import { iniciosDisponibles } from "@/dominio/disponibilidad";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { intervaloDeDias, type FechaLocal } from "@/dominio/tiempo";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { leerAgenda } from "./agenda";
import { negocioDelPanel } from "./agendar";
import { esId } from "./esquemas";

// Horas libres para el dueño (PAN-04, PAN-05, F-06, F-07; RN-09, RN-14, RN-15, D-11;
// ARCH §10 y §18.4; Q-56). Salen de la misma `leerAgenda` y del mismo motor que la
// consulta pública y que la transacción que agenda, con actor `dueno`: sin anticipación
// mínima ni máxima, y solo desde `ahora`. Así el panel ofrece exactamente lo que el
// servidor después acepta (D-01). Solo lee: funciona con el negocio suspendido (D-14).

type Ctx = Pick<ContextoMiembro, "negocioId">;

export const esquemaHorasDueno = z.object({
  servicioId: z.string(),
  /** Un día local por consulta (Q-56). */
  fecha: z.iso.date(),
  /** La cita que se mueve, que no ocupa su propio cupo (RN-14). Vacío u omitido = ninguna. */
  citaExcluida: z
    .string()
    .nullish()
    .transform((id) => id || null),
});

export type EntradaHorasDueno = z.input<typeof esquemaHorasDueno>;

/** Los inicios libres del día, en ISO 8601 UTC, con la zona en que se muestran (ARCH §9). */
export type HorasDueno = { zonaHoraria: string; fecha: FechaLocal; inicios: string[] };

/**
 * Las horas libres de un servicio activo en un día local, en la sede principal (Q-56).
 * Nunca ofrece una hora fuera del horario, bloqueada, sin cupo ni anterior a `ahora`
 * (D-11, RN-15). Con `citaExcluida`, esa cita no ocupa su cupo, así vuelven su hora y
 * las que se solapan con ella (RN-14). Un servicio inactivo, de otro negocio o un id que
 * no es un uuid devuelven `NO_ENCONTRADO` (RN-05, RN-01); una fecha inválida,
 * `DATOS_INVALIDOS`.
 */
export async function consultarHorasDueno(
  ctx: Ctx,
  entrada: unknown,
  ahora: Date,
): Promise<Resultado<HorasDueno, "NO_ENCONTRADO" | "DATOS_INVALIDOS">> {
  const leida = esquemaHorasDueno.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { servicioId, fecha, citaExcluida } = leida.data;
  if (!esId(servicioId) || (citaExcluida !== null && !esId(citaExcluida))) return fallo("NO_ENCONTRADO");

  const { negocio, sedeId } = await negocioDelPanel(ctx.negocioId);
  const agenda = await leerAgenda({
    negocio,
    sedeId,
    servicioId,
    actor: "dueno",
    ahora,
    rango: intervaloDeDias(fecha, fecha, negocio.zonaHoraria),
    citaExcluida,
  });
  if (!agenda) return fallo("NO_ENCONTRADO");

  const inicios = iniciosDisponibles(agenda.contexto, fecha, fecha).map((inicio) => inicio.toISOString());
  return exito({ zonaHoraria: negocio.zonaHoraria, fecha, inicios });
}
