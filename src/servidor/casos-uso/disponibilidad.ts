import "server-only";
import { z } from "zod";
import { iniciosDisponibles } from "@/dominio/disponibilidad";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { fechaLocal, fechasDelRango, intervaloDeDias, sumarDias, type FechaLocal } from "@/dominio/tiempo";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { leerAgenda } from "./agenda";
import { esId } from "./esquemas";

// Consulta pública de disponibilidad (PUB-03, PUB-04; RN-09; ARCH §18.5). El negocio
// sale del slug (ARCH §6) y se comprueba su estado efectivo antes de hacer nada (ARCH
// §7.6). Las horas salen del mismo motor y del mismo contexto que valida la reserva.

/** Rango máximo de una consulta, en días (ARCH §18.5). */
export const MAXIMO_DIAS_CONSULTA = 31;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Los parámetros de la URL: todos llegan como texto. */
export const esquemaConsulta = z.object({
  slug: z.string(),
  sedeId: z.string().min(1),
  servicioId: z.string().min(1),
  /** RN-33. En el MVP siempre se omite; vacío = omitido. */
  recursoId: z
    .string()
    .nullish()
    .transform((id) => id || null),
  desde: z.iso.date(),
  hasta: z.iso.date(),
});

export type EntradaConsulta = z.input<typeof esquemaConsulta>;

/** Respuesta de ARCH §18.5: un día por fecha local, con los inicios en ISO 8601 UTC. */
export type Disponibilidad = {
  zonaHoraria: string;
  dias: { fecha: FechaLocal; inicios: string[] }[];
};

export type ErrorConsulta = "DATOS_INVALIDOS" | "NO_ENCONTRADO" | "NEGOCIO_SUSPENDIDO";

/**
 * Horas reservables de un servicio en una sede, entre dos fechas locales (ambas
 * inclusive, hasta 31 días).
 *
 * - Un slug, una sede o un servicio inexistentes, de otro negocio o que no se ofrecen
 *   ahí devuelven `NO_ENCONTRADO`, igual que cualquier `recursoId`: ningún servicio del
 *   MVP deja elegir quién atiende (Q-30).
 * - Un negocio suspendido devuelve `NEGOCIO_SUSPENDIDO`; en la gracia todo funciona (PUB-07).
 * - El rango se recorta (Q-32): los días van desde el más tardío entre `desde` y hoy hasta
 *   el más temprano entre `hasta` y la fecha local de `ahora` más la anticipación
 *   máxima. Los días fuera de ese recorte se omiten; un día sin cupo trae `inicios: []`.
 */
export async function consultarDisponibilidad(
  entrada: unknown,
  ahora: Date,
): Promise<Resultado<Disponibilidad, ErrorConsulta>> {
  const leida = esquemaConsulta.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { slug, sedeId, servicioId, recursoId, desde, hasta } = leida.data;
  // Q-33: un rango que termina antes de empezar o que pasa de 31 días.
  if (hasta < desde || sumarDias(desde, MAXIMO_DIAS_CONSULTA - 1) < hasta) return fallo("DATOS_INVALIDOS");

  const negocio = await negocios.porSlug(slug);
  if (!negocio) return fallo("NO_ENCONTRADO");
  if (estadoEfectivo(negocio, ahora).estado === "suspendida") return fallo("NEGOCIO_SUSPENDIDO");
  if (recursoId !== null || !esId(sedeId) || !esId(servicioId)) return fallo("NO_ENCONTRADO");

  const leidaAgenda = await leerAgenda({
    negocio,
    sedeId,
    servicioId,
    actor: "cliente",
    ahora,
    rango: intervaloDeDias(desde, hasta, negocio.zonaHoraria),
  });
  if (!leidaAgenda) return fallo("NO_ENCONTRADO");
  const { contexto } = leidaAgenda;

  const zona = negocio.zonaHoraria;
  const hoy = fechaLocal(ahora, zona);
  const ultimoReservable = fechaLocal(new Date(ahora.getTime() + contexto.config.anticipacionMaximaDias * MS_POR_DIA), zona);
  const primero = desde > hoy ? desde : hoy;
  const ultimo = hasta < ultimoReservable ? hasta : ultimoReservable;
  if (ultimo < primero) return exito({ zonaHoraria: zona, dias: [] });

  const porFecha = new Map<FechaLocal, string[]>(fechasDelRango(primero, ultimo).map((fecha) => [fecha, []]));
  for (const inicio of iniciosDisponibles(contexto, primero, ultimo)) {
    porFecha.get(fechaLocal(inicio, zona))?.push(inicio.toISOString());
  }
  return exito({ zonaHoraria: zona, dias: [...porFecha].map(([fecha, inicios]) => ({ fecha, inicios })) });
}
