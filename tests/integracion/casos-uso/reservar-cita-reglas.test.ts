import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { intervaloDeDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { consultarDisponibilidad } from "@/servidor/casos-uso/disponibilidad";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { desactivarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// La reserva aplica las mismas reglas que la consulta y crea la cita como pide el PRD
// (RN-05, RN-09, RN-12). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá;
// el negocio atiende de lunes a viernes de 8:00 a 12:00 y de 14:00 a 18:00.

const AHORA = new Date("2030-03-01T15:00:00Z");
const LUNES = "2030-03-04";
const a = (hora: string, fecha = LUNES) => new Date(`${fecha}T${hora}:00-05:00`).toISOString();

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const reserva = (n: Negocio, inicio: string, cliente = 1): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  inicio,
  nombre: `Cliente ${cliente}`,
  apellido: "Prueba",
  telefono: `310 000 ${4000 + cliente}`,
  correo: `reglas${cliente}@mail.com`,
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
});

const consulta = (n: Negocio, fecha = LUNES) =>
  consultarDisponibilidad({ slug: n.slug, sedeId: n.sedeId, servicioId: n.servicioId, desde: fecha, hasta: fecha }, AHORA);

async function ofrecidas(n: Negocio, fecha = LUNES) {
  const resultado = await consulta(n, fecha);
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.dias.flatMap((d) => d.inicios);
}

const citasDe = (negocioId: string) => db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

describe("reservarCita aplica las reglas de la consulta (RN-09)", () => {
  test("una hora que la consulta no ofrece (fuera del horario, bloqueada o desalineada) tampoco se puede reservar con una solicitud directa (RN-09)", async () => {
    const n = await negocioConAgenda();
    // Bloqueo del lunes de 10:00 a 11:00.
    await db()
      .insert(esquema.bloqueo)
      .values({ negocioId: n.negocioId, sedeId: n.sedeId, inicio: new Date(a("10:00")), fin: new Date(a("11:00")) });
    const lista = await ofrecidas(n);
    const casos = {
      "fuera del horario": a("12:30"),
      "en la última media hora que no cabe": a("18:00"),
      bloqueada: a("10:30"),
      desalineada: a("09:15"),
    };

    for (const [que, inicio] of Object.entries(casos)) {
      expect(lista, que).not.toContain(inicio);
      expect(await reservarCita(reserva(n, inicio), AHORA), que).toEqual({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
    }
    // Una hora que sí se ofrece, sí se reserva.
    expect(lista).toContain(a("09:00"));
    expect((await reservarCita(reserva(n, a("09:00")), AHORA)).ok).toBe(true);
    expect(await citasDe(n.negocioId)).toHaveLength(1);
  });

  test("un día bloqueado completo no se ofrece y ninguna de sus horas se puede reservar (RN-07, RN-09)", async () => {
    const n = await negocioConAgenda();
    await db()
      .insert(esquema.bloqueo)
      .values({ negocioId: n.negocioId, sedeId: n.sedeId, ...intervaloDeDias(LUNES, LUNES, ZONA_HORARIA_POR_DEFECTO) });

    expect(await ofrecidas(n)).toEqual([]);
    for (const hora of ["08:00", "11:30", "14:00", "17:30"]) {
      expect(await reservarCita(reserva(n, a(hora)), AHORA)).toEqual({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
    }
  });
});

describe("servicio inactivo (RN-05)", () => {
  test("un servicio inactivo no aparece en la disponibilidad ni admite reservas nuevas, y sus citas existentes se conservan (RN-05)", async () => {
    const n = await negocioConAgenda();
    const reservada = await reservarCita(reserva(n, a("09:00")), AHORA);
    if (!reservada.ok) throw new Error(reservada.error);

    const desactivado = await desactivarServicio({ negocioId: n.negocioId }, n.servicioId);
    expect(desactivado.ok).toBe(true);

    expect(await consulta(n)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await reservarCita(reserva(n, a("10:00"), 2), AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await citasDe(n.negocioId)).toEqual([
      expect.objectContaining({ id: reservada.valor.citaId, estado: "confirmada", servicioId: n.servicioId }),
    ]);
  });
});

describe("estado de las citas nuevas (RN-12)", () => {
  test("toda cita creada queda confirmada (RN-12)", async () => {
    const n = await negocioConAgenda();
    const horas = [a("08:00"), a("11:30"), a("14:00"), a("09:00", "2030-03-05")];
    for (const [i, inicio] of horas.entries()) {
      expect((await reservarCita(reserva(n, inicio, i), AHORA)).ok).toBe(true);
    }

    const citas = await citasDe(n.negocioId);
    expect(citas).toHaveLength(horas.length);
    expect(citas.map((c) => c.estado)).toEqual(Array(horas.length).fill("confirmada"));
  });
});
