import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Cancelar una cita, rama del dueño (PAN-06, F-07; RN-10, RN-15, S-06, S-08; Q-55,
// Q-60). "Ahora" es el lunes 4-mar-2030 a las 8:35 a. m. de Bogotá; el negocio tiene el
// recordatorio de D-09, 24 horas antes.

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-04", "08:35", BOGOTA);
const DUENO = "user_dueno_prueba";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** Una cita manual con correo, a esa hora local, creada `creadaEn`. */
async function cita(n: Negocio, fecha: string, hora: string, creadaEn = AHORA, correo = "ana@mail.com") {
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo, servicioId: n.servicioId, inicio: localAUtc(fecha, hora, BOGOTA).toISOString() },
    creadaEn,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return creada.valor.citaId;
}

const citaPorId = async (id: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, id)))[0];
const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));
const notificacionesDe = (citaId: string) =>
  db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId));

describe("cancelarCita del dueño (PAN-06)", () => {
  test("el dueño cancela una cita que empieza en una hora (RN-15): queda cancelada por el dueño, el recordatorio pasa a cancelada y C-03 queda encolado con la clave cancelacion:{citaId}", async () => {
    const n = await negocioConAgenda();
    // Creada el viernes, con su recordatorio para el domingo; ahora es el lunes a las 8:35 y empieza a las 9:30.
    const citaId = await cita(n, "2030-03-04", "09:30", localAUtc("2030-03-01", "10:00", BOGOTA));

    expect(await cancelarCita(ctx(n), { citaId }, AHORA)).toEqual({ ok: true, valor: { citaId } });

    expect(await citaPorId(citaId)).toMatchObject({ estado: "cancelada", canceladaEn: AHORA, canceladaPor: "dueno" });
    expect((await eventosDe(citaId)).map((e) => [e.tipo, e.actor, e.actorId, e.datos])).toEqual([
      ["creada", "dueno", DUENO, {}],
      ["cancelada", "dueno", DUENO, {}],
    ]);
    const filas = await notificacionesDe(citaId);
    expect(filas.find((f) => f.tipo === "recordatorio")).toMatchObject({ estado: "cancelada" });
    expect(filas.find((f) => f.tipo === "cancelacion")).toMatchObject({
      destinatario: "ana@mail.com",
      claveIdempotencia: `cancelacion:${citaId}`,
      programadaPara: AHORA,
      estado: "pendiente",
    });
    // Sin avisos al dueño (S-06).
    const delNegocio = await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.negocioId, n.negocioId));
    expect(delNegocio.filter((f) => f.tipo.startsWith("dueno_"))).toEqual([]);
  });

  test("también cancela una cita que ya empezó (Q-55)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");

    expect((await cancelarCita(ctx(n), { citaId }, localAUtc("2030-03-04", "09:10", BOGOTA))).ok).toBe(true);
  });

  test("cancelarla otra vez devuelve ESTADO_INVALIDO y no crea otro evento ni otra notificación (ARCH §18.4: dobles clics)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-06", "09:00");
    await cancelarCita(ctx(n), { citaId }, AHORA);
    const antes = { cita: await citaPorId(citaId), eventos: await eventosDe(citaId), notificaciones: await notificacionesDe(citaId) };

    expect(await cancelarCita(ctx(n), { citaId }, new Date(AHORA.getTime() + 1000))).toEqual({ ok: false, error: "ESTADO_INVALIDO" });

    expect({ cita: await citaPorId(citaId), eventos: await eventosDe(citaId), notificaciones: await notificacionesDe(citaId) }).toEqual(antes);
  });

  test("una cita completada no se cancela (Q-55)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");
    await db().update(esquema.cita).set({ estado: "completada" }).where(eq(esquema.cita.id, citaId));

    expect(await cancelarCita(ctx(n), { citaId }, AHORA)).toEqual({ ok: false, error: "ESTADO_INVALIDO" });
    expect(await citaPorId(citaId)).toMatchObject({ estado: "completada", canceladaEn: null });
  });

  test("sin correo no encola C-03 (S-05)", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-06", "09:00", AHORA, "");

    await cancelarCita(ctx(n), { citaId }, AHORA);

    expect(await notificacionesDe(citaId)).toEqual([]);
  });

  test("una cita de otro negocio o un id que no es un uuid devuelven NO_ENCONTRADO, y la cita no cambia (RN-01)", async () => {
    const n = await negocioConAgenda();
    const otro = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-06", "09:00");

    expect(await cancelarCita(ctx(otro), { citaId }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await cancelarCita(ctx(n), { citaId: "x" }, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await cancelarCita(ctx(n), {}, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await citaPorId(citaId)).toMatchObject({ estado: "confirmada" });
  });
});
