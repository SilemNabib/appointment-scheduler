import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cancelarCita, cancelarCitaDelCliente } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { reintentarNotificacion } from "@/servidor/casos-uso/notificaciones-admin";
import { reprogramarCita } from "@/servidor/casos-uso/reprogramar-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { procesarNotificaciones } from "@/servidor/notificaciones/procesar";
import type { MensajeCorreo, ProveedorCorreo, ResultadoEnvio } from "@/servidor/notificaciones/proveedor";
import { negocioConAgenda } from "../fixtures";

// Las reglas de las notificaciones, con el procesador y un proveedor simulado (RN-20, RN-21,
// RN-22, S-05, S-06, S-12; ARCH §14 y §20, Notificaciones; Q-73; T6.35). Cada corrida se
// acota a la cita, como el envío inmediato (ARCH §14.4): elige las vencidas por
// `programada_para` igual que el cron, sin tomar las filas de las demás pruebas, que corren
// en paralelo sobre la misma rama. "Ahora" es el viernes 7-mar-2031 a las 10:00 a. m. de
// Bogotá; las citas son el lunes 10.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const AHORA = new Date("2031-03-07T15:00:00Z");
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const CORREO_CLIENTE = "ana.cliente@mail.com";
const DUENO = { clerkUserId: "user_dueno_prueba" };
const ADMIN = { clerkUserId: "user_admin" };

/** El lunes 10-mar-2031 a esa hora de Bogotá (UTC−5), en ISO UTC. */
const lunes = (hora: number) => new Date(Date.UTC(2031, 2, 10, hora + 5)).toISOString();

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

/**
 * Un proveedor como Resend: una clave de idempotencia que ya aceptó no vuelve a entregar
 * el correo y responde como la primera vez (ARCH §14.3). Con `perderRespuesta`, entrega el
 * correo de esa clave pero la respuesta no llega, como un corte de red después de aceptarlo.
 */
function resendSimulado({ perderRespuesta }: { perderRespuesta?: string } = {}) {
  const solicitudes: MensajeCorreo[] = [];
  const entregados = new Map<string, MensajeCorreo>();
  let red = true;
  const proveedor: ProveedorCorreo = {
    async enviar(m): Promise<ResultadoEnvio> {
      solicitudes.push(m);
      // Una pausa, para que dos corridas en paralelo se crucen de verdad.
      await new Promise((listo) => setTimeout(listo, 20));
      if (!entregados.has(m.claveIdempotencia)) entregados.set(m.claveIdempotencia, m);
      if (red && m.claveIdempotencia === perderRespuesta) return { ok: false, error: "RED", claveYaUsada: false };
      return { ok: true, mensajeId: `msg_${m.claveIdempotencia}` };
    },
  };
  return {
    proveedor,
    solicitudes,
    /** Los correos que llegaron, uno por clave. */
    entregados: () => [...entregados.values()],
    /** La red vuelve: las respuestas llegan. */
    recuperar: () => {
      red = false;
    },
  };
}

const procesar = (citaId: string, ahora: Date, proveedor: ProveedorCorreo) => procesarNotificaciones({ citaId }, ahora, proveedor);

/** Corre el envío como el cron, cada 5 minutos, desde `primera` mientras no pase de `hasta`. */
async function cronCada5Minutos(citaId: string, primera: number, hasta: number, proveedor: ProveedorCorreo) {
  for (let t = primera; t <= hasta; t += 5 * MINUTO) await procesar(citaId, new Date(t), proveedor);
}

/** Reserva desde la página pública, como la hace un cliente. */
async function reservada(n: Negocio, inicio: string, ahora = AHORA) {
  const r = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio,
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "300 123 4567",
      correo: CORREO_CLIENTE,
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    ahora,
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  return r.valor.citaId;
}

/** Una cita que crea el dueño en el panel (PAN-04), con o sin correo del cliente (S-05). */
async function delPanel(n: Negocio, inicio: string, correo: string | null) {
  const r = await crearCitaManual(
    { negocioId: n.negocioId, ...DUENO },
    { nombre: "Luis", apellido: "Gómez", telefono: "311 555 0100", correo: correo ?? "", servicioId: n.servicioId, inicio },
    AHORA,
  );
  if (!r.ok) throw new Error(`La cita de prueba falló: ${r.error}`);
  return r.valor.citaId;
}

async function linkDe(n: Negocio, citaId: string) {
  return { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) };
}

const notificacionesDe = (citaId: string) => db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, citaId));

const porClave = async (clave: string) =>
  (await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.claveIdempotencia, clave)))[0];

const versionDe = async (citaId: string) =>
  (await db().select({ version: esquema.cita.version }).from(esquema.cita).where(eq(esquema.cita.id, citaId)))[0].version;

// ─── RN-20: una sola vez ────────────────────────────────────────────────────

describe("RN-20: cada correo sale una sola vez", () => {
  test("dos corridas seguidas y dos en paralelo no duplican ningún correo (ARCH §20)", async () => {
    const n = await negocioConAgenda();
    const primera = await reservada(n, lunes(9));
    const segunda = await reservada(n, lunes(10));
    const resend = resendSimulado();

    await procesar(primera, AHORA, resend.proveedor);
    await procesar(primera, AHORA, resend.proveedor);
    await Promise.all([procesar(segunda, AHORA, resend.proveedor), procesar(segunda, AHORA, resend.proveedor)]);

    // Ni siquiera llega una segunda solicitud con la misma clave.
    expect(resend.solicitudes.map((m) => m.claveIdempotencia).sort()).toEqual(
      [`confirmacion:${primera}`, `dueno_cita_nueva:${primera}`, `confirmacion:${segunda}`, `dueno_cita_nueva:${segunda}`].sort(),
    );
    for (const citaId of [primera, segunda]) {
      const filas = await notificacionesDe(citaId);
      expect(filas.filter((f) => f.tipo !== "recordatorio").map((f) => [f.estado, f.intentos])).toEqual([
        ["enviada", 1],
        ["enviada", 1],
      ]);
    }
  });

  test("una notificación reintentada desde /admin sale con su misma clave: un correo que el proveedor ya había aceptado no se duplica (Q-73)", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n, lunes(9));
    const clave = `confirmacion:${citaId}`;
    const resend = resendSimulado({ perderRespuesta: clave });

    // El proveedor acepta C-01, pero la respuesta no llega: cinco intentos, cada uno a la
    // hora de su espera, y queda fallida (ARCH §14.3).
    let ahora = AHORA;
    for (let intento = 1; intento <= 5; intento++) {
      await procesar(citaId, ahora, resend.proveedor);
      ahora = (await porClave(clave)).programadaPara;
    }
    const fallida = await porClave(clave);
    expect(fallida).toMatchObject({ estado: "fallida", intentos: 5, ultimoError: "RED" });

    resend.recuperar();
    expect((await reintentarNotificacion({ notificacionId: fallida.id }, ADMIN, ahora)).ok).toBe(true);
    await procesar(citaId, ahora, resend.proveedor);

    expect(await porClave(clave)).toMatchObject({ estado: "enviada", proveedorMensajeId: `msg_${clave}` });
    const solicitudes = resend.solicitudes.filter((m) => m.claveIdempotencia === clave);
    expect(solicitudes).toHaveLength(6);
    expect(resend.entregados().filter((m) => m.claveIdempotencia === clave)).toHaveLength(1);
  });
});

// ─── RN-21: el recordatorio a su hora ───────────────────────────────────────

describe("RN-21: el recordatorio con el cron cada 5 minutos", () => {
  test("con un recordatorio de 24 horas, el correo sale entre 0 y 5 minutos después de inicio − 24 h", async () => {
    const n = await negocioConAgenda();
    const resend = resendSimulado();
    // Dos fases del cron: una corrida justo a la hora (0 minutos) y otra 1 ms antes (casi 5).
    for (const [hora, fase] of [
      [9, 0],
      [10, 5 * MINUTO - 1],
    ] as const) {
      const citaId = await reservada(n, lunes(hora));
      const clave = `recordatorio:${citaId}:v1`;
      const momento = Date.parse(lunes(hora)) - 24 * HORA;
      expect((await porClave(clave)).programadaPara).toEqual(new Date(momento));

      await cronCada5Minutos(citaId, momento - 10 * MINUTO + fase, momento + 10 * MINUTO, resend.proveedor);

      const { estado, enviadaEn } = await porClave(clave);
      expect(estado).toBe("enviada");
      const atraso = enviadaEn!.getTime() - momento;
      expect(atraso).toBeGreaterThanOrEqual(0);
      expect(atraso).toBeLessThan(5 * MINUTO);
      expect(resend.solicitudes.filter((m) => m.claveIdempotencia === clave)).toHaveLength(1);
    }
  });

  test("si la cita se cancela antes, el recordatorio no sale", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n, lunes(9));
    const momento = Date.parse(lunes(9)) - 24 * HORA;
    expect((await cancelarCitaDelCliente(await linkDe(n, citaId), AHORA)).ok).toBe(true);
    const resend = resendSimulado();

    await cronCada5Minutos(citaId, momento - 10 * MINUTO, momento + 10 * MINUTO, resend.proveedor);

    expect(await porClave(`recordatorio:${citaId}:v1`)).toMatchObject({ estado: "cancelada" });
    expect(resend.solicitudes.map((m) => m.claveIdempotencia)).not.toContainEqual(expect.stringMatching(/^recordatorio:/));
  });

  test("si se reprograma, sale según la hora nueva y no según la anterior", async () => {
    const n = await negocioConAgenda();
    const citaId = await reservada(n, lunes(9));
    const anterior = Date.parse(lunes(9)) - 24 * HORA;
    // De lunes a martes, a la misma hora.
    const nuevoInicio = new Date(Date.parse(lunes(9)) + 24 * HORA).toISOString();
    const nuevo = Date.parse(nuevoInicio) - 24 * HORA;
    expect((await reprogramarCita({ ...(await linkDe(n, citaId)), inicio: nuevoInicio }, AHORA)).ok).toBe(true);
    const resend = resendSimulado();

    await cronCada5Minutos(citaId, anterior - 10 * MINUTO, anterior + 10 * MINUTO, resend.proveedor);
    expect(resend.solicitudes.map((m) => m.claveIdempotencia)).not.toContainEqual(expect.stringMatching(/^recordatorio:/));

    await cronCada5Minutos(citaId, nuevo - 10 * MINUTO, nuevo + 10 * MINUTO, resend.proveedor);

    expect(await porClave(`recordatorio:${citaId}:v1`)).toMatchObject({ estado: "cancelada" });
    const recordatorio = await porClave(`recordatorio:${citaId}:v2`);
    expect(recordatorio).toMatchObject({ estado: "enviada", programadaPara: new Date(nuevo) });
    expect(recordatorio.enviadaEn!.getTime() - nuevo).toBeLessThan(5 * MINUTO);
    expect(resend.solicitudes.filter((m) => m.claveIdempotencia.startsWith("recordatorio:"))).toHaveLength(1);
  });
});

// ─── RN-22 y S-06: los correos del dueño ────────────────────────────────────

describe("RN-22 y S-06: los correos del dueño", () => {
  test("la reserva, la reprogramación y la cancelación del cliente le envían exactamente un correo cada una", async () => {
    const n = await negocioConAgenda();
    const resend = resendSimulado();
    const delDueno = () => resend.solicitudes.filter((m) => m.destinatario === n.correoDueno);

    const citaId = await reservada(n, lunes(9));
    await procesar(citaId, AHORA, resend.proveedor);
    expect(delDueno().map((m) => m.claveIdempotencia)).toEqual([`dueno_cita_nueva:${citaId}`]);

    const link = await linkDe(n, citaId);
    expect((await reprogramarCita({ ...link, inicio: lunes(10) }, AHORA)).ok).toBe(true);
    await procesar(citaId, AHORA, resend.proveedor);
    expect(delDueno()).toHaveLength(2);

    expect((await cancelarCitaDelCliente(link, AHORA)).ok).toBe(true);
    await procesar(citaId, AHORA, resend.proveedor);
    await procesar(citaId, AHORA, resend.proveedor);

    const claves = delDueno().map((m) => m.claveIdempotencia);
    expect(claves).toHaveLength(3);
    expect(new Set(claves).size).toBe(3);
    expect(claves.slice(1)).toEqual([expect.stringMatching(`^dueno_cambio:${citaId}:`), expect.stringMatching(`^dueno_cambio:${citaId}:`)]);
  });

  test("crear, mover y cancelar una cita desde el panel no le envían ninguno; el cliente sí recibe los suyos (S-06)", async () => {
    const n = await negocioConAgenda();
    const resend = resendSimulado();
    const ctx = { negocioId: n.negocioId, ...DUENO };

    const citaId = await delPanel(n, lunes(9), CORREO_CLIENTE);
    await procesar(citaId, AHORA, resend.proveedor);
    expect((await moverCita(ctx, { citaId, inicio: lunes(10), version: await versionDe(citaId) }, AHORA)).ok).toBe(true);
    await procesar(citaId, AHORA, resend.proveedor);
    expect((await cancelarCita(ctx, { citaId }, AHORA)).ok).toBe(true);
    await procesar(citaId, AHORA, resend.proveedor);

    expect(resend.solicitudes.filter((m) => m.destinatario === n.correoDueno)).toEqual([]);
    expect(resend.solicitudes.map((m) => [m.destinatario, m.claveIdempotencia.split(":")[0]])).toEqual([
      [CORREO_CLIENTE, "confirmacion"],
      [CORREO_CLIENTE, "reprogramacion"],
      [CORREO_CLIENTE, "cancelacion"],
    ]);
  });
});

// ─── S-05 y S-12: cuándo no hay correos para el cliente ─────────────────────

describe("S-05 y S-12: cuándo el cliente no recibe correos", () => {
  test("una cita sin correo no envía nada al cliente, tampoco al moverla (S-05)", async () => {
    const n = await negocioConAgenda();
    const resend = resendSimulado();
    const citaId = await delPanel(n, lunes(9), null);
    expect((await moverCita({ negocioId: n.negocioId, ...DUENO }, { citaId, inicio: lunes(10), version: 1 }, AHORA)).ok).toBe(true);

    await procesar(citaId, AHORA, resend.proveedor);
    await cronCada5Minutos(citaId, Date.parse(lunes(10)) - 24 * HORA - 5 * MINUTO, Date.parse(lunes(10)) - 24 * HORA + 5 * MINUTO, resend.proveedor);

    expect(await notificacionesDe(citaId)).toEqual([]);
    expect(resend.solicitudes).toEqual([]);
  });

  test("una cita creada después del momento de su recordatorio no lo recibe (S-12)", async () => {
    const n = await negocioConAgenda();
    const resend = resendSimulado();
    // El viernes a las 2:00 p. m., 4 horas después de "ahora": su recordatorio era el jueves.
    const inicio = new Date(AHORA.getTime() + 4 * HORA).toISOString();
    const citaId = await reservada(n, inicio);

    await procesar(citaId, AHORA, resend.proveedor);
    await procesar(citaId, new Date(Date.parse(inicio) - HORA), resend.proveedor);

    expect((await notificacionesDe(citaId)).map((f) => f.tipo).sort()).toEqual(["confirmacion", "dueno_cita_nueva"]);
    expect(resend.solicitudes.map((m) => m.claveIdempotencia).sort()).toEqual([`confirmacion:${citaId}`, `dueno_cita_nueva:${citaId}`]);
  });
});
