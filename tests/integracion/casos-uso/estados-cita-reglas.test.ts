import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { marcarAsistencia } from "@/servidor/casos-uso/marcar-asistencia";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Los criterios de las RN sobre los estados de la cita, con las operaciones del dueño
// (RN-12, RN-16, S-08, S-09; PRD §7). "Ahora" es el lunes 4-mar-2030 a las 8:35 a. m. de
// Bogotá; el negocio atiende de lunes a viernes de 8:00 a 12:00 y de 14:00 a 18:00, con
// un servicio de 30 minutos.

const BOGOTA = "America/Bogota";
const AHORA = localAUtc("2030-03-04", "08:35", BOGOTA);
const DUENO = "user_dueno_prueba";
const hora = (fecha: string, local: string) => localAUtc(fecha, local, BOGOTA);

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO });

/** Una cita manual a esa hora local, creada `AHORA`. */
async function cita(n: Negocio, fecha: string, local: string, telefono = "300 123 4567") {
  const creada = await crearCitaManual(
    ctx(n),
    { nombre: "Ana", apellido: "Pérez", telefono, correo: "ana@mail.com", servicioId: n.servicioId, inicio: hora(fecha, local).toISOString() },
    AHORA,
  );
  if (!creada.ok) throw new Error(`La cita de prueba falló: ${creada.error}`);
  return creada.valor.citaId;
}

const estadoDe = async (citaId: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, citaId)))[0].estado;
const estadosDel = async (negocioId: string) =>
  (await db().select({ estado: esquema.cita.estado }).from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId))).map((c) => c.estado);

describe("estados de la cita con las operaciones del dueño (PRD §7)", () => {
  test("RN-12: toda cita creada en el panel queda confirmada, y ninguna operación del dueño lleva a pendiente_pago", async () => {
    const n = await negocioConAgenda();
    const primera = await cita(n, "2030-03-04", "09:00");
    const segunda = await cita(n, "2030-03-05", "09:00", "310 555 1234");
    expect(await estadosDel(n.negocioId)).toEqual(["confirmada", "confirmada"]);

    // Moverla, marcarla, corregirla y cancelar otra: nada pasa por pendiente_pago.
    expect((await moverCita(ctx(n), { citaId: segunda, inicio: hora("2030-03-06", "10:00").toISOString(), version: 1 }, AHORA)).ok).toBe(true);
    expect(await estadoDe(segunda)).toBe("confirmada");
    const despues = hora("2030-03-04", "09:05");
    expect((await marcarAsistencia(ctx(n), { citaId: primera, estado: "completada", estadoEsperado: "confirmada" }, despues)).ok).toBe(true);
    expect((await marcarAsistencia(ctx(n), { citaId: primera, estado: "no_asistio", estadoEsperado: "completada" }, despues)).ok).toBe(true);
    expect((await cancelarCita(ctx(n), { citaId: segunda }, AHORA)).ok).toBe(true);

    const estados = await estadosDel(n.negocioId);
    expect(estados.sort()).toEqual(["cancelada", "no_asistio"]);
    expect(estados).not.toContain("pendiente_pago");
  });

  test("RN-16: antes del inicio, marcar la asistencia se rechaza; después del inicio, se aplica", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");
    const entrada = { citaId, estado: "completada", estadoEsperado: "confirmada" };

    expect(await marcarAsistencia(ctx(n), entrada, hora("2030-03-04", "08:59"))).toEqual({ ok: false, error: "ANTES_DEL_INICIO" });
    expect(await estadoDe(citaId)).toBe("confirmada");

    expect(await marcarAsistencia(ctx(n), entrada, hora("2030-03-04", "09:01"))).toEqual({ ok: true, valor: { citaId } });
    expect(await estadoDe(citaId)).toBe("completada");
  });

  test("S-08: una cita cancelada no se reactiva: marcarla, moverla o cancelarla otra vez devuelve ESTADO_INVALIDO", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");
    expect((await cancelarCita(ctx(n), { citaId }, AHORA)).ok).toBe(true);
    const despues = hora("2030-03-04", "09:10");

    expect(await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, despues)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    expect(await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "cancelada" }, despues)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    expect(await moverCita(ctx(n), { citaId, inicio: hora("2030-03-05", "09:00").toISOString(), version: 1 }, AHORA)).toEqual({
      ok: false,
      error: "ESTADO_INVALIDO",
    });
    expect(await cancelarCita(ctx(n), { citaId }, AHORA)).toEqual({ ok: false, error: "ESTADO_INVALIDO" });
    expect(await estadoDe(citaId)).toBe("cancelada");
  });

  test("S-09: el dueño corrige una cita de completada a no_asistio y de vuelta", async () => {
    const n = await negocioConAgenda();
    const citaId = await cita(n, "2030-03-04", "09:00");
    const despues = hora("2030-03-04", "10:00");

    await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "confirmada" }, despues);
    expect(await marcarAsistencia(ctx(n), { citaId, estado: "no_asistio", estadoEsperado: "completada" }, despues)).toEqual({
      ok: true,
      valor: { citaId },
    });
    expect(await estadoDe(citaId)).toBe("no_asistio");
    expect(await marcarAsistencia(ctx(n), { citaId, estado: "completada", estadoEsperado: "no_asistio" }, despues)).toEqual({
      ok: true,
      valor: { citaId },
    });
    expect(await estadoDe(citaId)).toBe("completada");

    const eventos = await db()
      .select()
      .from(esquema.eventoCita)
      .where(eq(esquema.eventoCita.citaId, citaId))
      .orderBy(asc(esquema.eventoCita.id));
    expect(eventos.filter((e) => e.tipo === "estado_corregido").map((e) => e.datos)).toEqual([
      { de: "completada", a: "no_asistio" },
      { de: "no_asistio", a: "completada" },
    ]);
  });
});
