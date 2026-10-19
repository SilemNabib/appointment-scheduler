import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { limite } from "@/servidor/planes/acceso";
import { fijarLimite, negocioConAgenda } from "../fixtures";

// La reserva frente al estado de la suscripción y a los límites del plan (RN-04, RN-25,
// RN-29, RN-31; Q-29). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; cada
// reserva es a otra media hora del lunes 4-mar-2030. El negocio de prueba tiene el plan
// `ilimitado` (RN-26).

const AHORA = new Date("2030-03-01T15:00:00Z");
const HORAS = ["08:00", "08:30", "09:00", "09:30"].map((h) => new Date(`2030-03-04T${h}:00-05:00`).toISOString());

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const reserva = (n: Negocio, turno: number): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  inicio: HORAS[turno],
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "ana@mail.com",
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
});

const citasDe = (negocioId: string) => db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

describe("reservarCita y la suscripción (RN-04, RN-29, RN-31)", () => {
  test("con el negocio suspendido y el plan ilimitado, el servidor rechaza una reserva directa con NEGOCIO_SUSPENDIDO (RN-04, RN-29)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    expect(await limite(n.negocioId, "max_appointments_per_month")).toBeNull(); // ilimitado

    expect(await reservarCita(reserva(n, 0), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
    expect(await citasDe(n.negocioId)).toEqual([]);
  });

  test("con la gracia terminada, aunque el cron no lo haya suspendido, también se rechaza (RN-31)", async () => {
    // Venció el 20-feb: la gracia terminó el 23-feb.
    const n = await negocioConAgenda({ suscripcion: { finPrueba: new Date("2030-02-20T05:00:00Z") } });
    expect(await reservarCita(reserva(n, 0), AHORA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
  });

  test('en el período de gracia, la reserva funciona (RN-31: "todo funciona")', async () => {
    // Venció el 27-feb a las 00:00: hoy, 1-mar, sigue en gracia hasta el 2-mar.
    const n = await negocioConAgenda({
      suscripcion: { estadoSuscripcion: "activa", pagadoHasta: new Date("2030-02-27T05:00:00Z") },
    });
    expect((await reservarCita(reserva(n, 0), AHORA)).ok).toBe(true);
    expect(await citasDe(n.negocioId)).toHaveLength(1);
  });
});

describe("reservarCita y max_appointments_per_month (RN-25; Q-29)", () => {
  test("con max_appointments_per_month alcanzado, una reserva directa devuelve LIMITE_PLAN (RN-25)", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_appointments_per_month", 1);

    expect((await reservarCita(reserva(n, 0), AHORA)).ok).toBe(true);
    expect(await reservarCita(reserva(n, 1), AHORA)).toEqual({ ok: false, error: "LIMITE_PLAN" });
    expect(await citasDe(n.negocioId)).toHaveLength(1);
  });

  test("las citas canceladas del mes también cuentan (Q-29)", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_appointments_per_month", 2);
    const primera = await reservarCita(reserva(n, 0), AHORA);
    if (!primera.ok) throw new Error(primera.error);
    await db()
      .update(esquema.cita)
      .set({ estado: "cancelada", canceladaEn: AHORA, canceladaPor: "cliente" })
      .where(eq(esquema.cita.id, primera.valor.citaId));

    expect((await reservarCita(reserva(n, 1), AHORA)).ok).toBe(true); // 1 creada (cancelada) < 2
    expect(await reservarCita(reserva(n, 2), AHORA)).toEqual({ ok: false, error: "LIMITE_PLAN" }); // 2 creadas
  });

  test("solo cuentan las citas creadas en el mes calendario local de ahora (ARCH §9, regla 5)", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_appointments_per_month", 1);
    // Creada el 28-feb a las 7:00 p. m. de Bogotá, que en UTC ya es el 1-mar: cuenta para febrero.
    const enFebrero = new Date("2030-03-01T00:00:00Z");
    expect((await reservarCita(reserva(n, 0), enFebrero)).ok).toBe(true);

    expect((await reservarCita(reserva(n, 1), AHORA)).ok).toBe(true); // la primera de marzo
    expect(await reservarCita(reserva(n, 2), AHORA)).toEqual({ ok: false, error: "LIMITE_PLAN" });
  });
});
