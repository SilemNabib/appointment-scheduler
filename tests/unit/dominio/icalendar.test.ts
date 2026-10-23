import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { calendarioSuscrito, invitacion, uidDeCita, type DatosInvitacion } from "@/dominio/icalendar";
import { localAUtc } from "@/dominio/tiempo";

// iCalendar de las citas (RN-35; ARCH §14.6, §14.7 y §20, Calendario; Q-71): comparación
// con un `.ics` de referencia, `UID` estable, `SEQUENCE`, `CANCEL` y horas en UTC.

const BOGOTA = "America/Bogota";
const CITA_ID = "6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";
const GENERADO_EN = new Date("2026-10-01T15:00:00Z");

// El archivo de referencia se guarda con saltos de línea del sistema; el formato usa CRLF.
const referencia = readFileSync(fileURLToPath(new URL("./fixtures/invitacion.ics", import.meta.url)), "utf8").replace(
  /\r?\n/g,
  "\r\n",
);

const octetos = (linea: string) => new TextEncoder().encode(linea).length;
const lineas = (ics: string) => ics.replace(/\r\n$/, "").split("\r\n");
/** RFC 5545 §3.1: deshace el plegado. */
const desplegar = (ics: string) => ics.replace(/\r\n /g, "");
const valor = (ics: string, nombre: string) =>
  lineas(desplegar(ics))
    .filter((l) => l.startsWith(`${nombre}:`) || l.startsWith(`${nombre};`))
    .map((l) => l.slice(l.indexOf(":") + 1));

/** Una cita a las 7:00 p. m. del 14 de octubre en Bogotá: en UTC, el 15 a las 00:00 (ARCH §9). */
function datos(d: Partial<DatosInvitacion> = {}): DatosInvitacion {
  const inicio = localAUtc("2026-10-14", "19:00", BOGOTA);
  return {
    cita: { id: CITA_ID, version: 2, inicio, fin: new Date(inicio.getTime() + 30 * 60 * 1000) },
    resumen: "Limpieza dental — Consultorio Ana",
    ubicacion: "Calle 10 # 5-20, Bogotá",
    descripcion: `Para ver, cambiar o cancelar tu cita: https://agenda.example.com/consultorio-ana/cita/${CITA_ID}/Xk3pQ9vZ2mN8rT4wY7bC1dF6gH0jL5sA9eU2iO3qW8z`,
    organizador: { nombre: "Consultorio Ana", correo: "citas@agenda.example.com" },
    ...d,
  };
}

// La suite corre con una zona lejana a la del negocio: el resultado no debe depender de ella (RN-03).
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("invitación REQUEST (C-01 y C-04; ARCH §14.6)", () => {
  test("coincide con el .ics de referencia", () => {
    expect(invitacion("REQUEST", datos(), GENERADO_EN)).toBe(referencia);
  });

  test("DTSTART y DTEND en UTC, el UID de Q-71 y SEQUENCE igual a la versión", () => {
    const ics = invitacion("REQUEST", datos(), GENERADO_EN);
    expect(valor(ics, "DTSTART")).toEqual(["20261015T000000Z"]);
    expect(valor(ics, "DTEND")).toEqual(["20261015T003000Z"]);
    expect(valor(ics, "UID")).toEqual([`${CITA_ID}@agenda-citas`]);
    expect(uidDeCita(CITA_ID)).toBe(`${CITA_ID}@agenda-citas`);
    expect(valor(ics, "SEQUENCE")).toEqual(["2"]);
    expect(valor(ics, "METHOD")).toEqual(["REQUEST"]);
    expect(valor(ics, "STATUS")).toEqual(["CONFIRMED"]);
    expect(ics).not.toContain("VTIMEZONE");
  });

  test("da lo mismo con la zona del proceso en Bogotá (RN-03)", () => {
    vi.stubEnv("TZ", BOGOTA);
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(BOGOTA);
    expect(invitacion("REQUEST", datos(), GENERADO_EN)).toBe(referencia);
  });

  test("al reprogramar, el mismo UID con SEQUENCE mayor (RN-35)", () => {
    const antes = invitacion("REQUEST", datos(), GENERADO_EN);
    const cita = { ...datos().cita, version: 3, inicio: new Date("2026-10-16T14:00:00Z"), fin: new Date("2026-10-16T14:30:00Z") };
    const despues = invitacion("REQUEST", datos({ cita }), GENERADO_EN);
    expect(valor(despues, "UID")).toEqual(valor(antes, "UID"));
    expect(valor(despues, "SEQUENCE")).toEqual(["3"]);
    expect(valor(despues, "DTSTART")).toEqual(["20261016T140000Z"]);
  });

  test("usa CRLF en todas las líneas y termina en CRLF (RFC 5545 §3.1)", () => {
    const ics = invitacion("REQUEST", datos(), GENERADO_EN);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});

describe("invitación CANCEL (C-03; ARCH §14.6)", () => {
  test("lleva METHOD:CANCEL, STATUS:CANCELLED, el mismo UID y SEQUENCE igual a la versión más 1", () => {
    const ics = invitacion("CANCEL", datos(), GENERADO_EN);
    expect(valor(ics, "METHOD")).toEqual(["CANCEL"]);
    expect(valor(ics, "STATUS")).toEqual(["CANCELLED"]);
    expect(valor(ics, "UID")).toEqual([`${CITA_ID}@agenda-citas`]);
    expect(valor(ics, "SEQUENCE")).toEqual(["3"]);
    expect(valor(ics, "DTSTART")).toEqual(["20261015T000000Z"]);
  });
});

describe("escape y plegado (RFC 5545 §3.1 y §3.3.11)", () => {
  const resumen = "Limpieza, blanqueamiento; y revisión \\ básica — Señora Muñoz 🦷";
  const descripcion =
    "Línea uno con tildes: áéíóú ñ, y comas; también.\nLínea dos 😀 con emoji y más texto para pasar de 75 octetos sin problema alguno.";

  test("escapa \\, ; , y los saltos de línea", () => {
    const ics = invitacion("REQUEST", datos({ resumen, descripcion }), GENERADO_EN);
    expect(valor(ics, "SUMMARY")).toEqual([
      "Limpieza\\, blanqueamiento\\; y revisión \\\\ básica — Señora Muñoz 🦷",
    ]);
    expect(valor(ics, "DESCRIPTION")).toEqual([
      "Línea uno con tildes: áéíóú ñ\\, y comas\\; también.\\nLínea dos 😀 con emoji y más texto para pasar de 75 octetos sin problema alguno.",
    ]);
  });

  test("ninguna línea pasa de 75 octetos y ninguna parte un carácter UTF-8", () => {
    const ics = invitacion("REQUEST", datos({ resumen, descripcion }), GENERADO_EN);
    const todas = lineas(ics);
    expect(todas.some((l) => l.startsWith(" "))).toBe(true);
    for (const linea of todas) {
      expect(octetos(linea), linea).toBeLessThanOrEqual(75);
      // Un par sustituto partido no sobrevive la ida y vuelta por UTF-8.
      expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(linea))).toBe(linea);
    }
  });

  test("un carácter de 2 octetos que no cabe pasa entero a la línea siguiente", () => {
    // "DESCRIPTION:" (12 octetos) + 62 "a" = 74 octetos: la "ñ" (2) ya no cabe en 75.
    const ics = invitacion("REQUEST", datos({ descripcion: "a".repeat(62) + "ñ" + "b".repeat(80) }), GENERADO_EN);
    const linea = lineas(ics).findIndex((l) => l.startsWith("DESCRIPTION:"));
    const [primera, segunda, tercera] = lineas(ics).slice(linea, linea + 3);
    expect(primera).toBe("DESCRIPTION:" + "a".repeat(62));
    expect(segunda).toBe(" ñ" + "b".repeat(72));
    expect(octetos(segunda)).toBe(75);
    expect(tercera).toBe(" " + "b".repeat(8));
  });

  test("las comillas del nombre del organizador no rompen el parámetro CN", () => {
    const ics = invitacion(
      "REQUEST",
      datos({ organizador: { nombre: 'Consultorio "Ana"; sede, norte', correo: "citas@agenda.example.com" } }),
      GENERADO_EN,
    );
    expect(lineas(desplegar(ics))).toContain('ORGANIZER;CN="Consultorio Ana; sede, norte":mailto:citas@agenda.example.com');
  });

  test("sin dirección, el evento va sin LOCATION", () => {
    expect(valor(invitacion("REQUEST", datos({ ubicacion: null }), GENERADO_EN), "LOCATION")).toEqual([]);
  });
});

describe("calendario del enlace del dueño (ARCH §14.7; Q-71)", () => {
  const otra = { id: "0b8e7c6d-5a4b-4f3e-9d2c-1b0a9f8e7d6c", version: 1, inicio: new Date("2026-10-20T13:00:00Z"), fin: new Date("2026-10-20T14:00:00Z") };
  const ics = calendarioSuscrito(
    "Consultorio Ana",
    [
      { cita: datos().cita, resumen: "Limpieza dental — Ana Pérez", ubicacion: "Calle 10 # 5-20, Bogotá", descripcion: "OV-4821" },
      { cita: otra, resumen: "Control — Luis Gómez", ubicacion: null, descripcion: "KM-2093" },
    ],
    GENERADO_EN,
  );

  test("va sin METHOD, con X-WR-CALNAME y un VEVENT por cita", () => {
    expect(valor(ics, "METHOD")).toEqual([]);
    expect(valor(ics, "X-WR-CALNAME")).toEqual(["Consultorio Ana"]);
    expect(valor(ics, "BEGIN").filter((v) => v === "VEVENT")).toHaveLength(2);
  });

  test("con los UID y SEQUENCE de las invitaciones", () => {
    expect(valor(ics, "UID")).toEqual([uidDeCita(CITA_ID), uidDeCita(otra.id)]);
    expect(valor(ics, "SEQUENCE")).toEqual(["2", "1"]);
    expect(valor(ics, "STATUS")).toEqual(["CONFIRMED", "CONFIRMED"]);
    expect(valor(ics, "DTSTART")).toEqual(["20261015T000000Z", "20261020T130000Z"]);
  });

  test("sin ORGANIZER: no son invitaciones", () => {
    expect(valor(ics, "ORGANIZER")).toEqual([]);
  });
});
