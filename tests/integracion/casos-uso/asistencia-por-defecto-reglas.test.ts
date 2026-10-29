import { and, asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { correrCron, tareasDelCron } from "@/servidor/casos-uso/cron";
import { marcarAsistencia } from "@/servidor/casos-uso/marcar-asistencia";
import { registrarPago, suspenderNegocio } from "@/servidor/casos-uso/suscripcion-admin";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import type { ProveedorCorreo } from "@/servidor/notificaciones/proveedor";
import { ADMIN_PRUEBA, negocioConAgenda, type OpcionesAgenda } from "../fixtures";

// La asistencia por defecto con el cron cada 5 minutos (RN-16, D-14, D-21, S-09; ARCH §14.4
// y §20, Asistencia por defecto; T6.37). Corre en el proyecto `integracion-global`, de a un
// archivo, porque el cron actúa sobre todos los negocios. Las citas son del lunes
// 3-may-2027, anterior a los datos de los demás archivos del proyecto (2028 en adelante),
// así las corridas de aquí solo ven lo de esta prueba. Las citas no llevan correo y los
// negocios quedan en prueba o pagados hasta 2099: no queda nada pendiente ni por vencer
// para los demás archivos.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const BOGOTA = "America/Bogota";
const MINUTO = 60 * 1000;
const local = (hora: string) => localAUtc("2027-05-03", hora, BOGOTA);
const CREADA_EN = localAUtc("2027-04-28", "10:00", BOGOTA);
const DUENO = "user_dueno_prueba";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.example.com");
  vi.stubEnv("CORREO_CUENTA", "cuenta@agenda.example.com");
  vi.stubEnv("CORREO_SOPORTE", "soporte@agenda.example.com");
  vi.stubEnv("NOMBRE_PRODUCTO", "Agenda de citas");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Solo el C-08 de la suspensión a mano: las citas no llevan correo. */
const proveedor: ProveedorCorreo = { enviar: async () => ({ ok: true, mensajeId: "msg_prueba" }) };

/** Una corrida del cron; falla la prueba si alguna tarea falla. */
async function cron(ahora: number) {
  expect((await correrCron(new Date(ahora), tareasDelCron(() => proveedor))).ok).toBe(true);
}

/** El cron cada 5 minutos, desde `primera` mientras no pase de `hasta`. */
async function cronCada5Minutos(primera: number, hasta: number) {
  for (let t = primera; t <= hasta; t += 5 * MINUTO) await cron(t);
}

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** Una cita de 30 minutos que el dueño crea en el panel, sin correo del cliente (S-05). */
async function citaDelPanel(n: Negocio, hora: string) {
  const r = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", servicioId: n.servicioId, inicio: local(hora).toISOString() },
    CREADA_EN,
  );
  if (!r.ok) throw new Error(`La cita de prueba falló: ${r.error}`);
  return r.valor.citaId;
}

async function conCita(opciones: OpcionesAgenda = {}) {
  const n = await negocioConAgenda(opciones);
  return { n, citaId: await citaDelPanel(n, "09:00") };
}

const estadoDe = async (citaId: string) =>
  (await db().select({ estado: esquema.cita.estado }).from(esquema.cita).where(eq(esquema.cita.id, citaId)))[0].estado;

const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));

const pendientes = (negocioId: string) =>
  db()
    .select({ tipo: esquema.notificacion.tipo })
    .from(esquema.notificacion)
    .where(and(eq(esquema.notificacion.negocioId, negocioId), eq(esquema.notificacion.estado, "pendiente")));

describe("RN-16 y D-21: la asistencia por defecto con el cron", () => {
  test("con «asistió» por defecto, una cita de 9:00 a 9:30 sin marcar queda completada a más tardar a las 9:35, con el autor «sistema»", async () => {
    const n = await negocioConAgenda();
    // Dos fases del cron: una corrida justo al fin de la cita y otra 1 ms antes (la peor).
    const casos = [
      { citaId: await citaDelPanel(n, "09:00"), fin: local("09:30").getTime(), fase: 0 },
      { citaId: await citaDelPanel(n, "10:00"), fin: local("10:30").getTime(), fase: 5 * MINUTO - 1 },
    ];

    for (const { citaId, fin, fase } of casos) {
      await cronCada5Minutos(fin - 10 * MINUTO + fase, fin + 10 * MINUTO);

      expect(await estadoDe(citaId)).toBe("completada");
      const [creada, completada, ...otros] = await eventosDe(citaId);
      expect(creada).toMatchObject({ tipo: "creada", actor: "dueno" });
      expect(completada).toMatchObject({ tipo: "completada", actor: "sistema", actorId: null, datos: { automatica: true } });
      expect(otros).toEqual([]);
      // El evento lleva la hora de la corrida que la marcó: entre el fin y 5 minutos después.
      const atraso = completada.creadoEn.getTime() - fin;
      expect(atraso).toBeGreaterThanOrEqual(0);
      expect(atraso).toBeLessThan(5 * MINUTO);
    }
  });

  test("con «siempre decido yo», sigue confirmada hasta que el dueño la marque", async () => {
    const { n, citaId } = await conCita({ reglas: { asistenciaPorDefecto: "manual" } });

    for (const ahora of [local("09:35"), local("12:00"), localAUtc("2027-05-04", "09:00", BOGOTA)]) await cron(ahora.getTime());
    expect(await estadoDe(citaId)).toBe("confirmada");

    const marcada = await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, localAUtc("2027-05-04", "09:05", BOGOTA));

    expect(marcada.ok).toBe(true);
    expect(await estadoDe(citaId)).toBe("completada");
    expect((await eventosDe(citaId)).map((e) => [e.tipo, e.actor])).toEqual([
      ["creada", "dueno"],
      ["completada", "dueno"],
    ]);
  });

  test("con el negocio suspendido no cambia; la primera corrida después de reactivarlo la marca, y el dueño la corrige a no_asistio (D-14, S-09)", async () => {
    const { n, citaId } = await conCita();
    expect((await suspenderNegocio({ negocioId: n.negocioId }, ADMIN_PRUEBA)).ok).toBe(true);

    await cronCada5Minutos(local("09:30").getTime(), local("10:00").getTime());
    expect(await estadoDe(citaId)).toBe("confirmada");

    expect((await registrarPago({ negocioId: n.negocioId, pagadoHasta: "2099-12-31" }, ADMIN_PRUEBA)).ok).toBe(true);
    await cron(local("10:05").getTime());

    expect(await estadoDe(citaId)).toBe("completada");
    const corregida = await marcarAsistencia(ctx(n), { citaId, estado: "no_asistio", estadoEsperado: "completada" }, local("10:30"));

    expect(corregida.ok).toBe(true);
    expect(await estadoDe(citaId)).toBe("no_asistio");
    expect((await eventosDe(citaId)).map((e) => [e.tipo, e.actor, e.creadoEn, e.datos])).toEqual([
      ["creada", "dueno", expect.any(Date), {}],
      ["completada", "sistema", local("10:05"), { automatica: true }],
      ["estado_corregido", "dueno", expect.any(Date), { de: "completada", a: "no_asistio" }],
    ]);
    // El C-08 de la suspensión ya salió: no queda nada pendiente para los demás archivos.
    expect(await pendientes(n.negocioId)).toEqual([]);
  });
});
