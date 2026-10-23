import "server-only";
import { createElement, type ReactElement } from "react";
import { z } from "zod";
import { esCorreoDeCuenta } from "@/dominio/envios";
import { invitacion, type DatosInvitacion } from "@/dominio/icalendar";
import * as contactos from "@/servidor/db/repositorios/contactos";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import type { CitaDelMensaje, NegocioDelMensaje, NotificacionReclamada } from "@/servidor/db/repositorios/notificaciones";
import { urlDeGestion } from "@/servidor/gestion-cita/firma";
import { asuntoCancelacion, Cancelacion } from "./plantillas/cancelacion";
import { asuntoConfirmacion, Confirmacion, type NegocioDelCorreo } from "./plantillas/confirmacion";
import { asuntoGracia, CuentaGracia } from "./plantillas/cuenta-gracia";
import { asuntoSuspension, CuentaSuspension } from "./plantillas/cuenta-suspension";
import { asuntoCambio, DuenoCambio, type CambioDeCita } from "./plantillas/dueno-cambio";
import { asuntoCitaNueva, DuenoCitaNueva, type NegocioDelAviso } from "./plantillas/dueno-cita-nueva";
import { asuntoRecordatorio, Recordatorio } from "./plantillas/recordatorio";
import { renderizar } from "./plantillas/render";
import { asuntoReprogramacion, Reprogramacion } from "./plantillas/reprogramacion";
import type { Adjunto, MensajeCorreo } from "./proveedor";
import { nombreProducto, remitenteDeCitas, remitenteDeCuenta, responderADeCitas } from "./remitente";

// El mensaje de cada notificación reclamada (C-01 a C-08; ARCH §14.3, paso 3, y §14.6;
// Q-63, Q-65, Q-67, Q-71). Lee los datos actuales que necesita su plantilla, filtrados
// por el `negocio_id` de la notificación (ARCH §6), y arma el asunto, el remitente, el
// `reply_to`, el link de gestión y, en C-01, C-03 y C-04, la invitación de calendario. La
// hora anterior de C-04 y lo que cambió en C-06 salen de `datos` (Q-67). Solo arma: si
// todavía corresponde enviarla lo decide antes `dominio/envios.ts`.

/** `datos` de C-04 (Q-60 de TASKS-05). */
const datosReprogramacion = z.object({ inicio_anterior: z.iso.datetime({ offset: true }) });
/** `datos` de C-06 (Q-68). */
const datosCambio = z.discriminatedUnion("cambio", [
  z.object({ cambio: z.literal("cancelada") }),
  z.object({
    cambio: z.literal("reprogramada"),
    inicio_anterior: z.iso.datetime({ offset: true }),
    inicio_nuevo: z.iso.datetime({ offset: true }),
  }),
]);
/** `datos` de C-07, como los escribe `aplicarVencimientos` (ARCH §7.6). */
const datosGracia = z.object({ vence: z.string(), suspende_en: z.string() });

function appUrl(): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  return base;
}

const absoluta = (ruta: string) => new URL(ruta, appUrl()).toString();

function fecha(valor: string): Date {
  const instante = new Date(valor);
  if (Number.isNaN(instante.getTime())) throw new Error("Fecha inválida en los datos de la notificación.");
  return instante;
}

/** El tipo de la invitación (ARCH §14.6; Q-71). */
const tipoIcs = (metodo: "REQUEST" | "CANCEL") => `text/calendar; method=${metodo}; charset=utf-8`;

type Contexto = {
  n: NotificacionReclamada;
  negocio: NegocioDelMensaje;
  cita: CitaDelMensaje;
  remitente: string;
  responderA: string | null;
};

/** La invitación de la cita para el cliente: `{servicio} — {negocio}` y el link de gestión (ARCH §14.6). */
function adjuntoDeInvitacion(metodo: "REQUEST" | "CANCEL", c: Contexto, urlGestion: string | null): Adjunto {
  const datos: DatosInvitacion = {
    cita: { id: c.cita.id, version: c.cita.version, inicio: c.cita.inicio, fin: c.cita.fin },
    resumen: `${c.cita.servicioNombre} — ${c.negocio.nombre}`,
    ubicacion: c.cita.direccion,
    descripcion: urlGestion
      ? `Código de reserva: ${c.cita.codigo}. Para ver, cambiar o cancelar tu cita: ${urlGestion}`
      : `Código de reserva: ${c.cita.codigo}. Esta cita fue cancelada.`,
    organizador: { nombre: c.negocio.nombre, correo: variableRemitente() },
  };
  // El `DTSTAMP` es la creación de la notificación: un reintento manda el mismo cuerpo, y
  // así el proveedor lo reconoce por su clave de idempotencia (RN-20).
  return { nombre: "invitacion.ics", tipo: tipoIcs(metodo), contenido: invitacion(metodo, datos, c.n.creadoEn) };
}

function variableRemitente(): string {
  const correo = process.env.CORREO_REMITENTE;
  if (!correo) throw new Error("Falta CORREO_REMITENTE (ver .env.example).");
  return correo;
}

async function correoDeCita(c: Contexto, asunto: string, plantilla: ReactElement, adjuntos: Adjunto[] = []): Promise<MensajeCorreo> {
  const { html, texto } = await renderizar(plantilla);
  return {
    remitente: c.remitente,
    destinatario: c.n.destinatario,
    responderA: c.responderA,
    asunto,
    html,
    texto,
    adjuntos,
    claveIdempotencia: c.n.claveIdempotencia,
  };
}

/** C-01 a C-06: los datos del negocio, de la cita y de su sede, con el remitente y el `reply_to` de Q-63. */
async function mensajeDeCita(n: NotificacionReclamada, negocio: NegocioDelMensaje): Promise<MensajeCorreo> {
  if (!n.citaId) throw new Error(`La notificación ${n.id} de tipo ${n.tipo} no tiene cita.`);
  const cita = await notificaciones.citaDelMensaje(n.negocioId, n.citaId);
  if (!cita) throw new Error(`La cita ${n.citaId} de la notificación ${n.id} no es de su negocio.`);
  // La sede de la cita da el pie; la principal, el `reply_to` (Q-63). En el MVP son la misma.
  const [contactosDeLaSede, contactosDeLaPrincipal] = await Promise.all([
    contactos.deSede(n.negocioId, cita.sedeId),
    contactos.dePrincipal(n.negocioId),
  ]);

  const c: Contexto = {
    n,
    negocio,
    cita,
    remitente: remitenteDeCitas(negocio.nombre),
    responderA: responderADeCitas({
      correoContacto: negocio.correoContacto,
      correosDeLaSede: contactosDeLaPrincipal.filter((k) => k.tipo === "correo").map((k) => k.valor),
      correoDueno: negocio.correoDueno,
    }),
  };
  const logoUrl = negocio.logoUrl ? absoluta(negocio.logoUrl) : null;
  const delCorreo: NegocioDelCorreo = { nombre: negocio.nombre, logoUrl, acento: negocio.colorPrimario, contactos: contactosDeLaSede };
  const delAviso: NegocioDelAviso = { nombre: negocio.nombre, logoUrl, acento: negocio.colorPrimario };
  const citaDelCorreo = {
    servicio: cita.servicioNombre,
    inicio: cita.inicio,
    fin: cita.fin,
    direccion: cita.direccion,
    codigo: cita.codigo,
  };
  const zonaHoraria = negocio.zonaHoraria;
  const urlPanel = absoluta(`/panel/citas/${cita.id}`);
  const gestion = () => urlDeGestion(negocio.slug, { id: cita.id, tokenVersion: cita.tokenVersion });
  const politica = () => (cita.versionPolitica === null ? null : absoluta(`/${negocio.slug}/politica/${cita.versionPolitica}`));

  switch (n.tipo) {
    case "confirmacion": {
      const urlGestion = await gestion();
      return correoDeCita(
        c,
        asuntoConfirmacion(negocio.nombre),
        createElement(Confirmacion, { negocio: delCorreo, zonaHoraria, cita: citaDelCorreo, urlGestion, urlPolitica: politica() }),
        [adjuntoDeInvitacion("REQUEST", c, urlGestion)],
      );
    }
    case "recordatorio": {
      // C-02 no lleva invitación, para no duplicar el evento (ARCH §14.6).
      const urlGestion = await gestion();
      return correoDeCita(
        c,
        asuntoRecordatorio(negocio.nombre, cita.inicio, zonaHoraria),
        createElement(Recordatorio, { negocio: delCorreo, zonaHoraria, cita: citaDelCorreo, urlGestion, urlPolitica: politica() }),
      );
    }
    case "cancelacion":
      return correoDeCita(
        c,
        asuntoCancelacion(negocio.nombre),
        createElement(Cancelacion, { negocio: delCorreo, zonaHoraria, cita: citaDelCorreo, urlReservar: absoluta(`/${negocio.slug}`) }),
        [adjuntoDeInvitacion("CANCEL", c, null)],
      );
    case "reprogramacion": {
      const { inicio_anterior } = datosReprogramacion.parse(n.datos);
      const urlGestion = await gestion();
      return correoDeCita(
        c,
        asuntoReprogramacion(negocio.nombre),
        createElement(Reprogramacion, {
          negocio: delCorreo,
          zonaHoraria,
          cita: citaDelCorreo,
          inicioAnterior: fecha(inicio_anterior),
          urlGestion,
        }),
        [adjuntoDeInvitacion("REQUEST", c, urlGestion)],
      );
    }
    case "dueno_cita_nueva":
      return correoDeCita(
        c,
        asuntoCitaNueva(cita.servicioNombre, cita.inicio, zonaHoraria),
        createElement(DuenoCitaNueva, {
          negocio: delAviso,
          zonaHoraria,
          cita: citaDelCorreo,
          cliente: {
            nombre: cita.clienteNombre,
            apellido: cita.clienteApellido,
            telefono: cita.clienteTelefono ?? "",
            correo: cita.clienteCorreo,
          },
          urlPanel,
        }),
      );
    case "dueno_cambio": {
      const d = datosCambio.parse(n.datos);
      const cambio: CambioDeCita =
        d.cambio === "cancelada"
          ? { tipo: "cancelada" }
          : { tipo: "reprogramada", inicioAnterior: fecha(d.inicio_anterior), inicioNuevo: fecha(d.inicio_nuevo) };
      return correoDeCita(
        c,
        asuntoCambio(cita.codigo),
        createElement(DuenoCambio, {
          negocio: delAviso,
          zonaHoraria,
          cita: { servicio: cita.servicioNombre, inicio: cita.inicio, codigo: cita.codigo },
          cliente: { nombre: cita.clienteNombre, apellido: cita.clienteApellido },
          cambio,
          urlPanel,
        }),
      );
    }
    default:
      throw new Error(`El tipo ${n.tipo} no es un correo de citas del MVP.`);
  }
}

/** C-07 y C-08: a nombre del producto, con `reply_to` a soporte (S-16; Q-66, Q-77). */
async function mensajeDeCuenta(n: NotificacionReclamada, negocio: NegocioDelMensaje): Promise<MensajeCorreo> {
  const { remitente, responderA } = remitenteDeCuenta();
  const cuenta = { producto: nombreProducto(), correoSoporte: responderA, negocio: negocio.nombre, zonaHoraria: negocio.zonaHoraria };
  let asunto: string;
  let plantilla: ReactElement;
  if (n.tipo === "dueno_gracia") {
    const d = datosGracia.parse(n.datos);
    const suspendeEn = fecha(d.suspende_en);
    asunto = asuntoGracia(suspendeEn, negocio.zonaHoraria);
    plantilla = createElement(CuentaGracia, { ...cuenta, vence: fecha(d.vence), suspendeEn });
  } else {
    asunto = asuntoSuspension();
    plantilla = createElement(CuentaSuspension, cuenta);
  }
  const { html, texto } = await renderizar(plantilla);
  return { remitente, destinatario: n.destinatario, responderA, asunto, html, texto, adjuntos: [], claveIdempotencia: n.claveIdempotencia };
}

/**
 * El mensaje de una notificación reclamada, con los datos actuales: una cita movida antes
 * de que salga su C-01 sale con su hora actual (ARCH §14.3, paso 3). Lanza si los datos ya
 * no existen o no son de su negocio; el procesador lo cuenta como un envío fallido.
 */
export async function armarMensaje(n: NotificacionReclamada): Promise<MensajeCorreo> {
  const negocio = await notificaciones.negocioDelMensaje(n.negocioId);
  if (!negocio) throw new Error(`No existe el negocio de la notificación ${n.id}.`);
  return esCorreoDeCuenta(n.tipo) ? mensajeDeCuenta(n, negocio) : mensajeDeCita(n, negocio);
}
