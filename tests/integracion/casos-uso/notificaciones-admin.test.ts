import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { reintentarNotificacionAdmin } from "@/app/(admin)/admin/notificaciones/acciones";
import NotificacionesAdmin from "@/app/(admin)/admin/notificaciones/page";
import { listarNotificacionesConProblemas, reintentarNotificacion } from "@/servidor/casos-uso/notificaciones-admin";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { procesarNotificaciones } from "@/servidor/notificaciones/procesar";
import type { MensajeCorreo, ProveedorCorreo } from "@/servidor/notificaciones/proveedor";
import { errorDe, esNoEncontrado } from "../../ayudantes-next";
import { crearCliente, datosDeCita, negocioConAgenda } from "../fixtures";

// Notificaciones fallidas o atrasadas del admin (ADM-05; ADR-07; ARCH §19.2 y §21.4; Q-73).
// La lista es de todos los negocios y va de la más atrasada a la más reciente: "ahora" es
// de mediados de 1990, así estas filas quedan antes que las de las demás pruebas, que
// corren en paralelo sobre la misma rama.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const AHORA = new Date("1990-06-01T12:00:00Z");
const MINUTO = 60 * 1000;
const DESTINATARIO = "destinatario.admin@mail.com";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(auth).mockReset();
});

async function conCita() {
  const n = await negocioConAgenda();
  const clienteId = await crearCliente(n.negocioId);
  const inicio = new Date("1990-06-10T14:00:00Z");
  const fin = new Date(inicio.getTime() + 30 * MINUTO);
  const [{ id, codigo }] = await db()
    .insert(esquema.cita)
    .values({ ...datosDeCita({ ...n, clienteId }), inicio, fin, ocupadoHasta: fin })
    .returning({ id: esquema.cita.id, codigo: esquema.cita.codigo });
  return { n, citaId: id, codigo };
}

async function notificacion(negocioId: string, citaId: string, fila: Partial<typeof esquema.notificacion.$inferInsert>) {
  const [{ id }] = await db()
    .insert(esquema.notificacion)
    .values({
      negocioId,
      citaId,
      tipo: "confirmacion",
      destinatario: DESTINATARIO,
      claveIdempotencia: `prueba:${crypto.randomUUID()}`,
      ...fila,
    })
    .returning({ id: esquema.notificacion.id });
  return id;
}

describe("listarNotificacionesConProblemas (ADM-05)", () => {
  test("aparecen una fallida y una pendiente vencida hace 20 minutos; no una vencida hace 10, una enviada ni una anulada (ARCH §21.4)", async () => {
    const { n, citaId, codigo } = await conCita();
    const fallida = await notificacion(n.negocioId, citaId, {
      estado: "fallida",
      intentos: 5,
      ultimoError: "RESEND_403:validation_error",
      programadaPara: new Date(AHORA.getTime() - 60 * MINUTO),
    });
    const atrasada = await notificacion(n.negocioId, citaId, { tipo: "recordatorio", programadaPara: new Date(AHORA.getTime() - 20 * MINUTO) });
    const reciente = await notificacion(n.negocioId, citaId, { programadaPara: new Date(AHORA.getTime() - 10 * MINUTO) });
    const enviada = await notificacion(n.negocioId, citaId, {
      estado: "enviada",
      enviadaEn: AHORA,
      programadaPara: new Date(AHORA.getTime() - 60 * MINUTO),
    });
    const anulada = await notificacion(n.negocioId, citaId, { estado: "cancelada", programadaPara: new Date(AHORA.getTime() - 60 * MINUTO) });

    const { fallidas, atrasadas } = await listarNotificacionesConProblemas(AHORA);

    expect(fallidas.find((f) => f.id === fallida)).toEqual({
      id: fallida,
      slug: n.slug,
      zonaHoraria: "America/Bogota",
      tipo: "confirmacion",
      codigo,
      programadaPara: new Date(AHORA.getTime() - 60 * MINUTO),
      intentos: 5,
      ultimoError: "RESEND_403:validation_error",
      estado: "fallida",
    });
    expect(atrasadas.find((f) => f.id === atrasada)).toEqual(expect.objectContaining({ tipo: "recordatorio", estado: "pendiente", codigo }));
    const todas = [...fallidas, ...atrasadas].map((f) => f.id);
    for (const id of [reciente, enviada, anulada]) expect(todas).not.toContain(id);
  });

  test("no muestra destinatarios (ARCH §19.2)", async () => {
    const { n, citaId } = await conCita();
    await notificacion(n.negocioId, citaId, { estado: "fallida", programadaPara: new Date(AHORA.getTime() - 60 * MINUTO) });

    expect(JSON.stringify(await listarNotificacionesConProblemas(AHORA))).not.toContain(DESTINATARIO);
  });

  test("sin la sesión del admin, /admin/notificaciones responde 404 (ADR-07)", async () => {
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", "user_admin");
    for (const userId of [null, "user_dueno"]) {
      vi.mocked(auth).mockResolvedValue({ userId } as Awaited<ReturnType<typeof auth>>);
      expect(esNoEncontrado(await errorDe(NotificacionesAdmin()))).toBe(true);
    }
  });
});

// ─── Reintentar una notificación fallida (ADM-05; RN-20, D-14; ARCH §14.2; Q-73) ───

describe("reintentarNotificacion (Q-73)", () => {
  const ADMIN = { clerkUserId: "user_admin" };

  function conEntorno() {
    vi.stubEnv("APP_URL", "https://agenda.example.com");
    vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
    vi.stubEnv("CORREO_REMITENTE", "citas@agenda.example.com");
    vi.spyOn(console, "log").mockImplementation(() => {});
  }

  function proveedorSimulado() {
    const enviados: MensajeCorreo[] = [];
    const proveedor: ProveedorCorreo = {
      async enviar(m) {
        enviados.push(m);
        return { ok: true, mensajeId: `msg_${enviados.length}` };
      },
    };
    return { proveedor, enviados };
  }

  const fila = async (id: string) => (await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.id, id)))[0];

  test("una fallida reintentada queda pendiente para ahora, con 0 intentos, y la corrida siguiente la envía con su clave de siempre (RN-20)", async () => {
    conEntorno();
    const { n, citaId } = await conCita();
    const clave = `confirmacion:${citaId}`;
    const id = await notificacion(n.negocioId, citaId, {
      claveIdempotencia: clave,
      estado: "fallida",
      intentos: 5,
      ultimoError: "RESEND_403:validation_error",
      programadaPara: new Date(AHORA.getTime() - 60 * MINUTO),
    });

    expect(await reintentarNotificacion({ notificacionId: id }, ADMIN, AHORA)).toEqual({ ok: true, valor: undefined });

    expect(await fila(id)).toMatchObject({ estado: "pendiente", intentos: 0, programadaPara: AHORA, ultimoError: null, bloqueadaHasta: null });
    expect(vi.mocked(console.log).mock.calls.map(([l]) => JSON.parse(String(l)))).toContainEqual({
      evento: "notificacion_reintentada",
      notificacionId: id,
      admin: "user_admin",
    });
    const { proveedor, enviados } = proveedorSimulado();
    await procesarNotificaciones({ citaId }, AHORA, proveedor);
    expect(enviados.map((m) => m.claveIdempotencia)).toEqual([clave]);
    expect(await fila(id)).toMatchObject({ estado: "enviada", intentos: 1 });
  });

  test("una pendiente, enviada o cancelada devuelve ESTADO_INVALIDO sin cambiar; un id inexistente, NO_ENCONTRADO", async () => {
    const { n, citaId } = await conCita();
    for (const estado of ["pendiente", "enviada", "cancelada"] as const) {
      const id = await notificacion(n.negocioId, citaId, { estado, enviadaEn: estado === "enviada" ? AHORA : null });
      const antes = await fila(id);
      expect(await reintentarNotificacion({ notificacionId: id }, ADMIN, AHORA)).toEqual({ ok: false, error: "ESTADO_INVALIDO" });
      expect(await fila(id)).toEqual(antes);
    }
    for (const notificacionId of [crypto.randomUUID(), "no-es-un-uuid", 42]) {
      expect(await reintentarNotificacion({ notificacionId }, ADMIN, AHORA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
  });

  test("un correo de citas reintentado con el negocio suspendido se anula al reclamarse (D-14; ARCH §14.3)", async () => {
    conEntorno();
    const { n, citaId } = await conCita();
    const id = await notificacion(n.negocioId, citaId, { estado: "fallida", intentos: 5, programadaPara: AHORA });
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));

    expect((await reintentarNotificacion({ notificacionId: id }, ADMIN, AHORA)).ok).toBe(true);
    const { proveedor, enviados } = proveedorSimulado();
    await procesarNotificaciones({ citaId }, AHORA, proveedor);

    expect(await fila(id)).toMatchObject({ estado: "cancelada", ultimoError: "NEGOCIO_SUSPENDIDO" });
    expect(enviados).toEqual([]);
  });

  test("sin la sesión del admin, la Server Action termina en 404 y no cambia nada (ADR-07)", async () => {
    const { n, citaId } = await conCita();
    const id = await notificacion(n.negocioId, citaId, { estado: "fallida", intentos: 5, programadaPara: AHORA });
    const antes = await fila(id);
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", "user_admin");
    vi.mocked(auth).mockResolvedValue({ userId: "user_dueno" } as Awaited<ReturnType<typeof auth>>);

    expect(esNoEncontrado(await errorDe(reintentarNotificacionAdmin(id)))).toBe(true);
    expect(await fila(id)).toEqual(antes);
  });
});
