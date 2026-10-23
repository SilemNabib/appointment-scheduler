import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { mesLocal } from "@/dominio/tiempo";
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

// ─── Procesador (ARCH §14.2 y §14.3; T6.13) ────────────────────────────────────

const MINUTO = 60 * 1000;
const AHORA = new Date("2030-03-01T12:00:00Z");
/**
 * El reclamo sin `citaId` toma las vencidas de todos los negocios. Esas pruebas usan un
 * `ahora` de 1990, anterior a cualquier dato de las demás pruebas, que corren en paralelo
 * sobre la misma rama: así solo ven sus propias filas.
 */
const AHORA_AISLADO = new Date("1990-01-01T12:00:00Z");

type Fila = Partial<typeof esquema.notificacion.$inferInsert>;

/** Inserta una notificación de la cita, `pendiente` y vencida, salvo lo que se cambie. */
async function encolada(negocioId: string, citaId: string | null, fila: Fila = {}) {
  const [{ id }] = await db()
    .insert(esquema.notificacion)
    .values({
      negocioId,
      citaId,
      tipo: citaId ? "recordatorio" : "dueno_gracia",
      destinatario: "ana@mail.com",
      claveIdempotencia: `prueba:${crypto.randomUUID()}`,
      programadaPara: new Date(AHORA.getTime() - MINUTO),
      ...fila,
    })
    .returning({ id: esquema.notificacion.id });
  return id;
}

const fila = async (id: string) =>
  (await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.id, id)))[0];

describe("notificaciones.reclamar (ARCH §14.2 y §14.3)", () => {
  test("pasa las vencidas a enviando, con un intento más y 2 minutos de arriendo", async () => {
    const n = await negocioConAgenda();
    const cita = await citaDe(n);
    const id = await encolada(n.negocioId, cita, { intentos: 2 });

    const [reclamada] = await notificaciones.reclamar(AHORA, { citaId: cita });

    expect(reclamada).toEqual(
      expect.objectContaining({ id, negocioId: n.negocioId, citaId: cita, tipo: "recordatorio", intentos: 3 }),
    );
    expect(await fila(id)).toEqual(
      expect.objectContaining({ estado: "enviando", intentos: 3, bloqueadaHasta: new Date(AHORA.getTime() + 2 * MINUTO) }),
    );
  });

  test("no reclama las que todavía no vencen ni las que ya salieron, fallaron o se anularon", async () => {
    const n = await negocioConAgenda();
    const cita = await citaDe(n);
    const vencida = await encolada(n.negocioId, cita, { programadaPara: AHORA });
    await encolada(n.negocioId, cita, { programadaPara: new Date(AHORA.getTime() + 1) });
    await encolada(n.negocioId, cita, { estado: "enviada", enviadaEn: AHORA });
    await encolada(n.negocioId, cita, { estado: "fallida" });
    await encolada(n.negocioId, cita, { estado: "cancelada" });

    expect((await notificaciones.reclamar(AHORA, { citaId: cita })).map((r) => r.id)).toEqual([vencida]);
  });

  test("una enviando con el arriendo vencido se vuelve a reclamar; una con el arriendo vigente, no (ARCH §14.2)", async () => {
    const n = await negocioConAgenda();
    const cita = await citaDe(n);
    const vencido = await encolada(n.negocioId, cita, {
      estado: "enviando",
      bloqueadaHasta: new Date(AHORA.getTime() - 1),
      intentos: 1,
    });
    await encolada(n.negocioId, cita, { estado: "enviando", bloqueadaHasta: new Date(AHORA.getTime() + MINUTO), intentos: 1 });
    await encolada(n.negocioId, cita, { estado: "enviando", bloqueadaHasta: AHORA, intentos: 1 });

    const reclamadas = await notificaciones.reclamar(AHORA, { citaId: cita });

    expect(reclamadas.map((r) => [r.id, r.intentos])).toEqual([[vencido, 2]]);
  });

  test("dos reclamos simultáneos sobre las mismas filas no devuelven ninguna fila dos veces (RN-20)", async () => {
    const n = await negocioConAgenda();
    const cita = await citaDe(n);
    const ids = new Set<string>();
    for (let i = 0; i < 30; i++) {
      ids.add(await encolada(n.negocioId, cita, { programadaPara: new Date(AHORA.getTime() - i * MINUTO) }));
    }

    const [primero, segundo] = await Promise.all([
      notificaciones.reclamar(AHORA, { citaId: cita }),
      notificaciones.reclamar(AHORA, { citaId: cita }),
    ]);

    const todas = [...primero, ...segundo].map((r) => r.id);
    expect(primero.length).toBeLessThanOrEqual(25);
    expect(segundo.length).toBeLessThanOrEqual(25);
    expect(new Set(todas).size).toBe(todas.length);
    expect(new Set(todas)).toEqual(ids);
  });

  test("toma de a 25, de la más atrasada a la más reciente", async () => {
    const n = await negocioConAgenda();
    const cita = await citaDe(n);
    const ids: string[] = [];
    for (let i = 0; i < 27; i++) {
      ids.push(await encolada(n.negocioId, cita, { programadaPara: new Date(AHORA.getTime() - (27 - i) * MINUTO) }));
    }

    const lote = await notificaciones.reclamar(AHORA, { citaId: cita });

    expect(lote.map((r) => r.id).sort()).toEqual(ids.slice(0, 25).sort());
    expect((await notificaciones.reclamar(AHORA, { citaId: cita })).map((r) => r.id).sort()).toEqual(ids.slice(25).sort());
  });

  test("sin citaId, reclama las de todos los negocios, también los correos de la cuenta", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const antes = new Date(AHORA_AISLADO.getTime() - MINUTO);
    const deA = await encolada(a.negocioId, await citaDe(a), { programadaPara: antes });
    const deB = await encolada(b.negocioId, await citaDe(b), { programadaPara: antes });
    const deLaCuenta = await encolada(a.negocioId, null, { programadaPara: antes });
    await encolada(a.negocioId, await citaDe(a, new Date("2030-03-05T14:00:00Z")), {
      programadaPara: new Date(AHORA_AISLADO.getTime() + MINUTO),
    });

    const reclamadas = await notificaciones.reclamar(AHORA_AISLADO);

    expect(reclamadas.map((r) => r.id).sort()).toEqual([deA, deB, deLaCuenta].sort());
    expect(reclamadas.find((r) => r.id === deLaCuenta)).toEqual(expect.objectContaining({ citaId: null, tipo: "dueno_gracia" }));
  });
});

describe("marcas del procesador (ARCH §14.3, paso 5)", () => {
  async function reclamada(cambios: Fila = {}) {
    const n = await negocioConAgenda();
    const cita = await citaDe(n);
    await encolada(n.negocioId, cita, cambios);
    const [r] = await notificaciones.reclamar(AHORA, { citaId: cita });
    return r;
  }

  test("enviada, con el id del proveedor y enviada_en", async () => {
    const r = await reclamada();
    expect(await notificaciones.marcarEnviada(r, "msg_123", AHORA)).toBe(true);
    expect(await fila(r.id)).toEqual(
      expect.objectContaining({ estado: "enviada", proveedorMensajeId: "msg_123", enviadaEn: AHORA, bloqueadaHasta: null }),
    );
  });

  test.each([
    [0, 2],
    [1, 4],
    [3, 16],
  ])("con %i intentos previos, el fallo la devuelve a pendiente para dentro de %i minutos (2^intentos)", async (previos, espera) => {
    const r = await reclamada({ intentos: previos });
    expect(r.intentos).toBe(previos + 1);
    expect(await notificaciones.registrarFallo(r, "RESEND_500", AHORA)).toBe("pendiente");
    expect(await fila(r.id)).toEqual(
      expect.objectContaining({
        estado: "pendiente",
        ultimoError: "RESEND_500",
        bloqueadaHasta: null,
        programadaPara: new Date(AHORA.getTime() + espera * MINUTO),
      }),
    );
  });

  test("la que falla por 5.ª vez queda fallida", async () => {
    const r = await reclamada({ intentos: 4 });
    expect(r.intentos).toBe(5);
    expect(await notificaciones.registrarFallo(r, "RESEND_503:service_unavailable", AHORA)).toBe("fallida");
    expect(await fila(r.id)).toEqual(
      expect.objectContaining({ estado: "fallida", ultimoError: "RESEND_503:service_unavailable" }),
    );
  });

  test("anular la deja cancelada con su motivo, y marcarFallida, fallida", async () => {
    const r = await reclamada();
    expect(await notificaciones.anular(r, "VERSION_ANTERIOR")).toBe(true);
    expect(await fila(r.id)).toEqual(expect.objectContaining({ estado: "cancelada", ultimoError: "VERSION_ANTERIOR" }));

    const otra = await reclamada();
    expect(await notificaciones.marcarFallida(otra, "LIMITE_PLAN")).toBe(true);
    expect(await fila(otra.id)).toEqual(expect.objectContaining({ estado: "fallida", ultimoError: "LIMITE_PLAN" }));
  });

  test("no marca una que ya no está enviando ni con el negocioId de otro negocio (ARCH §6)", async () => {
    const r = await reclamada();
    expect(await notificaciones.marcarEnviada({ ...r, negocioId: crypto.randomUUID() }, "x", AHORA)).toBe(false);
    expect(await notificaciones.anular(r, "VERSION_ANTERIOR")).toBe(true);
    expect(await notificaciones.marcarEnviada(r, "x", AHORA)).toBe(false);
    expect(await notificaciones.registrarFallo(r, "RESEND_500", AHORA)).toBeNull();
    expect(await fila(r.id)).toEqual(expect.objectContaining({ estado: "cancelada" }));
  });
});

describe("notificaciones.contarEnviadas (max_emails_per_month; ARCH §9 y §16.3)", () => {
  test("cuenta las enviadas del mes calendario local, sin C-07, C-08 ni las de otros negocios", async () => {
    const n = await negocioConAgenda();
    const otro = await negocioConAgenda();
    const cita = await citaDe(n);
    // Marzo de 2030 en Bogotá: de 2030-03-01T05:00Z a 2030-04-01T05:00Z.
    const marzo = mesLocal(new Date("2030-03-15T12:00:00Z"), "America/Bogota");
    expect(marzo).toEqual({ inicio: new Date("2030-03-01T05:00:00Z"), fin: new Date("2030-04-01T05:00:00Z") });
    const enviada = (enviadaEn: Date, cambios: Fila = {}) =>
      encolada(n.negocioId, cita, { estado: "enviada", enviadaEn, ...cambios });

    await enviada(new Date("2030-03-01T05:00:00Z")); // 1 de marzo, 00:00 local
    await enviada(new Date("2030-04-01T04:59:59Z")); // 31 de marzo, 11:59:59 p. m. local
    await enviada(new Date("2030-03-15T12:00:00Z"), { tipo: "dueno_cita_nueva" });
    // No cuentan:
    await enviada(new Date("2030-03-01T04:59:59Z")); // 28 de febrero local, aunque en UTC ya es marzo
    await enviada(new Date("2030-04-01T05:00:00Z")); // 1 de abril local
    await encolada(n.negocioId, null, { tipo: "dueno_gracia", estado: "enviada", enviadaEn: new Date("2030-03-15T12:00:00Z") });
    await encolada(n.negocioId, null, { tipo: "dueno_suspension", estado: "enviada", enviadaEn: new Date("2030-03-16T12:00:00Z") });
    await encolada(n.negocioId, cita, { estado: "pendiente" });
    await encolada(n.negocioId, cita, { estado: "fallida" });
    await encolada(otro.negocioId, await citaDe(otro), { estado: "enviada", enviadaEn: new Date("2030-03-15T12:00:00Z") });

    expect(await notificaciones.contarEnviadas(n.negocioId, marzo)).toBe(3);
  });
});
