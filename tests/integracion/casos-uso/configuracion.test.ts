import { and, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import {
  guardarRecordatorio,
  guardarReglasReserva,
  leerConfiguracion,
  type EntradaReglas,
} from "@/servidor/casos-uso/configuracion";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda, sesionDeDueno } from "../fixtures";

// Reglas de reserva y recordatorio (PAN-15, PAN-16; RN-08, RN-21, RN-34; D-09, D-20,
// D-21). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const reglas = (cambios: Partial<EntradaReglas> = {}): EntradaReglas => ({
  granularidadMinutos: "15",
  anticipacionMinimaMinutos: "60",
  anticipacionMaximaDias: "90",
  plazoCancelacionHoras: "12",
  maxReprogramacionesCliente: "2",
  asistenciaPorDefecto: "manual",
  ...cambios,
});

async function fila(negocioId: string) {
  const [f] = await db()
    .select()
    .from(esquema.configuracionNegocio)
    .where(eq(esquema.configuracionNegocio.negocioId, negocioId));
  return f;
}

describe("leerConfiguracion", () => {
  test("un negocio nuevo tiene los valores por defecto de D-09, D-20 y D-21", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await leerConfiguracion({ negocioId })).toEqual({
      granularidadMinutos: 30,
      anticipacionMinimaMinutos: 120,
      anticipacionMaximaDias: 60,
      plazoCancelacionHoras: 24,
      recordatorioHorasAntes: 24,
      maxReprogramacionesCliente: 3,
      asistenciaPorDefecto: "completada",
    });
  });
});

describe("guardarReglasReserva", () => {
  test("cambia solo la fila de configuracion_negocio del negocio del contexto", async () => {
    const { negocioId } = await sesionDeDueno();
    const { negocioId: otro } = await sesionDeDueno();
    const otroAntes = await fila(otro);

    expect(await guardarReglasReserva({ negocioId }, reglas())).toEqual({ ok: true, valor: undefined });

    expect(await leerConfiguracion({ negocioId })).toEqual({
      granularidadMinutos: 15,
      anticipacionMinimaMinutos: 60,
      anticipacionMaximaDias: 90,
      plazoCancelacionHoras: 12,
      recordatorioHorasAntes: 24,
      maxReprogramacionesCliente: 2,
      asistenciaPorDefecto: "manual",
    });
    expect(await fila(otro)).toEqual(otroAntes);
  });

  test("el límite de reprogramaciones vacío se guarda como sin límite (NULL), y 0 como \"no se permite\" (RN-34)", async () => {
    const { negocioId } = await sesionDeDueno();

    await guardarReglasReserva({ negocioId }, reglas({ maxReprogramacionesCliente: "" }));
    expect((await fila(negocioId)).maxReprogramacionesCliente).toBeNull();

    await guardarReglasReserva({ negocioId }, reglas({ maxReprogramacionesCliente: "0" }));
    expect((await fila(negocioId)).maxReprogramacionesCliente).toBe(0);
  });

  test.each<[string, Partial<EntradaReglas>]>([
    ["una anticipación máxima de 0 días", { anticipacionMaximaDias: "0" }],
    ["una anticipación máxima de 366 días", { anticipacionMaximaDias: "366" }],
    ["una anticipación mínima negativa", { anticipacionMinimaMinutos: "-1" }],
    ["una anticipación mínima vacía", { anticipacionMinimaMinutos: "" }],
    ["un plazo de cancelación con decimales", { plazoCancelacionHoras: "1.5" }],
    ["un límite de reprogramaciones negativo", { maxReprogramacionesCliente: "-1" }],
    ["una asistencia por defecto desconocida", { asistenciaPorDefecto: "cancelada" as never }],
  ])("%s devuelve DATOS_INVALIDOS y no cambia nada", async (_, cambios) => {
    const { negocioId } = await sesionDeDueno();
    const antes = await fila(negocioId);

    expect(await guardarReglasReserva({ negocioId }, reglas(cambios))).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await fila(negocioId)).toEqual(antes);
  });
});

describe("guardarRecordatorio", () => {
  test("guarda las horas antes de la cita, y \"ninguno\" como NULL (RN-21)", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarRecordatorio({ negocioId }, { recordatorio: "2" }, new Date())).toEqual({ ok: true, valor: undefined });
    expect((await fila(negocioId)).recordatorioHorasAntes).toBe(2);

    expect(await guardarRecordatorio({ negocioId }, { recordatorio: "ninguno" }, new Date())).toEqual({ ok: true, valor: undefined });
    expect((await fila(negocioId)).recordatorioHorasAntes).toBeNull();
  });

  test.each(["0", "", "-3", "dos"])("con %j devuelve DATOS_INVALIDOS y no cambia nada", async (recordatorio) => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarRecordatorio({ negocioId }, { recordatorio }, new Date())).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect((await fila(negocioId)).recordatorioHorasAntes).toBe(24);
  });
});

// ─── Recálculo de los recordatorios (PAN-16; RN-20, RN-21, S-05, S-12; Q-23 de TASKS-02) ───

describe("guardarRecordatorio recalcula los recordatorios pendientes (Q-23 de TASKS-02)", () => {
  // Ahora es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá.
  const BOGOTA = "America/Bogota";
  const AHORA = localAUtc("2030-03-01", "10:00", BOGOTA);
  const HORA = 60 * 60 * 1000;

  type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

  /** Una cita manual a esa hora local, creada ahora, con correo o sin él. */
  async function cita(n: Negocio, fecha: string, hora: string, correo: string | null = "ana@mail.com", creadaEn = AHORA) {
    const r = await crearCitaManual(
      { negocioId: n.negocioId, clerkUserId: "user_dueno_prueba" },
      {
        nombre: "Ana",
        apellido: "Pérez",
        telefono: "300 123 4567",
        ...(correo ? { correo } : {}),
        servicioId: n.servicioId,
        inicio: localAUtc(fecha, hora, BOGOTA).toISOString(),
      },
      creadaEn,
    );
    if (!r.ok) throw new Error(`La cita de prueba falló: ${r.error}`);
    return r.valor.citaId;
  }

  const recordatoriosDe = (citaId: string) =>
    db()
      .select()
      .from(esquema.notificacion)
      .where(and(eq(esquema.notificacion.citaId, citaId), eq(esquema.notificacion.tipo, "recordatorio")));

  test("pasar de 24 a 2 horas deja los pendientes en inicio − 2 h; los enviados y los de citas pasadas o canceladas no cambian (RN-21)", async () => {
    const n = await negocioConAgenda();
    const futura = await cita(n, "2030-03-04", "09:00");
    const enviada = await cita(n, "2030-03-05", "09:00");
    await db().update(esquema.notificacion).set({ estado: "enviada", enviadaEn: AHORA }).where(eq(esquema.notificacion.citaId, enviada));
    // Una pasada (creada antes) y una cancelada, con sus recordatorios como quedaron.
    const pasada = await cita(n, "2030-02-26", "09:00", "ana@mail.com", localAUtc("2030-02-20", "10:00", BOGOTA));
    const cancelada = await cita(n, "2030-03-06", "09:00");
    await cancelarCita({ negocioId: n.negocioId, clerkUserId: "user_dueno_prueba" }, { citaId: cancelada }, AHORA);
    const antes = { enviada: await recordatoriosDe(enviada), pasada: await recordatoriosDe(pasada), cancelada: await recordatoriosDe(cancelada) };

    expect(await guardarRecordatorio({ negocioId: n.negocioId }, { recordatorio: "2" }, AHORA)).toEqual({ ok: true, valor: undefined });

    expect(await recordatoriosDe(futura)).toEqual([
      expect.objectContaining({
        estado: "pendiente",
        claveIdempotencia: `recordatorio:${futura}:v1`,
        programadaPara: new Date(localAUtc("2030-03-04", "09:00", BOGOTA).getTime() - 2 * HORA),
      }),
    ]);
    expect(await recordatoriosDe(enviada)).toEqual(antes.enviada);
    expect(await recordatoriosDe(pasada)).toEqual(antes.pasada);
    expect(await recordatoriosDe(cancelada)).toEqual(antes.cancelada);
  });

  test("de 24 horas a ninguno y de vuelta a 24, cada cita futura con correo tiene un solo recordatorio pendiente con su clave de siempre (RN-20); una sin correo, ninguno (S-05)", async () => {
    const n = await negocioConAgenda();
    const conCorreo = await cita(n, "2030-03-04", "09:00");
    const sinCorreo = await cita(n, "2030-03-04", "10:00", null);

    await guardarRecordatorio({ negocioId: n.negocioId }, { recordatorio: "ninguno" }, AHORA);
    expect((await recordatoriosDe(conCorreo)).map((r) => r.estado)).toEqual(["cancelada"]);

    await guardarRecordatorio({ negocioId: n.negocioId }, { recordatorio: "24" }, AHORA);

    expect(await recordatoriosDe(conCorreo)).toEqual([
      expect.objectContaining({
        estado: "pendiente",
        claveIdempotencia: `recordatorio:${conCorreo}:v1`,
        programadaPara: new Date(localAUtc("2030-03-04", "09:00", BOGOTA).getTime() - 24 * HORA),
        ultimoError: null,
      }),
    ]);
    expect(await recordatoriosDe(sinCorreo)).toEqual([]);
  });

  test("una cita que empieza en 5 horas no recibe recordatorio al pasar a 24 horas (S-12)", async () => {
    const n = await negocioConAgenda({ reglas: { recordatorioHorasAntes: 2 } });
    // Hoy a las 3:00 p. m.: con 2 horas, su recordatorio es a la 1:00 p. m.
    const pronto = await cita(n, "2030-03-01", "15:00");
    expect((await recordatoriosDe(pronto)).map((r) => r.estado)).toEqual(["pendiente"]);

    await guardarRecordatorio({ negocioId: n.negocioId }, { recordatorio: "24" }, AHORA);

    expect((await recordatoriosDe(pronto)).map((r) => r.estado)).toEqual(["cancelada"]);
  });
});
