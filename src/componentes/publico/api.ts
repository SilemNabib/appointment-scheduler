// Cliente de la API pública para el navegador (PUB-04, PUB-06, PUB-08; F-01; ARCH
// §18.5; Q-49). Consulta la disponibilidad y reserva con los contratos HTTP, no con
// Server Actions, para que el límite de frecuencia de la Fase 8 los cubra sin cambios.
// Nunca lanza: una falla de red o una respuesta que no es el JSON esperado se convierten
// en el error `CONEXION`, para que la página ofrezca reintentar sin perder los datos.

/** Los códigos de error que la página distingue (ARCH §18.5), más la falla de conexión. */
export type CodigoApi =
  | "DATOS_INVALIDOS"
  | "NO_ENCONTRADO"
  | "NEGOCIO_SUSPENDIDO"
  | "LIMITE_PLAN"
  | "HORARIO_NO_DISPONIBLE"
  | "DEMASIADAS_SOLICITUDES"
  | "CONEXION";

/** Un error de la API, con los campos que fallaron en `DATOS_INVALIDOS` de la reserva (Q-46). */
export type ErrorApi = { codigo: CodigoApi; campos?: string[] };

export type ResultadoApi<T> = { ok: true; valor: T } | { ok: false; error: ErrorApi };

export type DiaDisponible = { fecha: string; inicios: string[] };
export type Disponibilidad = { zonaHoraria: string; dias: DiaDisponible[] };

export type CitaCreada = { citaId: string; codigo: string; inicio: string; fin: string };

export type ConsultaDisponibilidad = {
  slug: string;
  sedeId: string;
  servicioId: string;
  /** Fechas locales `YYYY-MM-DD`, inclusive (hasta 31 días). */
  desde: string;
  hasta: string;
};

export type DatosReserva = {
  sedeId: string;
  servicioId: string;
  /** ISO 8601 UTC (ARCH §9, regla 4). */
  inicio: string;
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
  politicaDatosId: string;
  aceptaPolitica: boolean;
  /** Trampa para bots: el formulario la lleva oculta y debe ir vacía (ARCH §15). */
  sitioWeb: string;
};

const CODIGOS: readonly CodigoApi[] = [
  "DATOS_INVALIDOS",
  "NO_ENCONTRADO",
  "NEGOCIO_SUSPENDIDO",
  "LIMITE_PLAN",
  "HORARIO_NO_DISPONIBLE",
  "DEMASIADAS_SOLICITUDES",
];

const CONEXION: { ok: false; error: ErrorApi } = { ok: false, error: { codigo: "CONEXION" } };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** El cuerpo como JSON, o `undefined` si no lo es (una página de error en HTML, por ejemplo). */
async function cuerpoJson(respuesta: Response): Promise<unknown> {
  try {
    return await respuesta.json();
  } catch {
    return undefined;
  }
}

/** El error de una respuesta que no fue un éxito. */
function errorDe(estado: number, cuerpo: unknown): { ok: false; error: ErrorApi } {
  // El límite de frecuencia (Fase 8) puede responder sin el JSON de §18.5.
  if (estado === 429) return { ok: false, error: { codigo: "DEMASIADAS_SOLICITUDES" } };
  const error = esObjeto(cuerpo) && esObjeto(cuerpo.error) ? cuerpo.error : null;
  const codigo = error && CODIGOS.find((c) => c === error.codigo);
  if (!codigo) return CONEXION;
  const campos = Array.isArray(error.campos) ? error.campos.filter((c): c is string => typeof c === "string") : [];
  return { ok: false, error: campos.length > 0 ? { codigo, campos } : { codigo } };
}

async function pedir<T>(
  url: string,
  opciones: RequestInit,
  estadoExito: number,
  esValor: (cuerpo: unknown) => cuerpo is T,
): Promise<ResultadoApi<T>> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, { ...opciones, cache: "no-store" });
  } catch {
    return CONEXION;
  }
  const cuerpo = await cuerpoJson(respuesta);
  if (respuesta.status === estadoExito) return esValor(cuerpo) ? { ok: true, valor: cuerpo } : CONEXION;
  return errorDe(respuesta.status, cuerpo);
}

const esDisponibilidad = (x: unknown): x is Disponibilidad =>
  esObjeto(x) &&
  typeof x.zonaHoraria === "string" &&
  Array.isArray(x.dias) &&
  x.dias.every((d) => esObjeto(d) && typeof d.fecha === "string" && Array.isArray(d.inicios));

const esCitaCreada = (x: unknown): x is CitaCreada =>
  esObjeto(x) && ["citaId", "codigo", "inicio", "fin"].every((k) => typeof x[k] === "string");

/** Las horas libres de un servicio entre dos fechas locales (PUB-03, PUB-04). */
export function consultarDisponibilidad(c: ConsultaDisponibilidad): Promise<ResultadoApi<Disponibilidad>> {
  const parametros = new URLSearchParams({ sedeId: c.sedeId, servicioId: c.servicioId, desde: c.desde, hasta: c.hasta });
  return pedir(
    `/api/publico/${encodeURIComponent(c.slug)}/disponibilidad?${parametros}`,
    { method: "GET", headers: { accept: "application/json" } },
    200,
    esDisponibilidad,
  );
}

/** Reserva una cita (PUB-05, PUB-06). `recursoId` siempre va en `null` en el MVP (Q-30). */
export function reservar(slug: string, datos: DatosReserva): Promise<ResultadoApi<CitaCreada>> {
  return pedir(
    `/api/publico/${encodeURIComponent(slug)}/reservas`,
    {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ ...datos, recursoId: null }),
    },
    201,
    esCitaCreada,
  );
}
