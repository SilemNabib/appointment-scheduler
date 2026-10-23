import { asc, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { historialDeCita } from "@/dominio/historial-cita";
import { localAUtc } from "@/dominio/tiempo";
import { aplicarAsistenciaPorDefecto } from "@/servidor/casos-uso/asistencia-por-defecto";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as citas from "@/servidor/db/repositorios/citas";
import { negocioConAgenda, type OpcionesAgenda } from "../fixtures";

// aplicarAsistenciaPorDefecto (RN-16, D-14, D-21; F-08; ARCH §14.4; Q-55 de TASKS-05,
// Q-75). Corre en el proyecto `integracion-global`, porque marca citas de todos los
// negocios. La cita es el lunes 6-may-2030 de 9:00 a 9:30 a. m. de Bogotá.

const BOGOTA = "America/Bogota";
const INICIO = localAUtc("2030-05-06", "09:00", BOGOTA);
const FIN = localAUtc("2030-05-06", "09:30", BOGOTA);
const CREADA_EN = localAUtc("2030-05-01", "10:00", BOGOTA);

async function citaDel(opciones: OpcionesAgenda = {}) {
  const n = await negocioConAgenda(opciones);
  const r = await crearCitaManual(
    { negocioId: n.negocioId, clerkUserId: "user_dueno_prueba" },
    { nombre: "Ana", apellido: "Pérez", telefono: "300 123 4567", servicioId: n.servicioId, inicio: INICIO.toISOString() },
    CREADA_EN,
  );
  if (!r.ok) throw new Error(`La cita de prueba falló: ${r.error}`);
  return { n, citaId: r.valor.citaId };
}

const citaPorId = async (id: string) => (await db().select().from(esquema.cita).where(eq(esquema.cita.id, id)))[0];
const eventosDe = (citaId: string) =>
  db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, citaId)).orderBy(asc(esquema.eventoCita.id));

describe("aplicarAsistenciaPorDefecto (D-21)", () => {
  test("una cita terminada y no marcada queda completada, con el evento del sistema; una que no termina, no cambia", async () => {
    const { n, citaId } = await citaDel();

    await aplicarAsistenciaPorDefecto(new Date(FIN.getTime() - 1));
    expect((await citaPorId(citaId)).estado).toBe("confirmada");

    await aplicarAsistenciaPorDefecto(FIN);

    expect((await citaPorId(citaId)).estado).toBe("completada");
    const eventos = await eventosDe(citaId);
    expect(eventos.map((e) => [e.tipo, e.actor, e.actorId, e.datos])).toEqual([
      ["creada", "dueno", "user_dueno_prueba", {}],
      ["completada", "sistema", null, { automatica: true }],
    ]);
    // El historial del panel la muestra como marcada automáticamente (T5.13).
    const historial = historialDeCita(await citas.eventos(n.negocioId, citaId), BOGOTA);
    expect(historial.map((l) => l.texto)).toContain("Marcada automáticamente como asistió");
  });

  test("con no_asistio por defecto, queda no_asistio", async () => {
    const { citaId } = await citaDel({ reglas: { asistenciaPorDefecto: "no_asistio" } });

    await aplicarAsistenciaPorDefecto(new Date(FIN.getTime() + 5 * 60 * 1000));

    expect((await citaPorId(citaId)).estado).toBe("no_asistio");
  });

  test("con 'siempre decido yo' (manual), la cita sigue confirmada (D-21)", async () => {
    const { citaId } = await citaDel({ reglas: { asistenciaPorDefecto: "manual" } });

    await aplicarAsistenciaPorDefecto(new Date(FIN.getTime() + 60 * 60 * 1000));

    expect((await citaPorId(citaId)).estado).toBe("confirmada");
    expect(await eventosDe(citaId)).toHaveLength(1);
  });

  test("con el negocio suspendido, la cita sigue confirmada; al reactivarlo, la siguiente corrida la marca (D-14)", async () => {
    const { n, citaId } = await citaDel();
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));

    await aplicarAsistenciaPorDefecto(new Date(FIN.getTime() + 60 * 60 * 1000));
    expect((await citaPorId(citaId)).estado).toBe("confirmada");

    await db().update(esquema.negocio).set({ estadoSuscripcion: "prueba" }).where(eq(esquema.negocio.id, n.negocioId));
    await aplicarAsistenciaPorDefecto(new Date(FIN.getTime() + 2 * 60 * 60 * 1000));
    expect((await citaPorId(citaId)).estado).toBe("completada");
  });

  test("no toca las canceladas ni las ya marcadas", async () => {
    const { citaId } = await citaDel();
    await db()
      .update(esquema.cita)
      .set({ estado: "cancelada", canceladaEn: CREADA_EN, canceladaPor: "dueno" })
      .where(eq(esquema.cita.id, citaId));
    const otra = await citaDel();
    await db().update(esquema.cita).set({ estado: "no_asistio" }).where(eq(esquema.cita.id, otra.citaId));

    await aplicarAsistenciaPorDefecto(new Date(FIN.getTime() + 60 * 60 * 1000));

    expect((await citaPorId(citaId)).estado).toBe("cancelada");
    expect((await citaPorId(otra.citaId)).estado).toBe("no_asistio");
    expect(await eventosDe(citaId)).toHaveLength(1);
  });
});
