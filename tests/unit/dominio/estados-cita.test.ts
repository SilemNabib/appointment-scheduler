import { describe, expect, test } from "vitest";
import {
  ESTADOS_CITA,
  esEstadoAsistencia,
  eventoDeTransicion,
  sePuedeCancelar,
  sePuedeMarcar,
  sePuedeMover,
  type EstadoCita,
  type TipoEvento,
} from "@/dominio/estados-cita";
import { estadoCita } from "@/servidor/db/esquema";

// Máquina de estados de la cita (PRD §7; ARCH §20, dominio/estados-cita): todas las
// transiciones válidas e inválidas, con el evento que deja cada una (Q-55).

/** Las transiciones válidas de PRD §7 y su evento. Cualquier otro par es inválido. */
const VALIDAS: [EstadoCita, EstadoCita, TipoEvento][] = [
  ["confirmada", "confirmada", "reprogramada"], // RN-14: otra hora, la misma cita
  ["confirmada", "cancelada", "cancelada"],
  ["confirmada", "completada", "completada"], // RN-16
  ["confirmada", "no_asistio", "no_asistio"], // RN-16
  ["completada", "no_asistio", "estado_corregido"], // S-09
  ["no_asistio", "completada", "estado_corregido"], // S-09
];

const clave = (de: EstadoCita, a: EstadoCita) => `${de}→${a}`;
const evento = new Map(VALIDAS.map(([de, a, tipo]) => [clave(de, a), tipo]));
const TODOS_LOS_PARES = ESTADOS_CITA.flatMap((de) => ESTADOS_CITA.map((a) => [de, a] as const));

test("los estados coinciden con el enum estado_cita del esquema (ARCH §18.2)", () => {
  expect([...ESTADOS_CITA]).toEqual(estadoCita.enumValues);
});

describe("eventoDeTransicion: los 25 pares de PRD §7", () => {
  test.each(TODOS_LOS_PARES)("%s → %s", (de, a) => {
    expect(eventoDeTransicion(de, a)).toBe(evento.get(clave(de, a)) ?? null);
  });

  test("desde cancelada no hay ninguna transición (S-08)", () => {
    for (const a of ESTADOS_CITA) expect(eventoDeTransicion("cancelada", a)).toBeNull();
  });

  test("ningún flujo del MVP llega a pendiente_pago ni sale de él (RN-12)", () => {
    for (const otro of ESTADOS_CITA) {
      expect(eventoDeTransicion(otro, "pendiente_pago")).toBeNull();
      expect(eventoDeTransicion("pendiente_pago", otro)).toBeNull();
    }
  });

  test("de confirmada a completada da completada, y de completada a no_asistio, estado_corregido (Q-55)", () => {
    expect(eventoDeTransicion("confirmada", "completada")).toBe("completada");
    expect(eventoDeTransicion("completada", "no_asistio")).toBe("estado_corregido");
  });
});

describe("qué se puede hacer en cada estado", () => {
  test.each<[EstadoCita, { cancelar: boolean; mover: boolean; marcar: boolean }]>([
    ["confirmada", { cancelar: true, mover: true, marcar: true }],
    ["completada", { cancelar: false, mover: false, marcar: true }], // S-09: se corrige
    ["no_asistio", { cancelar: false, mover: false, marcar: true }], // S-09: se corrige
    ["cancelada", { cancelar: false, mover: false, marcar: false }], // S-08
    ["pendiente_pago", { cancelar: false, mover: false, marcar: false }], // RN-12
  ])("%s", (estado, permitido) => {
    expect({
      cancelar: sePuedeCancelar(estado),
      mover: sePuedeMover(estado),
      marcar: sePuedeMarcar(estado),
    }).toEqual(permitido);
  });
});

test("esEstadoAsistencia acepta solo completada y no_asistio", () => {
  expect(["completada", "no_asistio"].every(esEstadoAsistencia)).toBe(true);
  for (const otro of ["confirmada", "cancelada", "pendiente_pago", "", null, 1]) {
    expect(esEstadoAsistencia(otro)).toBe(false);
  }
});
