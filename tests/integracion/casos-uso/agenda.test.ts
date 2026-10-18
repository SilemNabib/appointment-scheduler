import { randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { intervaloDeDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { leerAgenda, type PeticionAgenda } from "@/servidor/casos-uso/agenda";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, negocioConAgenda } from "../fixtures";

// Contexto del motor (RN-09, D-11; ARCH §10 y §11.1): el mismo para la consulta, por
// HTTP, y para la reserva, dentro de la transacción. La semana del lunes 4-mar-2030.

const RANGO = intervaloDeDias("2030-03-04", "2030-03-10", ZONA_HORARIA_POR_DEFECTO);
const AHORA = new Date("2030-03-01T15:00:00Z");

async function negocioConBloqueoYCita() {
  const n = await negocioConAgenda({
    servicio: { duracionMinutos: 40, bufferMinutos: 10 },
    capacidad: 3,
    franjas: [
      { dia: 1, inicio: "08:00", fin: "12:00" },
      { dia: 3, inicio: "14:00", fin: "18:00" },
    ],
    reglas: { granularidadMinutos: 15, anticipacionMinimaMinutos: 60, anticipacionMaximaDias: 30 },
  });
  // Bloqueo del martes 5-mar de 9:00 a 11:00 (hora de Bogotá) y cita del lunes 4-mar a las 9:00.
  await db()
    .insert(esquema.bloqueo)
    .values({ negocioId: n.negocioId, sedeId: n.sedeId, inicio: new Date("2030-03-05T14:00:00Z"), fin: new Date("2030-03-05T16:00:00Z") });
  const inicio = new Date("2030-03-04T14:00:00Z");
  const [cita] = await db()
    .insert(esquema.cita)
    .values({
      ...datosDeCita({
        negocioId: n.negocioId,
        sedeId: n.sedeId,
        servicioId: n.servicioId,
        recursoId: n.recursoId,
        clienteId: await crearCliente(n.negocioId),
      }),
      inicio,
      fin: new Date(inicio.getTime() + 40 * 60_000),
      ocupadoHasta: new Date(inicio.getTime() + 50 * 60_000),
    })
    .returning({ id: esquema.cita.id });
  return { ...n, citaId: cita.id };
}

const peticion = (n: { negocioId: string; sedeId: string; servicioId: string }, cambios: Partial<PeticionAgenda> = {}) => ({
  negocio: { id: n.negocioId, zonaHoraria: ZONA_HORARIA_POR_DEFECTO },
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  actor: "cliente" as const,
  ahora: AHORA,
  rango: RANGO,
  ...cambios,
});

describe("leerAgenda: contexto del motor (ARCH §10)", () => {
  test("un negocio con horario, un bloqueo y una cita produce un contexto con esas franjas, ese bloqueo y esa ocupación, en la zona del negocio", async () => {
    const n = await negocioConBloqueoYCita();

    const leida = await leerAgenda(peticion(n));

    expect(leida?.oferta).toMatchObject({ sedeId: n.sedeId, recurso: { id: n.recursoId, capacidad: 3 } });
    expect(leida?.contexto).toEqual({
      zonaHoraria: "America/Bogota",
      ahora: AHORA,
      servicio: { duracionMin: 40, bufferMin: 10 },
      capacidad: 3,
      config: { granularidadMin: 15, anticipacionMinimaMin: 60, anticipacionMaximaDias: 30 },
      franjas: [
        { dia: 1, inicio: "08:00", fin: "12:00" },
        { dia: 3, inicio: "14:00", fin: "18:00" },
      ],
      bloqueos: [{ inicio: new Date("2030-03-05T14:00:00Z"), fin: new Date("2030-03-05T16:00:00Z") }],
      ocupacion: [{ inicio: new Date("2030-03-04T14:00:00Z"), fin: new Date("2030-03-04T14:50:00Z") }],
      actor: "cliente",
    });
  });

  test("el contexto lleva el actor que recibe y el ahora inyectado (ARCH §20)", async () => {
    const n = await negocioConAgenda();
    const otroAhora = new Date("2030-02-20T12:34:56Z");

    const delDueno = await leerAgenda(peticion(n, { actor: "dueno", ahora: otroAhora }));

    expect(delDueno?.contexto.actor).toBe("dueno");
    expect(delDueno?.contexto.ahora).toEqual(otroAhora);
  });

  test("con la transacción da el mismo contexto que por HTTP", async () => {
    const n = await negocioConBloqueoYCita();
    const porHttp = await leerAgenda(peticion(n));
    const enTx = await enTransaccion((tx) => leerAgenda(peticion(n), tx));
    expect(enTx).toEqual(porHttp);
  });

  test("la cita excluida no ocupa (RN-14), y fuera del rango no se leen bloqueos ni citas", async () => {
    const n = await negocioConBloqueoYCita();

    expect((await leerAgenda(peticion(n, { citaExcluida: n.citaId })))?.contexto.ocupacion).toEqual([]);
    const otraSemana = intervaloDeDias("2030-03-11", "2030-03-17", ZONA_HORARIA_POR_DEFECTO);
    const lejos = await leerAgenda(peticion(n, { rango: otraSemana }));
    expect(lejos?.contexto.bloqueos).toEqual([]);
    expect(lejos?.contexto.ocupacion).toEqual([]);
  });

  test("si el servicio no se ofrece en la sede o es de otro negocio, devuelve null", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    expect(await leerAgenda(peticion({ ...a, servicioId: b.servicioId }))).toBeNull();
    expect(await leerAgenda(peticion({ ...a, sedeId: b.sedeId }))).toBeNull();
    expect(await leerAgenda(peticion({ ...a, servicioId: randomUUID() }))).toBeNull();
  });
});
