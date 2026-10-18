import type { ContextoAgenda, Intervalo } from "@/dominio/disponibilidad";
import type { FranjaValida } from "@/dominio/horario";
import { localAUtc } from "@/dominio/tiempo";

// Ayudantes de las pruebas del motor (ARCH §10, §20). Las horas se escriben en hora
// local de Bogotá (UTC−5), como las ve el negocio.

export const BOGOTA = "America/Bogota";

/** Instante de una fecha y hora locales de Bogotá. */
export const local = (fecha: string, hora: string) => localAUtc(fecha, hora, BOGOTA);

/** Intervalo `[desde, hasta)` de un mismo día local de Bogotá. */
export const intervalo = (fecha: string, desde: string, hasta: string): Intervalo => ({
  inicio: local(fecha, desde),
  fin: local(fecha, hasta),
});

/** Franja del horario semanal (día ISO: 1 = lunes … 7 = domingo). */
export const franja = (dia: FranjaValida["dia"], inicio: string, fin: string): FranjaValida => ({ dia, inicio, fin });

/**
 * Contexto de un servicio de 30 minutos sin buffer, capacidad 1, granularidad de 30,
 * sin anticipación mínima y con 60 días de máxima, para el cliente, sin franjas,
 * bloqueos ni ocupación. `ahora` es el 1-oct-2026 a las 7:00 a. m. Cada prueba cambia
 * lo que necesita.
 */
export function contexto(cambios: Partial<ContextoAgenda> = {}): ContextoAgenda {
  return {
    zonaHoraria: BOGOTA,
    ahora: local("2026-10-01", "07:00"),
    servicio: { duracionMin: 30, bufferMin: 0 },
    capacidad: 1,
    config: { granularidadMin: 30, anticipacionMinimaMin: 0, anticipacionMaximaDias: 60 },
    franjas: [],
    bloqueos: [],
    ocupacion: [],
    actor: "cliente",
    ...cambios,
  };
}
