import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { recordatorio } from "@/servidor/casos-uso/agendar";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import { crearCliente, datosDeCita, negocioConAgenda } from "../fixtures";

// Bandeja de salida de los cambios de una cita (C-02 a C-04; ARCH §14.1; Q-60): anular
// los recordatorios pendientes y el recordatorio de cada versión de la cita (S-12).

const HORA = 60 * 60 * 1000;

/** Una cita del panel del negocio, que empieza en `inicio`. */
async function citaDe(n: Awaited<ReturnType<typeof negocioConAgenda>>, inicio = new Date("2030-03-04T14:00:00Z")) {
  const clienteId = await crearCliente(n.negocioId);
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  const [{ id }] = await db()
    .insert(esquema.cita)
    .values({ ...datosDeCita({ ...n, clienteId }), inicio, fin, ocupadoHasta: fin })
    .returning({ id: esquema.cita.id });
  return id;
}

/** Inserta una notificación de la cita con el tipo y el estado indicados. */
async function notificacion(
  negocioId: string,
  citaId: string,
  tipo: (typeof esquema.tipoNotificacion.enumValues)[number],
  estado: (typeof esquema.estadoNotificacion.enumValues)[number] = "pendiente",
) {
  const [{ id }] = await db()
    .insert(esquema.notificacion)
    .values({
      negocioId,
      citaId,
      tipo,
      estado,
      destinatario: "ana@mail.com",
      claveIdempotencia: `${tipo}:${citaId}:${crypto.randomUUID()}`,
      enviadaEn: estado === "enviada" ? new Date() : null,
    })
    .returning({ id: esquema.notificacion.id });
  return id;
}

const estados = async (ids: string[]) =>
  Object.fromEntries(
    (
      await db()
        .select({ id: esquema.notificacion.id, estado: esquema.notificacion.estado })
        .from(esquema.notificacion)
        .where(inArray(esquema.notificacion.id, ids))
    ).map((f) => [f.id, f.estado]),
  );

describe("notificaciones.anularRecordatorios (ARCH §14.1)", () => {
  test("cancela solo los recordatorios pendientes de esa cita en ese negocio", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const cita = await citaDe(a);
    const otraCita = await citaDe(a, new Date("2030-03-05T14:00:00Z"));
    const citaDeB = await citaDe(b);

    const pendiente = await notificacion(a.negocioId, cita, "recordatorio");
    const pendienteV2 = await notificacion(a.negocioId, cita, "recordatorio");
    const enviado = await notificacion(a.negocioId, cita, "recordatorio", "enviada");
    const enviando = await notificacion(a.negocioId, cita, "recordatorio", "enviando");
    const confirmacion = await notificacion(a.negocioId, cita, "confirmacion");
    const deOtraCita = await notificacion(a.negocioId, otraCita, "recordatorio");
    const deOtroNegocio = await notificacion(b.negocioId, citaDeB, "recordatorio");

    const anulados = await enTransaccion((tx) => notificaciones.anularRecordatorios(a.negocioId, cita, tx));

    expect(anulados).toBe(2);
    expect(await estados([pendiente, pendienteV2, enviado, enviando, confirmacion, deOtraCita, deOtroNegocio])).toEqual({
      [pendiente]: "cancelada",
      [pendienteV2]: "cancelada",
      [enviado]: "enviada",
      [enviando]: "enviando",
      [confirmacion]: "pendiente",
      [deOtraCita]: "pendiente",
      [deOtroNegocio]: "pendiente",
    });
  });

  test("con el negocioId de otro negocio no cambia nada (ARCH §6)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const cita = await citaDe(a);
    const pendiente = await notificacion(a.negocioId, cita, "recordatorio");

    expect(await enTransaccion((tx) => notificaciones.anularRecordatorios(b.negocioId, cita, tx))).toBe(0);
    expect(await estados([pendiente])).toEqual({ [pendiente]: "pendiente" });
  });
});

describe("recordatorio de una versión de la cita (S-12; ARCH §14.1)", () => {
  const inicio = new Date("2030-03-04T14:00:00Z");
  const ahora = new Date("2030-03-01T12:00:00Z");

  test("el de la versión 2 tiene la clave recordatorio:{citaId}:v2 y { version: 2 } en datos, y se encola así", async () => {
    const n = await negocioConAgenda();
    const citaId = await citaDe(n, inicio);

    const c02 = recordatorio({ citaId, inicio, version: 2 }, 24, ahora);

    expect(c02).toEqual({
      citaId,
      tipo: "recordatorio",
      claveIdempotencia: `recordatorio:${citaId}:v2`,
      programadaPara: new Date(inicio.getTime() - 24 * HORA),
      datos: { version: 2 },
    });
    await enTransaccion((tx) => notificaciones.encolar(n.negocioId, "ana@mail.com", [c02!], tx));
    const filas = await db()
      .select()
      .from(esquema.notificacion)
      .where(eq(esquema.notificacion.citaId, citaId))
      .orderBy(asc(esquema.notificacion.creadoEn));
    expect(filas).toEqual([
      expect.objectContaining({
        tipo: "recordatorio",
        destinatario: "ana@mail.com",
        claveIdempotencia: `recordatorio:${citaId}:v2`,
        datos: { version: 2 },
        programadaPara: new Date("2030-03-03T14:00:00Z"),
        estado: "pendiente",
      }),
    ]);
  });

  test("si su momento ya pasó, no se crea (S-12); en el instante exacto, sí", () => {
    const citaId = crypto.randomUUID();
    const momento = new Date(inicio.getTime() - 24 * HORA);

    expect(recordatorio({ citaId, inicio, version: 2 }, 24, new Date(momento.getTime() + 1))).toBeNull();
    expect(recordatorio({ citaId, inicio, version: 2 }, 24, momento)).toEqual(
      expect.objectContaining({ programadaPara: momento }),
    );
  });

  test("sin recordatorio configurado, no se crea", () => {
    expect(recordatorio({ citaId: crypto.randomUUID(), inicio, version: 1 }, null, ahora)).toBeNull();
  });
});
