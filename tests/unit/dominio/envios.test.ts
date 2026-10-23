import { describe, expect, test } from "vitest";
import {
  decidirEnvio,
  esCorreoDeCuenta,
  TIPOS_NOTIFICACION,
  type CitaActual,
  type DecisionEnvio,
  type MotivoAnulacion,
  type TipoNotificacion,
} from "@/dominio/envios";
import type { EstadoEfectivo } from "@/dominio/suscripcion";
import { tipoNotificacion } from "@/servidor/db/esquema";

// Revalidación de un envío (ARCH §14.3, paso 1; Q-67): una prueba por tabla.

const AL_DIA: EstadoEfectivo = { estado: "al_dia" };
const EN_GRACIA: EstadoEfectivo = { estado: "en_gracia", suspendeEn: new Date("2026-10-13T05:00:00Z") };
const SUSPENDIDA: EstadoEfectivo = { estado: "suspendida" };
const ENVIAR: DecisionEnvio = { enviar: true };
const anular = (ultimoError: MotivoAnulacion): DecisionEnvio => ({ enviar: false, ultimoError });

const confirmada = (version = 2): CitaActual => ({ estado: "confirmada", version });
const DE_CITAS = TIPOS_NOTIFICACION.filter((t) => !esCorreoDeCuenta(t));

test("los tipos son los del enum tipo_notificacion (ARCH §18.2)", () => {
  expect([...TIPOS_NOTIFICACION]).toEqual(tipoNotificacion.enumValues);
});

test("solo C-07 y C-08 son correos de la cuenta, que no cuentan para max_emails_per_month (ARCH §14.1)", () => {
  expect(TIPOS_NOTIFICACION.filter(esCorreoDeCuenta)).toEqual(["dueno_gracia", "dueno_suspension"]);
  expect(DE_CITAS).toEqual([
    "confirmacion",
    "recordatorio",
    "cancelacion",
    "reprogramacion",
    "dueno_cita_nueva",
    "dueno_cambio",
    "empleado_cita_nueva",
    "empleado_cambio",
  ]);
});

describe("con el negocio suspendido (D-14, S-16)", () => {
  test.each<[TipoNotificacion, CitaActual, DecisionEnvio]>([
    ...DE_CITAS.map((tipo): [TipoNotificacion, CitaActual, DecisionEnvio] => [tipo, confirmada(), anular("NEGOCIO_SUSPENDIDO")]),
    ["dueno_suspension", null, ENVIAR],
    ["dueno_gracia", null, anular("NEGOCIO_NO_EN_GRACIA")],
  ])("%s → %j", (tipo, cita, decision) => {
    expect(decidirEnvio({ tipo, datos: { version: 2 } }, cita, SUSPENDIDA)).toEqual(decision);
  });
});

describe("recordatorio y correos de la cuenta (ARCH §14.3)", () => {
  test.each<[string, TipoNotificacion, unknown, CitaActual, EstadoEfectivo, DecisionEnvio]>([
    ["C-02 de la versión actual, confirmada", "recordatorio", { version: 2 }, confirmada(2), AL_DIA, ENVIAR],
    ["C-02 en gracia (D-13)", "recordatorio", { version: 2 }, confirmada(2), EN_GRACIA, ENVIAR],
    ["C-02 de una cita cancelada", "recordatorio", { version: 2 }, { estado: "cancelada", version: 2 }, AL_DIA, anular("CITA_NO_CONFIRMADA")],
    ["C-02 de una cita completada", "recordatorio", { version: 2 }, { estado: "completada", version: 2 }, AL_DIA, anular("CITA_NO_CONFIRMADA")],
    ["C-02 de una versión anterior", "recordatorio", { version: 1 }, confirmada(2), AL_DIA, anular("VERSION_ANTERIOR")],
    ["C-02 de una versión que no coincide", "recordatorio", { version: 3 }, confirmada(2), AL_DIA, anular("VERSION_ANTERIOR")],
    ["C-02 sin version en datos", "recordatorio", {}, confirmada(2), AL_DIA, anular("SIN_VERSION")],
    ["C-02 de una cita que ya no existe", "recordatorio", { version: 2 }, null, AL_DIA, anular("CITA_INEXISTENTE")],
    ["C-07 en gracia", "dueno_gracia", {}, null, EN_GRACIA, ENVIAR],
    ["C-07 de un negocio que pagó", "dueno_gracia", {}, null, AL_DIA, anular("NEGOCIO_NO_EN_GRACIA")],
    ["C-07 de un negocio ya suspendido", "dueno_gracia", {}, null, SUSPENDIDA, anular("NEGOCIO_NO_EN_GRACIA")],
    ["C-08 suspendido", "dueno_suspension", {}, null, SUSPENDIDA, ENVIAR],
    ["C-08 de un negocio reactivado", "dueno_suspension", {}, null, AL_DIA, anular("NEGOCIO_NO_SUSPENDIDO")],
    ["C-08 de un negocio reactivado y ya en gracia", "dueno_suspension", {}, null, EN_GRACIA, anular("NEGOCIO_NO_SUSPENDIDO")],
  ])("%s", (_, tipo, datos, cita, suscripcion, decision) => {
    expect(decidirEnvio({ tipo, datos }, cita, suscripcion)).toEqual(decision);
  });
});

describe("C-01, C-03 a C-06 (Q-67)", () => {
  test.each<[string, TipoNotificacion, unknown, CitaActual, DecisionEnvio]>([
    ["C-01 de una cita confirmada", "confirmacion", {}, confirmada(1), ENVIAR],
    ["C-01 de una cita movida antes de salir: sale con la hora actual", "confirmacion", {}, confirmada(3), ENVIAR],
    ["C-01 de una cita ya completada", "confirmacion", {}, { estado: "completada", version: 1 }, ENVIAR],
    ["C-01 de una cita cancelada", "confirmacion", {}, { estado: "cancelada", version: 1 }, anular("CITA_CANCELADA")],
    ["C-04 de la versión actual", "reprogramacion", { version: 2, inicio_anterior: "2026-10-14T13:00:00.000Z" }, confirmada(2), ENVIAR],
    ["C-04 de una versión anterior", "reprogramacion", { version: 2, inicio_anterior: "2026-10-14T13:00:00.000Z" }, confirmada(3), anular("VERSION_ANTERIOR")],
    ["C-04 de una cita cancelada después", "reprogramacion", { version: 2 }, { estado: "cancelada", version: 2 }, anular("CITA_NO_CONFIRMADA")],
    ["C-04 sin version en datos", "reprogramacion", null, confirmada(2), anular("SIN_VERSION")],
    ["C-03", "cancelacion", {}, { estado: "cancelada", version: 2 }, ENVIAR],
    ["C-05 de una cita cancelada después", "dueno_cita_nueva", {}, { estado: "cancelada", version: 1 }, ENVIAR],
    ["C-06 de una reprogramación", "dueno_cambio", { cambio: "reprogramada" }, confirmada(3), ENVIAR],
    ["C-06 de una cancelación", "dueno_cambio", { cambio: "cancelada" }, { estado: "cancelada", version: 2 }, ENVIAR],
  ])("%s", (_, tipo, datos, cita, decision) => {
    expect(decidirEnvio({ tipo, datos }, cita, AL_DIA)).toEqual(decision);
    // En gracia el negocio funciona igual (D-13).
    expect(decidirEnvio({ tipo, datos }, cita, EN_GRACIA)).toEqual(decision);
  });
});
