import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual, type EntradaCitaManual } from "@/servidor/casos-uso/cita-manual";
import { marcarAsistencia } from "@/servidor/casos-uso/marcar-asistencia";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, fijarLimite, negocioConAgenda } from "../fixtures";

// Los criterios de RN-14, RN-15, RN-25 y RN-34 con la cita manual y el movimiento, y los
// avisos de las acciones del dueño (D-01, D-11, D-20, S-05, S-06; ARCH §20). "Ahora" es
// el lunes 4-mar-2030 a las 8:35 a. m. de Bogotá; el negocio atiende de lunes a viernes de
// 8:00 a 12:00 y de 14:00 a 18:00, con un servicio de 30 minutos, capacidad 1 y las
// reglas de D-09 (anticipación mínima de 2 horas).

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-04", "08:35", BOGOTA);
const DUENO = "user_dueno_prueba";
const hora = (fecha: string, local: string) => localAUtc(fecha, local, BOGOTA).toISOString();

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

const entrada = (n: Negocio, inicio: string, cambios: Partial<EntradaCitaManual> = {}): EntradaCitaManual => ({
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "ana@mail.com",
  servicioId: n.servicioId,
  inicio,
  ...cambios,
});

const citasDe = (negocioId: string) =>
  db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId)).orderBy(asc(esquema.cita.id));
const notificacionesDe = (negocioId: string) =>
  db().select().from(esquema.notificacion).where(eq(esquema.notificacion.negocioId, negocioId));

/**
 * Un negocio con un bloqueo el martes de 9:00 a 10:00 y una cita confirmada el miércoles
 * a las 9:00, que con capacidad 1 deja esa hora sin cupo.
 */
async function negocioConObstaculos() {
  const n = await negocioConAgenda();
  await db().insert(esquema.bloqueo).values({
    negocioId: n.negocioId,
    sedeId: n.sedeId,
    inicio: new Date(hora("2030-03-05", "09:00")),
    fin: new Date(hora("2030-03-05", "10:00")),
  });
  const clienteId = await crearCliente(n.negocioId);
  const inicio = new Date(hora("2030-03-06", "09:00"));
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  await db().insert(esquema.cita).values({ ...datosDeCita({ ...n, clienteId }), inicio, fin, ocupadoHasta: fin });
  return n;
}

/** Las horas no disponibles de RN-15 en el negocio de `negocioConObstaculos`. */
const NO_DISPONIBLES: [string, string][] = [
  ["fuera del horario", hora("2030-03-04", "12:30")],
  ["sobre un bloqueo", hora("2030-03-05", "09:00")],
  ["desalineada", hora("2030-03-04", "10:15")],
  ["sin capacidad", hora("2030-03-06", "09:00")],
];

describe("cita manual y movimiento (RN-14, RN-15, RN-25, RN-34)", () => {
  test("RN-15: el dueño crea una cita para dentro de 30 minutos aunque la anticipación mínima sea de 2 horas", async () => {
    const n = await negocioConAgenda({ reglas: { anticipacionMinimaMinutos: 120 } });
    const enMediaHora = localAUtc("2030-03-04", "08:30", BOGOTA);

    const resultado = await crearCitaManual(ctx(n), entrada(n, hora("2030-03-04", "09:00")), enMediaHora);

    expect(resultado).toEqual({ ok: true, valor: expect.objectContaining({ inicio: hora("2030-03-04", "09:00") }) });
    expect((await citasDe(n.negocioId))[0]).toMatchObject({ estado: "confirmada", origen: "panel" });
  });

  test.each(NO_DISPONIBLES)(
    "RN-15, D-01: crear una cita %s devuelve HORARIO_NO_DISPONIBLE y la cita no se guarda",
    async (_caso, inicio) => {
      const n = await negocioConObstaculos();
      const antes = (await citasDe(n.negocioId)).length;

      const resultado = await crearCitaManual(ctx(n), entrada(n, inicio, { telefono: "310 555 1234" }), AHORA);

      expect(resultado).toMatchObject({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
      expect(await citasDe(n.negocioId)).toHaveLength(antes);
    },
  );

  test.each(NO_DISPONIBLES)(
    "RN-15, D-01: mover una cita %s devuelve HORARIO_NO_DISPONIBLE y la cita no cambia",
    async (_caso, inicio) => {
      const n = await negocioConObstaculos();
      const creada = await crearCitaManual(ctx(n), entrada(n, hora("2030-03-07", "09:00")), AHORA);
      if (!creada.ok) throw new Error(creada.error);
      const antes = await citasDe(n.negocioId);

      const resultado = await moverCita(ctx(n), { citaId: creada.valor.citaId, inicio, version: 1 }, AHORA);

      expect(resultado).toMatchObject({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
      expect(await citasDe(n.negocioId)).toEqual(antes);
    },
  );

  test("RN-14: después de mover, la cita conserva su identificador y no aparece ninguna cita nueva; la validación no la cuenta en su propio cupo anterior", async () => {
    const n = await negocioConAgenda({ reglas: { granularidadMinutos: 15 } });
    const creada = await crearCitaManual(ctx(n), entrada(n, hora("2030-03-04", "09:00")), AHORA);
    if (!creada.ok) throw new Error(creada.error);
    const { citaId } = creada.valor;

    // Con capacidad 1, 9:15 se solapa con la propia cita de 9:00 a 9:30: solo cabe si no se cuenta.
    const movida = await moverCita(ctx(n), { citaId, inicio: hora("2030-03-04", "09:15"), version: 1 }, AHORA);

    expect(movida).toEqual({ ok: true, valor: expect.objectContaining({ citaId, version: 2 }) });
    const citas = await citasDe(n.negocioId);
    expect(citas.map((c) => c.id)).toEqual([citaId]);
    expect(citas[0].inicio).toEqual(new Date(hora("2030-03-04", "09:15")));
  });

  test("RN-34 (ARCH §20): si el dueño mueve la cita, el cliente conserva las reprogramaciones que le quedan", async () => {
    const n = await negocioConAgenda({ reglas: { maxReprogramacionesCliente: 3 } });
    const creada = await crearCitaManual(ctx(n), entrada(n, hora("2030-03-05", "09:00")), AHORA);
    if (!creada.ok) throw new Error(creada.error);
    const { citaId } = creada.valor;
    // El cliente ya reprogramó una vez desde su link: le quedan 2.
    await db().update(esquema.cita).set({ reprogramacionesCliente: 1 }).where(eq(esquema.cita.id, citaId));

    await moverCita(ctx(n), { citaId, inicio: hora("2030-03-05", "10:00"), version: 1 }, AHORA);
    await moverCita(ctx(n), { citaId, inicio: hora("2030-03-06", "15:00"), version: 2 }, AHORA);

    const [cita] = await citasDe(n.negocioId);
    expect(cita).toMatchObject({ version: 3, reprogramacionesCliente: 1 });
  });

  test("RN-25 (Q-54): con max_appointments_per_month alcanzado, una cita manual devuelve LIMITE_PLAN y no crea nada", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_appointments_per_month", 1);
    expect((await crearCitaManual(ctx(n), entrada(n, hora("2030-03-04", "09:00")), AHORA)).ok).toBe(true);

    const resultado = await crearCitaManual(ctx(n), entrada(n, hora("2030-03-05", "09:00"), { telefono: "310 555 1234" }), AHORA);

    expect(resultado).toEqual({ ok: false, error: "LIMITE_PLAN" });
    expect(await citasDe(n.negocioId)).toHaveLength(1);
    const clientes = await db().select().from(esquema.cliente).where(eq(esquema.cliente.negocioId, n.negocioId));
    expect(clientes).toHaveLength(1);
  });

  test("S-06: ninguna acción del dueño encola avisos dueno_*; S-05: una cita sin correo no encola notificaciones al cliente", async () => {
    const n = await negocioConAgenda();
    const conCorreo = await crearCitaManual(ctx(n), entrada(n, hora("2030-03-05", "09:00")), AHORA);
    const sinCorreo = await crearCitaManual(
      ctx(n),
      entrada(n, hora("2030-03-06", "09:00"), { telefono: "310 555 1234", correo: "" }),
      AHORA,
    );
    if (!conCorreo.ok || !sinCorreo.ok) throw new Error("Las citas de prueba fallaron.");
    const con = conCorreo.valor.citaId;
    const sin = sinCorreo.valor.citaId;

    // Mover las dos, marcar la que no tiene correo y cancelar la otra.
    expect((await moverCita(ctx(n), { citaId: con, inicio: hora("2030-03-05", "10:00"), version: 1 }, AHORA)).ok).toBe(true);
    expect((await moverCita(ctx(n), { citaId: sin, inicio: hora("2030-03-06", "10:00"), version: 1 }, AHORA)).ok).toBe(true);
    const yaEmpezo = localAUtc("2030-03-06", "10:10", BOGOTA);
    expect((await marcarAsistencia(ctx(n), { citaId: sin, estado: "completada", estadoEsperado: "confirmada" }, yaEmpezo)).ok).toBe(true);
    expect((await cancelarCita(ctx(n), { citaId: con }, AHORA)).ok).toBe(true);

    const filas = await notificacionesDe(n.negocioId);
    expect(filas.filter((f) => f.tipo.startsWith("dueno_"))).toEqual([]);
    expect(filas.filter((f) => f.citaId === sin)).toEqual([]);
    // La cita con correo sí avisó al cliente: confirmación, recordatorios, reprogramación y cancelación.
    expect(new Set(filas.filter((f) => f.citaId === con).map((f) => f.tipo))).toEqual(
      new Set(["confirmacion", "recordatorio", "reprogramacion", "cancelacion"]),
    );
  });
});
