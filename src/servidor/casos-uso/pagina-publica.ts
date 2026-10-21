import "server-only";
import type { Contacto } from "@/dominio/contactos";
import type { FranjaValida } from "@/dominio/horario";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { fechaLocal, sumarDias, type FechaLocal } from "@/dominio/tiempo";
import * as configuracion from "@/servidor/db/repositorios/configuracion";
import * as contactos from "@/servidor/db/repositorios/contactos";
import * as horarios from "@/servidor/db/repositorios/horarios";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as politicas from "@/servidor/db/repositorios/politicas";
import * as sedes from "@/servidor/db/repositorios/sedes";
import * as servicios from "@/servidor/db/repositorios/servicios";

// Lo que la página pública `/{slug}` necesita, en una lectura (PUB-01, PUB-02, PUB-07,
// F-05; ARCH §4, §5). El negocio sale del slug (ARCH §6). Con una sola sede activa, la
// página usa la sede principal y nunca habla de sedes (Q-20; RN-32). Nunca incluye
// datos del dueño.

export type { ServicioOfrecido } from "@/servidor/db/repositorios/servicios";

/** La marca del negocio (PUB-01; D-27) y su zona horaria (RN-03). */
export type MarcaPagina = {
  nombre: string;
  slug: string;
  logoUrl: string | null;
  colorPrimario: string;
  colorSecundario: string | null;
  rubro: string | null;
  eslogan: string | null;
  fraseBanner: string | null;
  descripcion: string | null;
  zonaHoraria: string;
};

/** La sede principal, sin su nombre: la página no la presenta como sede (RN-32). */
export type SedePagina = {
  id: string;
  direccion: string | null;
  contactos: Contacto[];
  franjas: FranjaValida[];
};

/**
 * `abierta`: se puede reservar. `sin_horarios`: no hay un servicio activo o una franja
 * (F-05, paso 4). `suspendida`: según el estado efectivo (RN-04; en gracia, abierta).
 */
export type EstadoPagina = "abierta" | "suspendida" | "sin_horarios";

export type PaginaPublica =
  | { estado: "suspendida"; marca: MarcaPagina; sede: SedePagina }
  | {
      estado: "abierta" | "sin_horarios";
      marca: MarcaPagina;
      sede: SedePagina;
      /** Los servicios activos que ofrece la sede, en orden, con la duración de la sede (RN-32). */
      servicios: servicios.ServicioOfrecido[];
      /** La versión vigente de la política, que la casilla de PUB-05 enlaza (Q-45). */
      politica: { id: string; version: number };
      /** Hoy y el último día reservable, en fecha local (`ahora` más la anticipación máxima). */
      hoy: FechaLocal;
      ultimoDia: FechaLocal;
    };

/**
 * La página del negocio del slug. `NO_ENCONTRADO` si el slug no existe, o si el negocio
 * no tiene sede principal o política (solo pasaría con datos creados por SQL). Con el
 * negocio suspendido, solo la marca y la sede.
 */
export async function leerPaginaPublica(slug: string, ahora: Date): Promise<Resultado<PaginaPublica, "NO_ENCONTRADO">> {
  const negocio = await negocios.paginaPorSlug(slug);
  if (!negocio) return fallo("NO_ENCONTRADO");
  const principal = await sedes.principal(negocio.id);
  if (!principal) return fallo("NO_ENCONTRADO");

  const [listaContactos, franjas] = await Promise.all([
    contactos.deSede(negocio.id, principal.id),
    horarios.semanaDe(negocio.id, principal.id),
  ]);
  const marca: MarcaPagina = {
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
  };
  const sede: SedePagina = { id: principal.id, direccion: principal.direccion, contactos: listaContactos, franjas };

  if (estadoEfectivo(negocio, ahora).estado === "suspendida") return exito({ estado: "suspendida", marca, sede });

  const [ofrecidos, vigente, reglas] = await Promise.all([
    servicios.ofrecidosEn(negocio.id, principal.id),
    politicas.vigente(negocio.id),
    configuracion.leer(negocio.id),
  ]);
  if (!vigente || !reglas) return fallo("NO_ENCONTRADO");

  const hoy = fechaLocal(ahora, negocio.zonaHoraria);
  return exito({
    estado: ofrecidos.length === 0 || franjas.length === 0 ? "sin_horarios" : "abierta",
    marca,
    sede,
    servicios: ofrecidos,
    politica: vigente,
    hoy,
    ultimoDia: sumarDias(hoy, reglas.anticipacionMaximaDias),
  });
}

/** Una versión de la política, para `/{slug}/politica/{version}` (PUB-05, RN-17; Q-45). */
export type PoliticaPublica = {
  marca: Pick<MarcaPagina, "nombre" | "slug" | "colorPrimario" | "colorSecundario" | "zonaHoraria">;
  version: number;
  contenido: string;
  publicadaEn: Date;
};

/**
 * Esa versión de la política del negocio del slug, también una anterior a la vigente:
 * el cliente lee la que vio al reservar (F-01). Se muestra aunque el negocio esté
 * suspendido. Una versión que no es un entero positivo, que no existe o que es de otro
 * negocio devuelve `NO_ENCONTRADO` (RN-01).
 */
export async function leerPoliticaPublica(
  slug: string,
  version: string,
): Promise<Resultado<PoliticaPublica, "NO_ENCONTRADO">> {
  if (!/^[1-9]\d{0,8}$/.test(version)) return fallo("NO_ENCONTRADO");
  const negocio = await negocios.paginaPorSlug(slug);
  if (!negocio) return fallo("NO_ENCONTRADO");
  const politica = await politicas.porVersion(negocio.id, Number(version));
  if (!politica) return fallo("NO_ENCONTRADO");
  return exito({
    marca: {
      nombre: negocio.nombre,
      slug: negocio.slug,
      colorPrimario: negocio.colorPrimario,
      colorSecundario: negocio.colorSecundario,
      zonaHoraria: negocio.zonaHoraria,
    },
    version: politica.version,
    contenido: politica.contenido,
    publicadaEn: politica.publicadaEn,
  });
}
