import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { consultarHorasDueno } from "@/servidor/casos-uso/horas-dueno";
import { marcarAsistencia } from "@/servidor/casos-uso/marcar-asistencia";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda, type OpcionesAgenda } from "../fixtures";

// La ocupación de D-06 con las operaciones reales del dueño, y ya no por SQL (T3.24), y
// las notificaciones de los cambios (RN-10, RN-21, D-06, S-12; ARCH §14.1 y §20,
// Ocupación y Notificaciones; Q-60). El negocio atiende de lunes a viernes de 8:00 a
// 12:00 y de 14:00 a 18:00, con capacidad 1 y el recordatorio de D-09, 24 horas antes.

const BOGOTA = "America/Bogota";
const DUENO = "user_dueno_prueba";
const VIERNES = localAUtc("2030-03-01", "10:00", BOGOTA);
const hora = (fecha: string, local: string) => localAUtc(fecha, local, BOGOTA);

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** Negocio con una cita manual con correo a esa hora, creada `creadaEn`. */
async function conCita(fecha: string, local: string, creadaEn: Date, opciones: OpcionesAgenda = {}) {
  const n = await negocioConAgenda(opciones);
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com", servicioId: n.servicioId, inicio: hora(fecha, local).toISOString() },
    creadaEn,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return { n, citaId: creada.valor.citaId };
}

const horasDelDueno = async (n: Negocio, fecha: string, ahora: Date) => {
  const r = await consultarHorasDueno({ negocioId: n.negocioId }, { servicioId: n.servicioId, fecha }, ahora);
  if (!r.ok) throw new Error(r.error);
  return r.valor.inicios;
};

const notificacionesDe = async (citaId: string) =>
  (
    await db()
      .select()
      .from(esquema.notificacion)
      .where(eq(esquema.notificacion.citaId, citaId))
      .orderBy(asc(esquema.notificacion.claveIdempotencia))
  ).map((f) => ({ tipo: f.tipo, clave: f.claveIdempotencia, estado: f.estado, datos: f.datos, programadaPara: f.programadaPara }));

describe("ocupación con las operaciones del dueño (D-06; ARCH §20, Ocupación)", () => {
  test("RN-10: una cita cancelada con cancelarCita libera su cupo de inmediato: la hora vuelve a ofrecerse y se puede reservar", async () => {
    const { n, citaId } = await conCita("2030-03-04", "09:00", VIERNES);
    const nueve = hora("2030-03-04", "09:00").toISOString();
    expect(await horasDelDueno(n, "2030-03-04", VIERNES)).not.toContain(nueve);

    expect((await cancelarCita(ctx(n), { citaId }, VIERNES)).ok).toBe(true);

    expect(await horasDelDueno(n, "2030-03-04", VIERNES)).toContain(nueve);
    const reservada = await reservarCita(
      {
        slug: n.slug,
        sedeId: n.sedeId,
        servicioId: n.servicioId,
        inicio: nueve,
        nombre: "Luis",
        apellido: "Gómez",
        telefono: "310 555 1234",
        correo: "luis@mail.com",
        politicaDatosId: n.politicaId,
        aceptaPolitica: true,
      },
      VIERNES,
    );
    expect(reservada.ok).toBe(true);
  });

  test("RN-10, D-06: con capacidad 1, una cita de 9:00 de 30 minutos con 10 de buffer marcada completada a las 9:10 sigue ocupando: a las 9:10, la siguiente hora libre para el dueño es la primera alineada desde las 9:40", async () => {
    const { n, citaId } = await conCita("2030-03-04", "09:00", VIERNES, {
      servicio: { duracionMinutos: 30, bufferMinutos: 10 },
      reglas: { granularidadMinutos: 15 },
    });
    const nueveYDiez = hora("2030-03-04", "09:10");

    expect((await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, nueveYDiez)).ok).toBe(true);

    const libres = await horasDelDueno(n, "2030-03-04", nueveYDiez);
    expect(libres[0]).toBe(hora("2030-03-04", "09:45").toISOString());
    expect(libres).not.toContain(hora("2030-03-04", "09:15").toISOString());
    expect(libres).not.toContain(hora("2030-03-04", "09:30").toISOString());
  });
});

describe("notificaciones de los cambios (ARCH §14.1; ARCH §20, Notificaciones; Q-60)", () => {
  test("el recordatorio se anula al cancelar", async () => {
    const { n, citaId } = await conCita("2030-03-06", "09:00", VIERNES);

    await cancelarCita(ctx(n), { citaId }, VIERNES);

    const filas = await notificacionesDe(citaId);
    expect(filas.find((f) => f.tipo === "recordatorio")).toMatchObject({ clave: `recordatorio:${citaId}:v1`, estado: "cancelada" });
  });

  test("el recordatorio se rehace al mover, con la clave de la nueva versión; si su nuevo momento ya pasó, no se crea (S-12)", async () => {
    const { n, citaId } = await conCita("2030-03-06", "09:00", VIERNES);

    // Al jueves a las 3:00 p. m.: el nuevo recordatorio es para el miércoles a las 3:00 p. m.
    await moverCita(ctx(n), { citaId, inicio: hora("2030-03-07", "15:00").toISOString(), version: 1 }, VIERNES);
    let recordatorios = (await notificacionesDe(citaId)).filter((f) => f.tipo === "recordatorio");
    expect(recordatorios).toEqual([
      expect.objectContaining({ clave: `recordatorio:${citaId}:v1`, estado: "cancelada" }),
      expect.objectContaining({
        clave: `recordatorio:${citaId}:v2`,
        estado: "pendiente",
        datos: { version: 2 },
        programadaPara: hora("2030-03-06", "15:00"),
      }),
    ]);

    // El jueves a las 2:00 p. m. se mueve a las 4:00 p. m. del mismo día: el recordatorio de 24 horas ya pasó.
    const jueves = hora("2030-03-07", "14:00");
    await moverCita(ctx(n), { citaId, inicio: hora("2030-03-07", "16:00").toISOString(), version: 2 }, jueves);
    recordatorios = (await notificacionesDe(citaId)).filter((f) => f.tipo === "recordatorio");
    expect(recordatorios.map((f) => [f.clave, f.estado])).toEqual([
      [`recordatorio:${citaId}:v1`, "cancelada"],
      [`recordatorio:${citaId}:v2`, "cancelada"],
    ]);
  });

  test("mover encola C-04 con la clave reprogramacion:{citaId}:v2 y la hora anterior en datos; cancelar encola C-03 con cancelacion:{citaId}", async () => {
    const { n, citaId } = await conCita("2030-03-06", "09:00", VIERNES);

    await moverCita(ctx(n), { citaId, inicio: hora("2030-03-07", "15:00").toISOString(), version: 1 }, VIERNES);
    await cancelarCita(ctx(n), { citaId }, VIERNES);

    const filas = await notificacionesDe(citaId);
    expect(filas.find((f) => f.tipo === "reprogramacion")).toMatchObject({
      clave: `reprogramacion:${citaId}:v2`,
      estado: "pendiente",
      datos: { version: 2, inicio_anterior: hora("2030-03-06", "09:00").toISOString() },
      programadaPara: VIERNES,
    });
    expect(filas.find((f) => f.tipo === "cancelacion")).toMatchObject({
      clave: `cancelacion:${citaId}`,
      estado: "pendiente",
      programadaPara: VIERNES,
    });
  });
});
