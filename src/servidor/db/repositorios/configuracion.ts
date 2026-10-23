import "server-only";
import { eq } from "drizzle-orm";
import { db, type Conexion } from "../cliente";
import { configuracionNegocio } from "../esquema";

// Configuración de reservas y de operación del negocio (PAN-15, PAN-16; ARCH §18.2).
// Una fila por negocio, creada en el alta con los valores de D-09. Toda función recibe
// `negocioId` y lo usa en el WHERE (ARCH §6, defensa 1).

export type ReglasReserva = {
  granularidadMinutos: 15 | 30 | 60;
  anticipacionMinimaMinutos: number;
  anticipacionMaximaDias: number;
  plazoCancelacionHoras: number;
  /** `null` = sin límite; 0 = no se permite reprogramar (RN-34). */
  maxReprogramacionesCliente: number | null;
  /** `manual` = "siempre decido yo" (D-21). */
  asistenciaPorDefecto: "completada" | "no_asistio" | "manual";
};

export type Configuracion = ReglasReserva & {
  /** `null` = sin recordatorio (RN-21). */
  recordatorioHorasAntes: number | null;
};

/** La configuración del negocio, por HTTP o dentro de una transacción (la reserva la lee después del bloqueo, ARCH §11.2). */
export async function leer(negocioId: string, conexion: Conexion = db()): Promise<Configuracion | null> {
  const [fila] = await conexion
    .select({
      granularidadMinutos: configuracionNegocio.granularidadMinutos,
      anticipacionMinimaMinutos: configuracionNegocio.anticipacionMinimaMinutos,
      anticipacionMaximaDias: configuracionNegocio.anticipacionMaximaDias,
      plazoCancelacionHoras: configuracionNegocio.plazoCancelacionHoras,
      maxReprogramacionesCliente: configuracionNegocio.maxReprogramacionesCliente,
      asistenciaPorDefecto: configuracionNegocio.asistenciaPorDefecto,
      recordatorioHorasAntes: configuracionNegocio.recordatorioHorasAntes,
    })
    .from(configuracionNegocio)
    .where(eq(configuracionNegocio.negocioId, negocioId));
  // Los `CHECK` de la tabla garantizan los valores de las uniones.
  return (fila as Configuracion | undefined) ?? null;
}

/** Cambia las reglas de reserva (PAN-15). Devuelve si encontró la fila. */
export async function actualizarReglas(negocioId: string, reglas: ReglasReserva): Promise<boolean> {
  const filas = await db()
    .update(configuracionNegocio)
    .set(reglas)
    .where(eq(configuracionNegocio.negocioId, negocioId))
    .returning({ negocioId: configuracionNegocio.negocioId });
  return filas.length > 0;
}

/** Cambia el momento del recordatorio (PAN-16). Devuelve si encontró la fila. */
export async function actualizarRecordatorio(negocioId: string, horasAntes: number | null, conexion: Conexion = db()): Promise<boolean> {
  const filas = await conexion
    .update(configuracionNegocio)
    .set({ recordatorioHorasAntes: horasAntes })
    .where(eq(configuracionNegocio.negocioId, negocioId))
    .returning({ negocioId: configuracionNegocio.negocioId });
  return filas.length > 0;
}
