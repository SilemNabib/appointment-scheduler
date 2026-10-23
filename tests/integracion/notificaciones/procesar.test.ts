import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { procesarNotificaciones } from "@/servidor/notificaciones/procesar";
import type { MensajeCorreo, ProveedorCorreo, ResultadoEnvio } from "@/servidor/notificaciones/proveedor";
import { fijarLimite, negocioConAgenda } from "../fixtures";

// Procesador de la bandeja de salida con el proveedor simulado (RN-20, RN-21, RN-25; ARCH
// §14.2, §14.3 y §16.3; Q-67, Q-75). Corre en el proyecto `integracion-global`, de a un
// archivo, porque sin `citaId` procesa lo vencido de todos los negocios. "Ahora" es el
// viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; la reserva es el lunes 4 a las 9:00.

const AHORA = new Date("2030-03-01T15:00:00Z");
const MINUTO = 60 * 1000;
const CORREO_CLIENTE = "ana.cliente@mail.com";

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.example.com");
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
  vi.stubEnv("CORREO_REMITENTE", "citas@agenda.example.com");
  vi.stubEnv("CORREO_CUENTA", "cuenta@agenda.example.com");
  vi.stubEnv("CORREO_SOPORTE", "soporte@agenda.example.com");
  vi.stubEnv("NOMBRE_PRODUCTO", "Agenda de citas");
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Guarda lo que habría enviado. Las primeras `fallos` solicitudes fallan con un 500. */
function proveedorSimulado(fallos = 0) {
  const intentos: MensajeCorreo[] = [];
  const enviados: MensajeCorreo[] = [];
  const proveedor: ProveedorCorreo = {
    async enviar(m): Promise<ResultadoEnvio> {
      intentos.push(m);
      if (intentos.length <= fallos) return { ok: false, error: "RESEND_500", claveYaUsada: false };
      enviados.push(m);
      return { ok: true, mensajeId: `msg_${enviados.length}` };
    },
  };
  return { proveedor, intentos, enviados };
}

async function reservada(n: Awaited<ReturnType<typeof negocioConAgenda>>) {
  const r = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: "2030-03-04T14:00:00.000Z",
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "300 123 4567",
      correo: CORREO_CLIENTE,
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    AHORA,
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  return r.valor.citaId;
}

const deLaCita = async (citaId: string) =>
  Object.fromEntries(
    (await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId))).map((f) => [f.tipo, f]),
  );

describe("procesarNotificaciones (ARCH §14.3)", () => {
  test("una reserva nueva deja C-01 y C-05 enviada, con el id del proveedor, y su recordatorio pendiente hasta su hora (ARCH §14.1)", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n);
    const { proveedor, enviados } = proveedorSimulado();

    expect(await procesarNotificaciones({ citaId }, AHORA, proveedor)).toEqual({ enviada: 2, anulada: 0, reintento: 0, fallida: 0 });

    const filas = await deLaCita(citaId);
    expect(filas.confirmacion).toEqual(expect.objectContaining({ estado: "enviada", enviadaEn: AHORA, proveedorMensajeId: expect.stringMatching(/^msg_/) }));
    expect(filas.dueno_cita_nueva).toEqual(expect.objectContaining({ estado: "enviada", proveedorMensajeId: expect.stringMatching(/^msg_/) }));
    expect(filas.recordatorio).toEqual(expect.objectContaining({ estado: "pendiente" }));
    expect(enviados.map((m) => m.destinatario).sort()).toEqual([CORREO_CLIENTE, n.correoDueno].sort());

    // A su hora (24 h antes del inicio), sale el recordatorio (RN-21).
    const momento = filas.recordatorio.programadaPara;
    expect(await procesarNotificaciones({ citaId }, new Date(momento.getTime() - 1), proveedor)).toEqual({
      enviada: 0,
      anulada: 0,
      reintento: 0,
      fallida: 0,
    });
    expect((await procesarNotificaciones({ citaId }, momento, proveedor)).enviada).toBe(1);
    expect((await deLaCita(citaId)).recordatorio.estado).toBe("enviada");
  });

  test("si el proveedor falla, vuelve a pendiente con su espera, y el reintento envía la misma clave de idempotencia (ARCH §14.3, pasos 4 y 5)", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n);
    const { proveedor, intentos, enviados } = proveedorSimulado(2);

    expect(await procesarNotificaciones({ citaId }, AHORA, proveedor)).toEqual({ enviada: 0, anulada: 0, reintento: 2, fallida: 0 });
    const tras = await deLaCita(citaId);
    expect(tras.confirmacion).toEqual(
      expect.objectContaining({ estado: "pendiente", intentos: 1, ultimoError: "RESEND_500", programadaPara: new Date(AHORA.getTime() + 2 * MINUTO) }),
    );

    // Antes de la espera no se reintenta; después, sí, con la misma clave.
    expect((await procesarNotificaciones({ citaId }, new Date(AHORA.getTime() + MINUTO), proveedor)).enviada).toBe(0);
    expect((await procesarNotificaciones({ citaId }, new Date(AHORA.getTime() + 2 * MINUTO), proveedor)).enviada).toBe(2);
    expect(enviados.map((m) => m.claveIdempotencia).sort()).toEqual(intentos.slice(0, 2).map((m) => m.claveIdempotencia).sort());
    expect(enviados.map((m) => m.claveIdempotencia)).toContain(`confirmacion:${citaId}`);
    expect((await deLaCita(citaId)).confirmacion).toEqual(expect.objectContaining({ estado: "enviada", intentos: 2 }));
  });

  test("con max_emails_per_month alcanzado por una excepción, un C-01 queda fallida con LIMITE_PLAN y un C-08 sale igual (ARCH §14.1, §16.3)", async () => {
    const n = await negocioConAgenda();
    await fijarLimite(n.negocioId, "max_emails_per_month", 0);
    const citaId = await reservada(n);
    const { proveedor, enviados } = proveedorSimulado();

    await procesarNotificaciones({ citaId }, AHORA, proveedor);
    expect((await deLaCita(citaId)).confirmacion).toEqual(expect.objectContaining({ estado: "fallida", ultimoError: "LIMITE_PLAN" }));
    expect(enviados).toEqual([]);

    // El admin lo suspende: C-08 no cuenta para el límite (S-16).
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));
    const [{ id: c08 }] = await db()
      .insert(esquema.notificacion)
      .values({
        negocioId: n.negocioId,
        tipo: "dueno_suspension",
        destinatario: n.correoDueno,
        claveIdempotencia: `dueno_suspension:${crypto.randomUUID()}:${AHORA.getTime() / 1000}`,
        programadaPara: AHORA,
      })
      .returning({ id: esquema.notificacion.id });

    await procesarNotificaciones({}, AHORA, proveedor);

    const [fila] = await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.id, c08));
    expect(fila).toEqual(expect.objectContaining({ estado: "enviada" }));
    expect(enviados.map((m) => m.asunto)).toEqual(["Tu suscripción está suspendida"]);
  });

  test("con el negocio suspendido, los correos de citas se anulan con NEGOCIO_SUSPENDIDO (D-14)", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n);
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));
    const { proveedor, enviados } = proveedorSimulado();

    expect(await procesarNotificaciones({ citaId }, AHORA, proveedor)).toEqual({ enviada: 0, anulada: 2, reintento: 0, fallida: 0 });
    expect((await deLaCita(citaId)).confirmacion).toEqual(expect.objectContaining({ estado: "cancelada", ultimoError: "NEGOCIO_SUSPENDIDO" }));
    expect(enviados).toEqual([]);
  });

  test("registra cada resultado con identificadores, sin destinatarios (ARCH §19.2)", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n);
    const registro = vi.spyOn(console, "log").mockImplementation(() => {});

    await procesarNotificaciones({ citaId }, AHORA, proveedorSimulado(1).proveedor);

    const lineas = registro.mock.calls.map(([linea]) => JSON.parse(String(linea)));
    expect(lineas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ evento: "notificacion", citaId, negocioId: n.negocioId, tipo: "confirmacion" }),
        expect.objectContaining({ evento: "notificacion", citaId, tipo: "dueno_cita_nueva" }),
      ]),
    );
    expect(lineas.map((l) => l.resultado).sort()).toEqual(["enviada", "reintento"]);
    const texto = JSON.stringify(registro.mock.calls);
    expect(texto).not.toContain(CORREO_CLIENTE);
    expect(texto).not.toContain(n.correoDueno);
  });

  test("sigue con más lotes mientras haya vencidas, hasta 4 lotes de 25 por corrida (Q-75)", { timeout: 180_000 }, async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n);
    // 101 recordatorios de una versión que no es la de la cita: se anulan sin enviarse.
    await db()
      .insert(esquema.notificacion)
      .values(
        Array.from({ length: 101 }, (_, i) => ({
          negocioId: n.negocioId,
          citaId,
          tipo: "recordatorio" as const,
          destinatario: CORREO_CLIENTE,
          datos: { version: 99 },
          claveIdempotencia: `recordatorio:${citaId}:prueba-${i}`,
          programadaPara: new Date(AHORA.getTime() - (i + 1) * MINUTO),
        })),
      );
    const { proveedor } = proveedorSimulado();

    const primera = await procesarNotificaciones({ citaId }, AHORA, proveedor);
    expect(primera.anulada + primera.enviada).toBe(100);
    const quedan = await db()
      .select({ id: esquema.notificacion.id })
      .from(esquema.notificacion)
      .where(and(eq(esquema.notificacion.citaId, citaId), eq(esquema.notificacion.estado, "pendiente")));
    // Quedan vencidas la más reciente de las 101, C-01 y C-05; y el recordatorio real, que todavía no vence.
    expect(quedan.length).toBe(4);

    const segunda = await procesarNotificaciones({ citaId }, AHORA, proveedor);
    expect(segunda.anulada + segunda.enviada).toBe(3);
  });
});
