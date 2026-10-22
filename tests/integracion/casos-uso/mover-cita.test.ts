import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda, type OpcionesAgenda } from "../fixtures";

// Mover una cita (PAN-05, F-07; RN-14, RN-34, D-11, D-20, S-06; Q-55, Q-60). "Ahora" es
// el lunes 4-mar-2030 a las 8:35 a. m. de Bogotá; el negocio atiende de lunes a viernes
// de 8:00 a 12:00 y de 14:00 a 18:00, con un servicio de 30 minutos, capacidad 1 y las
// reglas de D-09 (recordatorio 24 horas antes).

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-04", "08:35", BOGOTA);
const DUENO = "user_dueno_prueba";
const hora = (fecha: string, local: string) => localAUtc(fecha, local, BOGOTA).toISOString();
const MIERCOLES_9AM = hora("2030-03-06", "09:00");

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** Negocio con una cita manual del miércoles a las 9:00, con correo. */
async function conCita(opciones: OpcionesAgenda = {}) {
  const n = await negocioConAgenda(opciones);
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", correo: "ana@mail.com", servicioId: n.servicioId, inicio: MIERCOLES_9AM },
    AHORA,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return { n, citaId: creada.valor.citaId, codigo: creada.valor.codigo };
}

const citasDe = (negocioId: string) =>
  db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId)).orderBy(asc(esquema.cita.creadoEn));
const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));
const notificacionesDe = (citaId: string) =>
  db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId)).orderBy(asc(esquema.notificacion.creadoEn));

/** Todo lo que mover puede cambiar, para comparar antes y después. */
const estadoDe = async (n: Negocio, citaId: string) => ({
  citas: await citasDe(n.negocioId),
  eventos: await eventosDe(citaId),
  notificaciones: await notificacionesDe(citaId),
});

describe("moverCita (PAN-05)", () => {
  test("la cita conserva su id, su código y su servicio, no aparece otra, version sube en 1 y reprogramaciones_cliente no cambia (RN-14, RN-34, D-20)", async () => {
    const { n, citaId, codigo } = await conCita();
    await db().update(esquema.cita).set({ reprogramacionesCliente: 2 }).where(eq(esquema.cita.id, citaId));
    const nueva = hora("2030-03-07", "15:00");

    const resultado = await moverCita(ctx(n), { citaId, inicio: nueva, version: "1" }, AHORA);

    expect(resultado).toEqual({ ok: true, valor: { citaId, inicio: nueva, fin: hora("2030-03-07", "15:30"), version: 2 } });
    const citas = await citasDe(n.negocioId);
    expect(citas).toHaveLength(1);
    expect(citas[0]).toMatchObject({
      id: citaId,
      codigo,
      servicioId: n.servicioId,
      estado: "confirmada",
      inicio: new Date(nueva),
      fin: new Date(hora("2030-03-07", "15:30")),
      ocupadoHasta: new Date(hora("2030-03-07", "15:30")),
      version: 2,
      reprogramacionesCliente: 2,
    });
  });

  test("deja el evento reprogramada del dueño, anula el recordatorio, crea el de la versión 2 y encola C-04 sin C-06 (Q-55, Q-60, S-06)", async () => {
    const { n, citaId } = await conCita();
    const nueva = hora("2030-03-07", "15:00");

    await moverCita(ctx(n), { citaId, inicio: nueva, version: 1 }, AHORA);

    expect((await eventosDe(citaId)).map((e) => [e.tipo, e.actor, e.actorId, e.datos])).toEqual([
      ["creada", "dueno", DUENO, {}],
      ["reprogramada", "dueno", DUENO, { inicio_anterior: MIERCOLES_9AM, inicio_nuevo: nueva }],
    ]);
    const filas = (await notificacionesDe(citaId)).sort((a, b) => a.claveIdempotencia.localeCompare(b.claveIdempotencia));
    expect(filas.map((f) => [f.tipo, f.claveIdempotencia, f.estado])).toEqual([
      ["confirmacion", `confirmacion:${citaId}`, "pendiente"],
      ["recordatorio", `recordatorio:${citaId}:v1`, "cancelada"],
      ["recordatorio", `recordatorio:${citaId}:v2`, "pendiente"],
      ["reprogramacion", `reprogramacion:${citaId}:v2`, "pendiente"],
    ]);
    expect(filas[2]).toMatchObject({ datos: { version: 2 }, programadaPara: localAUtc("2030-03-06", "15:00", BOGOTA) });
    expect(filas[3]).toMatchObject({
      destinatario: "ana@mail.com",
      datos: { version: 2, inicio_anterior: MIERCOLES_9AM },
      programadaPara: AHORA,
    });
    const delNegocio = await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.negocioId, n.negocioId));
    expect(delNegocio.filter((f) => f.tipo.startsWith("dueno_"))).toEqual([]);
  });

  test("con capacidad 1, mover 15 minutos más tarde una cita de 30 minutos se acepta: no ocupa su propio cupo (RN-14)", async () => {
    const { n, citaId } = await conCita({ reglas: { granularidadMinutos: 15 } });

    const resultado = await moverCita(ctx(n), { citaId, inicio: hora("2030-03-06", "09:15"), version: 1 }, AHORA);

    expect(resultado.ok).toBe(true);
  });

  test("una version vieja devuelve CONFLICTO_VERSION y no cambia nada (Q-55)", async () => {
    const { n, citaId } = await conCita();
    expect((await moverCita(ctx(n), { citaId, inicio: hora("2030-03-07", "15:00"), version: 1 }, AHORA)).ok).toBe(true);
    const antes = await estadoDe(n, citaId);

    expect(await moverCita(ctx(n), { citaId, inicio: hora("2030-03-08", "10:00"), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "CONFLICTO_VERSION",
    });
    expect(await estadoDe(n, citaId)).toEqual(antes);
  });

  test("una cita cancelada devuelve ESTADO_INVALIDO y no cambia nada (S-08)", async () => {
    const { n, citaId } = await conCita();
    await db()
      .update(esquema.cita)
      .set({ estado: "cancelada", canceladaEn: AHORA, canceladaPor: "dueno" })
      .where(eq(esquema.cita.id, citaId));
    const antes = await estadoDe(n, citaId);

    expect(await moverCita(ctx(n), { citaId, inicio: hora("2030-03-07", "15:00"), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    expect(await estadoDe(n, citaId)).toEqual(antes);
  });

  test("una hora no disponible devuelve HORARIO_NO_DISPONIBLE con sus motivos y no cambia nada (RN-15)", async () => {
    const { n, citaId } = await conCita();
    const antes = await estadoDe(n, citaId);

    expect(await moverCita(ctx(n), { citaId, inicio: hora("2030-03-06", "12:30"), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "HORARIO_NO_DISPONIBLE",
      motivos: ["FUERA_DE_HORARIO"],
    });
    expect(await moverCita(ctx(n), { citaId, inicio: hora("2030-03-04", "08:00"), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "HORARIO_NO_DISPONIBLE",
      motivos: ["ANTICIPACION"],
    });
    expect(await estadoDe(n, citaId)).toEqual(antes);
  });

  test("una cita de otro negocio o un id que no es un uuid devuelven NO_ENCONTRADO, y la cita no cambia (RN-01)", async () => {
    const { n, citaId } = await conCita();
    const otro = await negocioConAgenda();
    const antes = await estadoDe(n, citaId);

    expect(await moverCita(ctx(otro), { citaId, inicio: hora("2030-03-07", "15:00"), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    expect(await moverCita(ctx(n), { citaId: "x", inicio: hora("2030-03-07", "15:00"), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "NO_ENCONTRADO",
    });
    expect(await estadoDe(n, citaId)).toEqual(antes);
  });

  test("la misma hora que ya tiene o una entrada mal formada devuelven DATOS_INVALIDOS sin cambiar nada", async () => {
    const { n, citaId } = await conCita();
    const antes = await estadoDe(n, citaId);

    expect(await moverCita(ctx(n), { citaId, inicio: MIERCOLES_9AM, version: 1 }, AHORA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await moverCita(ctx(n), { citaId, inicio: "mañana", version: 1 }, AHORA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await moverCita(ctx(n), { citaId, inicio: MIERCOLES_9AM, version: 0 }, AHORA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await estadoDe(n, citaId)).toEqual(antes);
  });
});
