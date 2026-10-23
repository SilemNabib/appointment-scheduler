import "server-only";
import { z } from "zod";
import type { EstadoCita } from "@/dominio/estados-cita";
import { accionesDelCliente, type AccionesCliente } from "@/dominio/plazos";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo, type DatosSuscripcion } from "@/dominio/suscripcion";
import * as citas from "@/servidor/db/repositorios/citas";
import * as configuracion from "@/servidor/db/repositorios/configuracion";
import * as contactos from "@/servidor/db/repositorios/contactos";
import * as horarios from "@/servidor/db/repositorios/horarios";
import * as negocios from "@/servidor/db/repositorios/negocios";
import type { ReglasReserva } from "@/servidor/db/repositorios/configuracion";
import { verificarTokenDeGestion } from "@/servidor/gestion-cita/firma";
import { horasLibres, rangoValido, type Disponibilidad } from "./disponibilidad";
import { esId } from "./esquemas";
import type { MarcaPagina, SedePagina } from "./pagina-publica";

// Gestión de la cita por el link del correo (GES-01 a GES-05; RN-01, RN-13, RN-24, RN-34,
// D-14, D-29; ARCH §6 y §13; Q-69). El link lleva el slug, el id de la cita y el token
// firmado: si alguno no corresponde, la respuesta es `NO_ENCONTRADO`, igual que una cita
// inexistente, sin decir cuál falló (ARCH §6, defensa 3). Lo que el cliente puede hacer lo
// decide `accionesDelCliente` (T6.03), la misma función que aplican las operaciones.

export type EntradaLink = { slug: unknown; citaId: unknown; token: unknown };

/** Lo que responden cancelar y reprogramar por el link (ARCH §18.5; Q-69). */
export type CitaGestionada = {
  citaId: string;
  estado: EstadoCita;
  /** ISO 8601 UTC. */
  inicio: string;
  fin: string;
  /** `null` si el negocio no tiene límite (RN-34). */
  reprogramacionesRestantes: number | null;
};

/** La cita del link con el negocio y la sede que la atiende, y sus reglas para el cliente. */
export type CitaVerificada = {
  negocio: NonNullable<Awaited<ReturnType<typeof negocios.paginaPorSlug>>>;
  cita: citas.CitaDeGestion;
  reglas: ReglasReserva;
};

/**
 * Verifica el link (ARCH §13): el slug es el del negocio de la cita y el token es el de
 * su `token_version`, firmado con el secreto actual o el anterior. Solo lee.
 */
export async function verificarLink(e: EntradaLink): Promise<CitaVerificada | null> {
  if (typeof e.slug !== "string" || typeof e.token !== "string" || !esId(e.citaId)) return null;
  const negocio = await negocios.paginaPorSlug(e.slug);
  if (!negocio) return null;
  const [cita, reglas] = await Promise.all([citas.deGestion(negocio.id, e.citaId), configuracion.leer(negocio.id)]);
  if (!cita || !reglas) return null;
  if (!(await verificarTokenDeGestion({ id: cita.id, tokenVersion: cita.tokenVersion }, e.token))) return null;
  return { negocio, cita, reglas };
}

/** Las acciones que el cliente puede hacer con la cita ahora (T6.03). */
export function accionesDe(v: Pick<CitaVerificada, "cita" | "reglas"> & { negocio: DatosSuscripcion }, ahora: Date): AccionesCliente {
  return accionesDelCliente(v.cita, v.reglas, estadoEfectivo(v.negocio, ahora), ahora);
}

export type CitaPorLink = {
  /** Para el encabezado del negocio (T4.18). */
  marca: MarcaPagina;
  /** La sede de la cita, con sus contactos (D-29) y su horario. */
  sede: SedePagina;
  cita: Pick<citas.CitaDeGestion, "id" | "codigo" | "servicio" | "inicio" | "fin" | "estado" | "direccion">;
  /** Qué puede hacer el cliente y, si no, por qué (Q-69, Q-70). */
  acciones: AccionesCliente;
  /** `max_reprogramaciones_cliente`: `null` sin límite (RN-34; "Te quedan X de Y"). */
  limiteReprogramaciones: number | null;
};

/**
 * Lo que muestra GES-01: el negocio y su sede con los contactos, la cita (código,
 * servicio, horas, dirección y estado) y las acciones que permite con su motivo y las
 * reprogramaciones que le quedan. Nunca los datos de contacto del cliente (RN-24). Solo
 * lee, así que funciona con el negocio suspendido, sin acciones (GES-05, D-14).
 */
export async function verCitaPorLink(e: EntradaLink, ahora: Date): Promise<Resultado<CitaPorLink, "NO_ENCONTRADO">> {
  const v = await verificarLink(e);
  if (!v) return fallo("NO_ENCONTRADO");
  const { negocio, cita, reglas } = v;
  const [listaContactos, franjas] = await Promise.all([
    contactos.deSede(negocio.id, cita.sedeId),
    horarios.semanaDe(negocio.id, cita.sedeId),
  ]);
  return exito({
    marca: {
      nombre: negocio.nombre,
      slug: negocio.slug,
      logoUrl: negocio.logoUrl,
      colorPrimario: negocio.colorPrimario,
      colorSecundario: negocio.colorSecundario,
      rubro: negocio.rubro,
      eslogan: negocio.eslogan,
      fraseBanner: negocio.fraseBanner,
      descripcion: negocio.descripcion,
      zonaHoraria: negocio.zonaHoraria,
    },
    sede: { id: cita.sedeId, direccion: cita.direccion, contactos: listaContactos, franjas },
    cita: {
      id: cita.id,
      codigo: cita.codigo,
      servicio: cita.servicio,
      inicio: cita.inicio,
      fin: cita.fin,
      estado: cita.estado,
      direccion: cita.direccion,
    },
    acciones: accionesDe(v, ahora),
    limiteReprogramaciones: reglas.maxReprogramacionesCliente,
  });
}

const esquemaRango = z.object({ desde: z.iso.date(), hasta: z.iso.date() });

export type ErrorDisponibilidadGestion =
  | "NO_ENCONTRADO"
  | "DATOS_INVALIDOS"
  | "NEGOCIO_SUSPENDIDO"
  | "FUERA_DE_PLAZO"
  | "LIMITE_REPROGRAMACIONES"
  | "ESTADO_INVALIDO";

/** El error con que se rechaza reprogramar (T6.03), entre los de esta consulta (ARCH §18.4). */
function errorDeReprogramar(error: string): ErrorDisponibilidadGestion {
  return error === "NEGOCIO_SUSPENDIDO" || error === "FUERA_DE_PLAZO" || error === "LIMITE_REPROGRAMACIONES"
    ? error
    : "ESTADO_INVALIDO";
}

/**
 * Las horas libres para reprogramar la cita del link (GES-03, F-03; Q-69): las del
 * servicio y la sede de la cita, con las reglas de la consulta pública (actor `cliente`;
 * hasta 31 días, recortados a hoy y a la anticipación máxima, Q-32) y sin contar la
 * propia cita, así su hora y las que se solapan con ella aparecen libres (RN-14). Si la
 * cita no admite reprogramar (T6.03), devuelve ese error. Responde como `GET
 * …/disponibilidad` (ARCH §18.5). Solo lee.
 */
export async function consultarDisponibilidadGestion(
  e: EntradaLink & { desde: unknown; hasta: unknown },
  ahora: Date,
): Promise<Resultado<Disponibilidad, ErrorDisponibilidadGestion>> {
  const v = await verificarLink(e);
  if (!v) return fallo("NO_ENCONTRADO");
  const rango = esquemaRango.safeParse({ desde: e.desde, hasta: e.hasta });
  if (!rango.success || !rangoValido(rango.data.desde, rango.data.hasta)) return fallo("DATOS_INVALIDOS");
  const { reprogramar } = accionesDe(v, ahora);
  if (!reprogramar.permitida) return fallo(errorDeReprogramar(reprogramar.error));

  const horas = await horasLibres(
    {
      negocio: v.negocio,
      sedeId: v.cita.sedeId,
      servicioId: v.cita.servicioId,
      desde: rango.data.desde,
      hasta: rango.data.hasta,
      citaExcluida: v.cita.id,
    },
    ahora,
  );
  return horas ? exito(horas) : fallo("NO_ENCONTRADO");
}
