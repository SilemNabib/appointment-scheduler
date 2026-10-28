import { auth } from "@clerk/nextjs/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import NotificacionesAdmin from "@/app/(admin)/admin/notificaciones/page";
import { listarNotificacionesConProblemas } from "@/servidor/casos-uso/notificaciones-admin";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
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
