// iCalendar (RFC 5545) de las citas (RN-35; ADR-17, ARCH §14.6 y §14.7; Q-71). Arma las
// invitaciones que llevan C-01, C-03 y C-04 (con `METHOD:REQUEST` o `METHOD:CANCEL`) y el
// calendario del enlace del dueño (sin `METHOD`). Las horas van en UTC (`…Z`): cada
// calendario las muestra en la zona de su usuario, así que no hace falta `VTIMEZONE`.
// El `UID` es estable, así que cada actualización reemplaza el evento en lugar de
// duplicarlo, y `SEQUENCE` sube con cada cambio de hora.

/**
 * Sufijo fijo del `UID` (Q-71): no depende de `APP_URL` ni del dominio, para que el
 * cambio de dominio de la Fase 9 no duplique los eventos. No se cambia nunca.
 */
const SUFIJO_UID = "agenda-citas";

const PRODID = "-//Agenda de citas//Citas//ES";

/** Octetos por línea antes de plegar (RFC 5545 §3.1), sin contar el CRLF. */
const OCTETOS_POR_LINEA = 75;

/** El `UID` de los eventos de una cita: el mismo en las invitaciones y en el enlace del dueño. */
export function uidDeCita(citaId: string): string {
  return `${citaId}@${SUFIJO_UID}`;
}

export type Organizador = { nombre: string; correo: string };

export type EventoIcs = {
  citaId: string;
  /** `cita.version` y, en la cancelación, `version + 1` (ARCH §14.6). */
  secuencia: number;
  inicio: Date;
  fin: Date;
  estado: "CONFIRMED" | "CANCELLED";
  resumen: string;
  ubicacion: string | null;
  descripcion: string;
  organizador: Organizador | null;
};

export type CalendarioIcs = {
  /** Solo en las invitaciones; el enlace del dueño va sin `METHOD` (ARCH §14.7). */
  metodo: "REQUEST" | "CANCEL" | null;
  /** `X-WR-CALNAME` del enlace del dueño: el nombre del negocio (Q-71). */
  nombre: string | null;
  /** `DTSTAMP`: cuándo se generó. */
  generadoEn: Date;
  eventos: EventoIcs[];
};

/** `20261015T000000Z` (RFC 5545 §3.3.5, hora UTC). */
function fechaUtc(fecha: Date): string {
  return fecha.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
}

/**
 * Un valor TEXT (RFC 5545 §3.3.11): escapa `\`, `;` y `,`, convierte cada salto de línea
 * en `\n` y quita los demás caracteres de control, que el formato no admite.
 */
function texto(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, "");
}

/** El valor de un parámetro (RFC 5545 §3.2): entre comillas, sin comillas ni controles adentro. */
function parametro(valor: string): string {
  return `"${valor.replace(/["\u0000-\u0008\u000a-\u001f\u007f]/g, "")}"`;
}

function octetos(caracter: string): number {
  const punto = caracter.codePointAt(0) ?? 0;
  if (punto < 0x80) return 1;
  if (punto < 0x800) return 2;
  if (punto < 0x10000) return 3;
  return 4;
}

/**
 * Pliega una línea a 75 octetos (RFC 5545 §3.1): cada continuación empieza con un
 * espacio, que cuenta en sus 75. Recorre caracteres completos, así que nunca parte una
 * secuencia UTF-8 ni un par sustituto.
 */
function plegar(linea: string): string {
  const partes: string[] = [];
  let actual = "";
  let usados = 0;
  let limite = OCTETOS_POR_LINEA;
  for (const caracter of linea) {
    const n = octetos(caracter);
    if (usados + n > limite) {
      partes.push(actual);
      actual = "";
      usados = 0;
      limite = OCTETOS_POR_LINEA - 1;
    }
    actual += caracter;
    usados += n;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

function lineasDelEvento(e: EventoIcs, generadoEn: Date): string[] {
  return [
    "BEGIN:VEVENT",
    `UID:${uidDeCita(e.citaId)}`,
    `SEQUENCE:${e.secuencia}`,
    `DTSTAMP:${fechaUtc(generadoEn)}`,
    `DTSTART:${fechaUtc(e.inicio)}`,
    `DTEND:${fechaUtc(e.fin)}`,
    `STATUS:${e.estado}`,
    `SUMMARY:${texto(e.resumen)}`,
    ...(e.ubicacion ? [`LOCATION:${texto(e.ubicacion)}`] : []),
    `DESCRIPTION:${texto(e.descripcion)}`,
    ...(e.organizador ? [`ORGANIZER;CN=${parametro(e.organizador.nombre)}:mailto:${e.organizador.correo}`] : []),
    "END:VEVENT",
  ];
}

/** El `VCALENDAR` completo, con CRLF al final de cada línea (RFC 5545 §3.1). */
export function generarCalendario(c: CalendarioIcs): string {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    ...(c.metodo ? [`METHOD:${c.metodo}`] : []),
    ...(c.nombre ? [`X-WR-CALNAME:${texto(c.nombre)}`] : []),
    ...c.eventos.flatMap((e) => lineasDelEvento(e, c.generadoEn)),
    "END:VCALENDAR",
  ];
  return lineas.map(plegar).join("\r\n") + "\r\n";
}

export type CitaIcs = { id: string; version: number; inicio: Date; fin: Date };

export type DatosInvitacion = {
  cita: CitaIcs;
  /** Cliente: `{servicio} — {negocio}` (ARCH §14.6). */
  resumen: string;
  /** La dirección de la sede. */
  ubicacion: string | null;
  /** Cliente: el link de gestión. Nunca teléfonos ni correos de terceros. */
  descripcion: string;
  /** `CORREO_REMITENTE` con el nombre del negocio (Q-71). */
  organizador: Organizador;
};

/**
 * La invitación de una cita (ARCH §14.6): `REQUEST` con `STATUS:CONFIRMED` y
 * `SEQUENCE = version` en C-01 y C-04; `CANCEL` con `STATUS:CANCELLED` y
 * `SEQUENCE = version + 1` en C-03.
 */
export function invitacion(metodo: "REQUEST" | "CANCEL", d: DatosInvitacion, generadoEn: Date): string {
  const cancela = metodo === "CANCEL";
  return generarCalendario({
    metodo,
    nombre: null,
    generadoEn,
    eventos: [
      {
        citaId: d.cita.id,
        secuencia: cancela ? d.cita.version + 1 : d.cita.version,
        inicio: d.cita.inicio,
        fin: d.cita.fin,
        estado: cancela ? "CANCELLED" : "CONFIRMED",
        resumen: d.resumen,
        ubicacion: d.ubicacion,
        descripcion: d.descripcion,
        organizador: d.organizador,
      },
    ],
  });
}

export type EventoSuscrito = {
  cita: CitaIcs;
  /** `{servicio} — {nombre y apellido del cliente}` (Q-71). */
  resumen: string;
  ubicacion: string | null;
  /** El código y el enlace a la cita en el panel, sin teléfonos ni correos (RN-24). */
  descripcion: string;
};

/**
 * El calendario del enlace del dueño (ARCH §14.7): sin `METHOD`, con `X-WR-CALNAME` y un
 * evento por cita no cancelada, con el mismo `UID` y `SEQUENCE` que las invitaciones.
 */
export function calendarioSuscrito(nombre: string, eventos: EventoSuscrito[], generadoEn: Date): string {
  return generarCalendario({
    metodo: null,
    nombre,
    generadoEn,
    eventos: eventos.map((e) => ({
      citaId: e.cita.id,
      secuencia: e.cita.version,
      inicio: e.cita.inicio,
      fin: e.cita.fin,
      estado: "CONFIRMED",
      resumen: e.resumen,
      ubicacion: e.ubicacion,
      descripcion: e.descripcion,
      organizador: null,
    })),
  });
}
