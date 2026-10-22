import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { consultarDisponibilidad } from "@/servidor/casos-uso/disponibilidad";
import { consultarHorasDueno } from "@/servidor/casos-uso/horas-dueno";
import { desactivarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, negocioConAgenda } from "../fixtures";

// Horas libres para el dueño (PAN-04, PAN-05; D-11, RN-14, RN-15; Q-56). "Ahora" es el
// lunes 4-mar-2030 a las 8:35 a. m. de Bogotá; el negocio atiende de lunes a viernes de
// 8:00 a 12:00 y de 14:00 a 18:00, con un servicio de 30 minutos y las reglas de D-09
// (granularidad de 30 minutos, anticipación de 2 horas a 60 días).

const BOGOTA = "America/Bogota";
const LUNES = "2030-03-04";
const AHORA = localAUtc(LUNES, "08:35", BOGOTA);

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

/** Horas locales `HH:mm` del lunes, como instantes ISO. */
const horas = (...locales: string[]) => locales.map((h) => localAUtc(LUNES, h, BOGOTA).toISOString());

/** Una cita confirmada del servicio, que empieza a esa hora local del lunes. */
async function citaA(n: Negocio, hora: string, minutos = 30) {
  const clienteId = await crearCliente(n.negocioId);
  const inicio = localAUtc(LUNES, hora, BOGOTA);
  const fin = new Date(inicio.getTime() + minutos * 60 * 1000);
  const [{ id }] = await db()
    .insert(esquema.cita)
    .values({ ...datosDeCita({ ...n, clienteId }), inicio, fin, ocupadoHasta: fin })
    .returning({ id: esquema.cita.id });
  return id;
}

const consultar = (n: Negocio, fecha = LUNES, citaExcluida?: string) =>
  consultarHorasDueno({ negocioId: n.negocioId }, { servicioId: n.servicioId, fecha, citaExcluida }, AHORA);

describe("consultarHorasDueno (Q-56; D-11)", () => {
  test("con 120 minutos de anticipación mínima, ofrece las 9:00, dentro de 25 minutos, que la consulta pública no ofrece", async () => {
    const n = await negocioConAgenda();

    const dueno = await consultar(n);
    const publica = await consultarDisponibilidad(
      { slug: n.slug, sedeId: n.sedeId, servicioId: n.servicioId, desde: LUNES, hasta: LUNES },
      AHORA,
    );

    expect(dueno).toEqual({ ok: true, valor: { zonaHoraria: BOGOTA, fecha: LUNES, inicios: expect.any(Array) } });
    expect(dueno.ok && dueno.valor.inicios).toContain(horas("09:00")[0]);
    expect(publica.ok && publica.valor.dias[0].inicios).not.toContain(horas("09:00")[0]);
    expect(publica.ok && publica.valor.dias[0].inicios[0]).toBe(horas("11:00")[0]);
  });

  test("nunca ofrece una hora fuera del horario, bloqueada, sin cupo ni anterior a ahora (D-11, RN-15)", async () => {
    const n = await negocioConAgenda();
    await db().insert(esquema.bloqueo).values({
      negocioId: n.negocioId,
      sedeId: n.sedeId,
      inicio: localAUtc(LUNES, "10:00", BOGOTA),
      fin: localAUtc(LUNES, "11:00", BOGOTA),
    });
    await citaA(n, "11:00"); // capacidad 1: sin cupo a las 11:00

    const resultado = await consultar(n);

    // Ni 8:00 ni 8:30 (antes de las 8:35), ni 10:00 y 10:30 (bloqueo), ni 11:00 (sin cupo), ni la pausa.
    expect(resultado.ok && resultado.valor.inicios).toEqual(
      horas("09:00", "09:30", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"),
    );
  });

  test("un día después de la anticipación máxima tiene horas para el dueño (D-11)", async () => {
    const n = await negocioConAgenda();
    const lejano = "2030-06-03"; // lunes, 91 días después: más allá de los 60 de D-09

    const resultado = await consultar(n, lejano);

    expect(resultado.ok && resultado.valor.inicios).toHaveLength(16);
  });

  test("un sábado sin franjas no tiene horas", async () => {
    const n = await negocioConAgenda();
    expect(await consultar(n, "2030-03-09")).toEqual({
      ok: true,
      valor: { zonaHoraria: BOGOTA, fecha: "2030-03-09", inicios: [] },
    });
  });

  test("un servicio inactivo o de otro negocio devuelve NO_ENCONTRADO (RN-05, RN-01)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();

    expect(await consultarHorasDueno({ negocioId: a.negocioId }, { servicioId: b.servicioId, fecha: LUNES }, AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    await desactivarServicio({ negocioId: a.negocioId }, a.servicioId);
    expect(await consultar(a)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
  });

  test("un id que no es un uuid devuelve NO_ENCONTRADO, y una fecha inválida, DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    const ctx = { negocioId: n.negocioId };

    expect(await consultarHorasDueno(ctx, { servicioId: "x", fecha: LUNES }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await consultarHorasDueno(ctx, { servicioId: n.servicioId, fecha: LUNES, citaExcluida: "x" }, AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    for (const fecha of ["2030-02-30", "04/03/2030", "", undefined]) {
      expect(await consultarHorasDueno(ctx, { servicioId: n.servicioId, fecha }, AHORA), String(fecha)).toEqual({
        ok: false,
        error: "DATOS_INVALIDOS",
      });
    }
  });

  test("con citaExcluida vuelven la hora de esa cita y las que se solapan con ella (RN-14)", async () => {
    const n = await negocioConAgenda({ reglas: { granularidadMinutos: 15 } });
    const citaId = await citaA(n, "09:00");
    const solapadas = horas("08:45", "09:00", "09:15");

    const sinExcluir = await consultar(n);
    const excluyendo = await consultar(n, LUNES, citaId);

    for (const hora of solapadas) {
      expect(sinExcluir.ok && sinExcluir.valor.inicios).not.toContain(hora);
      expect(excluyendo.ok && excluyendo.valor.inicios).toContain(hora);
    }
  });

  test("una cita cancelada no ocupa su hora (RN-10)", async () => {
    const n = await negocioConAgenda();
    const citaId = await citaA(n, "09:00");
    await db()
      .update(esquema.cita)
      .set({ estado: "cancelada", canceladaEn: AHORA, canceladaPor: "dueno" })
      .where(eq(esquema.cita.id, citaId));

    const resultado = await consultar(n);

    expect(resultado.ok && resultado.valor.inicios).toContain(horas("09:00")[0]);
  });
});
