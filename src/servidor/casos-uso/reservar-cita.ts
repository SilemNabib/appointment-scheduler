import "server-only";
import { z } from "zod";
import { normalizarCorreo, normalizarTelefono, type DatosIdentidad } from "@/dominio/identidad-cliente";
import { ErrorNegocio, exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { mesLocal } from "@/dominio/tiempo";
import * as agenda from "@/servidor/db/repositorios/agenda";
import * as citas from "@/servidor/db/repositorios/citas";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as politicas from "@/servidor/db/repositorios/politicas";
import { exigirCupo } from "@/servidor/planes/acceso";
import { esId } from "./esquemas";

// Reserva pública (PUB-05, F-01; RN-09 a RN-12, RN-17, RN-18; ARCH §11 y §18.4). El
// negocio sale del slug (ARCH §6) y se comprueba su estado efectivo antes de hacer
// nada (ARCH §7.6). Este módulo tiene dos partes: las precondiciones, fuera de la
// transacción, y la transacción con el bloqueo del recurso.

/** El cuerpo de `POST /api/publico/{slug}/reservas` (ARCH §18.5), con el slug de la URL. */
export const esquemaReserva = z.object({
  slug: z.string(),
  sedeId: z.string().min(1),
  servicioId: z.string().min(1),
  /** RN-33. En el MVP siempre se omite; vacío = omitido. */
  recursoId: z
    .string()
    .nullish()
    .transform((id) => id || null),
  /** ISO 8601 UTC (ARCH §9, regla 4). */
  inicio: z.iso.datetime(),
  // Los cuatro datos de RN-17.
  nombre: z.string().trim().min(1).max(100),
  apellido: z.string().trim().min(1).max(100),
  telefono: z.string().max(40),
  correo: z.string().trim().max(254).pipe(z.email()),
  /** La versión de la política que vio el cliente (F-01). */
  politicaDatosId: z.string().min(1),
  /** La casilla obligatoria de PUB-05 (RN-17). */
  aceptaPolitica: z.literal(true),
  /** Trampa para bots: el formulario lo lleva oculto y debe llegar vacío (ARCH §15). */
  sitioWeb: z.literal("").optional(),
});

export type EntradaReserva = z.input<typeof esquemaReserva>;

export type ErrorReserva =
  | "DATOS_INVALIDOS"
  | "NO_ENCONTRADO"
  | "NEGOCIO_SUSPENDIDO"
  | "HORARIO_NO_DISPONIBLE"
  | "LIMITE_PLAN";

/** Lo que la transacción necesita, ya validado. */
export type ReservaPreparada = {
  negocio: negocios.NegocioPublico;
  sedeId: string;
  servicioId: string;
  /** El recurso de la oferta, cuyo bloqueo toma la transacción (ARCH §10.3). */
  recursoId: string;
  inicio: Date;
  /** Datos del cliente normalizados (RN-18). */
  cliente: DatosIdentidad;
  politicaDatosId: string;
};

/**
 * La parte de la reserva que va antes de la transacción (ARCH §18.4):
 *
 * 1. valida el cuerpo con Zod: los cuatro datos, un teléfono normalizable, la casilla
 *    marcada y `sitioWeb` vacío (RN-17; ARCH §15). Si algo falla devuelve
 *    `DATOS_INVALIDOS` sin tocar la base;
 * 2. resuelve el negocio por el slug y rechaza uno suspendido (RN-04);
 * 3. comprueba la oferta (servicio, sede y recurso activos) y que la política sea del
 *    negocio: si no, `NO_ENCONTRADO` (ARCH §6). También con cualquier `recursoId`, porque
 *    ningún servicio del MVP deja elegir quién atiende (Q-30);
 * 4. exige cupo de `max_appointments_per_month`: cuentan todas las citas creadas en el
 *    mes calendario local de `ahora`, también las canceladas (Q-29; RN-25).
 */
export async function prepararReserva(
  entrada: unknown,
  ahora: Date,
): Promise<Resultado<ReservaPreparada, ErrorReserva>> {
  const leida = esquemaReserva.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const datos = leida.data;
  const telefonoE164 = normalizarTelefono(datos.telefono);
  if (!telefonoE164) return fallo("DATOS_INVALIDOS");

  const negocio = await negocios.porSlug(datos.slug);
  if (!negocio) return fallo("NO_ENCONTRADO");
  if (estadoEfectivo(negocio, ahora).estado === "suspendida") return fallo("NEGOCIO_SUSPENDIDO");
  if (datos.recursoId !== null || ![datos.sedeId, datos.servicioId, datos.politicaDatosId].every(esId)) {
    return fallo("NO_ENCONTRADO");
  }

  const [oferta, politicaValida] = await Promise.all([
    agenda.oferta(negocio.id, datos.sedeId, datos.servicioId),
    politicas.esDelNegocio(negocio.id, datos.politicaDatosId),
  ]);
  if (!oferta || !politicaValida) return fallo("NO_ENCONTRADO");

  try {
    const creadasEsteMes = await citas.contarCreadas(negocio.id, mesLocal(ahora, negocio.zonaHoraria));
    await exigirCupo(negocio.id, "max_appointments_per_month", creadasEsteMes);
  } catch (error) {
    if (error instanceof ErrorNegocio && error.codigo === "LIMITE_PLAN") return fallo("LIMITE_PLAN");
    throw error;
  }

  return exito({
    negocio,
    sedeId: datos.sedeId,
    servicioId: datos.servicioId,
    recursoId: oferta.recurso.id,
    inicio: new Date(datos.inicio),
    cliente: {
      nombre: datos.nombre,
      apellido: datos.apellido,
      telefonoE164,
      correo: normalizarCorreo(datos.correo),
    },
    politicaDatosId: datos.politicaDatosId,
  });
}
