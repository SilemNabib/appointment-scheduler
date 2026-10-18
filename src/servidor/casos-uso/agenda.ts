import "server-only";
import type { ContextoAgenda, Intervalo } from "@/dominio/disponibilidad";
import { db, type Conexion } from "@/servidor/db/cliente";
import * as agenda from "@/servidor/db/repositorios/agenda";
import * as configuracion from "@/servidor/db/repositorios/configuracion";

// Contexto del motor de disponibilidad (RN-09; ARCH §10 y §11.1). Lo arma una sola
// función para la consulta de disponibilidad (por HTTP) y para la reserva (dentro de
// su transacción, después de tomar el bloqueo del recurso). Como las dos evalúan el
// mismo contexto con el mismo motor, lo que no se ofrece tampoco se puede reservar.

export type { Oferta } from "@/servidor/db/repositorios/agenda";

export type PeticionAgenda = {
  /** El negocio ya resuelto (por el slug o por la sesión), con su zona (ARCH §9). */
  negocio: { id: string; zonaHoraria: string };
  sedeId: string;
  servicioId: string;
  /** El dueño está exento de la anticipación (D-11). */
  actor: ContextoAgenda["actor"];
  ahora: Date;
  /** Instantes que se van a evaluar: los bloqueos y la ocupación se leen solo para este rango. */
  rango: Intervalo;
  /** La cita que se reprograma o se mueve, que no ocupa su propio cupo (RN-14). */
  citaExcluida?: string | null;
};

/**
 * La oferta del servicio en la sede y el `ContextoAgenda` con que se evalúa, o `null` si
 * el servicio no se ofrece ahí (inactivo, de otro negocio o sin recurso activo). Primero
 * lee la oferta y las reglas de reserva; después, los bloqueos que aplican al recurso y
 * su ocupación en el rango (ARCH §11.2).
 */
export async function leerAgenda(
  p: PeticionAgenda,
  conexion: Conexion = db(),
): Promise<{ oferta: agenda.Oferta; contexto: ContextoAgenda } | null> {
  const [oferta, reglas] = await Promise.all([
    agenda.oferta(p.negocio.id, p.sedeId, p.servicioId, conexion),
    configuracion.leer(p.negocio.id, conexion),
  ]);
  if (!oferta) return null;
  if (!reglas) throw new Error(`El negocio ${p.negocio.id} no tiene configuración.`);

  const recurso = { sedeId: oferta.sedeId, recursoId: oferta.recurso.id };
  const [bloqueos, ocupacion] = await Promise.all([
    agenda.bloqueos(p.negocio.id, recurso, p.rango, conexion),
    agenda.ocupacion(p.negocio.id, oferta.recurso.id, p.rango, p.citaExcluida ?? null, conexion),
  ]);

  return {
    oferta,
    contexto: {
      zonaHoraria: p.negocio.zonaHoraria,
      ahora: p.ahora,
      servicio: { duracionMin: oferta.servicio.duracionMinutos, bufferMin: oferta.servicio.bufferMinutos },
      capacidad: oferta.recurso.capacidad,
      config: {
        granularidadMin: reglas.granularidadMinutos,
        anticipacionMinimaMin: reglas.anticipacionMinimaMinutos,
        anticipacionMaximaDias: reglas.anticipacionMaximaDias,
      },
      franjas: oferta.franjas,
      bloqueos,
      ocupacion,
      actor: p.actor,
    },
  };
}
