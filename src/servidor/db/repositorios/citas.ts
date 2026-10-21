import "server-only";
import { and, count, eq, gte, lt } from "drizzle-orm";
import type { Intervalo } from "@/dominio/disponibilidad";
import { db, type Conexion, type Transaccion } from "../cliente";
import { cita, eventoCita } from "../esquema";

// Citas (RN-10, RN-12, RN-17; ARCH §11 y §18.2). Toda función recibe `negocioId` y lo
// usa en el WHERE (ARCH §6, defensa 1). Las citas no se borran: cambian de estado.

/**
 * Citas creadas en el período (el mes calendario local, ARCH §9 regla 5), para el cupo
 * de `max_appointments_per_month` (ARCH §16.3). Cuentan todas, también las canceladas,
 * para que crear y cancelar no sirva para esquivar el límite (Q-29).
 */
export async function contarCreadas(negocioId: string, periodo: Intervalo, conexion: Conexion = db()): Promise<number> {
  const [{ total }] = await conexion
    .select({ total: count() })
    .from(cita)
    .where(and(eq(cita.negocioId, negocioId), gte(cita.creadoEn, periodo.inicio), lt(cita.creadoEn, periodo.fin)));
  return total;
}

export type NuevaCita = {
  /** Código de reserva (D-28; ARCH §11.4). */
  codigo: string;
  sedeId: string;
  servicioId: string;
  recursoId: string;
  clienteId: string;
  inicio: Date;
  /** `inicio` + duración. */
  fin: Date;
  /** `fin` + buffer (RN-10). */
  ocupadoHasta: Date;
  /** Instantánea del servicio y del cliente con que se reservó (RN-18.3, ADR-13). */
  servicioNombre: string;
  cliente: { nombre: string; apellido: string; telefono: string | null; correo: string | null };
  /** Consentimiento (RN-17): la versión de la política que vio el cliente y cuándo la aceptó. */
  politicaDatosId: string;
  politicaAceptadaEn: Date;
  /** Instante de creación: el `ahora` del caso de uso, que cuenta para el mes del límite (Q-29). */
  creadaEn: Date;
};

/**
 * Inserta una cita pública `confirmada` (RN-12) y su evento `creada`, con el cliente
 * como actor y sin datos personales (ARCH §18.2), dentro de la transacción de la
 * reserva. Devuelve el id de la cita.
 */
export async function crearPublica(negocioId: string, datos: NuevaCita, tx: Transaccion): Promise<string> {
  const [{ id }] = await tx
    .insert(cita)
    .values({
      negocioId,
      codigo: datos.codigo,
      sedeId: datos.sedeId,
      servicioId: datos.servicioId,
      recursoId: datos.recursoId,
      recursoElegido: false, // el cliente no elige quién atiende en el MVP (Q-30)
      clienteId: datos.clienteId,
      inicio: datos.inicio,
      fin: datos.fin,
      ocupadoHasta: datos.ocupadoHasta,
      estado: "confirmada",
      origen: "publico",
      servicioNombre: datos.servicioNombre,
      clienteNombre: datos.cliente.nombre,
      clienteApellido: datos.cliente.apellido,
      clienteTelefono: datos.cliente.telefono,
      clienteCorreo: datos.cliente.correo,
      politicaDatosId: datos.politicaDatosId,
      politicaAceptadaEn: datos.politicaAceptadaEn,
      creadoEn: datos.creadaEn,
    })
    .returning({ id: cita.id });
  await tx.insert(eventoCita).values({ negocioId, citaId: id, tipo: "creada", actor: "cliente" });
  return id;
}
