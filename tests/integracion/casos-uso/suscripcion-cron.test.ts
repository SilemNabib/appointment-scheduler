import { and, desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DatosSuscripcion } from "@/dominio/suscripcion";
import { localAUtc } from "@/dominio/tiempo";
import { cancelarCitaDelCliente } from "@/servidor/casos-uso/cancelar-cita";
import { correrCron, tareasDelCron } from "@/servidor/casos-uso/cron";
import { verCitaPorLink } from "@/servidor/casos-uso/gestion-cita";
import { reprogramarCita } from "@/servidor/casos-uso/reprogramar-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { registrarPago } from "@/servidor/casos-uso/suscripcion-admin";
import { aplicarVencimientos } from "@/servidor/casos-uso/vencimientos";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import type { MensajeCorreo, ProveedorCorreo } from "@/servidor/notificaciones/proveedor";
import { ADMIN_PRUEBA, negocioConAgenda } from "../fixtures";

// La suscripción con el cron (RN-04, RN-29, RN-30, RN-31, D-14, S-16, F-12; ARCH §7.6 y §20,
// Suscripción; T6.36). Corre en el proyecto `integracion-global`, de a un archivo, porque el
// cron actúa sobre todos los negocios. Vencimiento "pagado hasta el 9 de octubre de 2028":
// las 00:00 de Bogotá del martes 10, y la gracia termina el viernes 13 a las 00:00. Es
// anterior a los datos de los demás archivos del proyecto (2029 en adelante), salvo los de
// asistencia-por-defecto-reglas.test.ts (2027), que no deja nada pendiente ni por vencer:
// las corridas de aquí solo ven lo de esta prueba. Cada prueba termina sin notificaciones
// pendientes y con sus negocios suspendidos o pagados hasta 2099: las corridas de los demás
// archivos no encuentran nada suyo que enviar ni que vencer.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const BOGOTA = "America/Bogota";
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const VENCE = localAUtc("2028-10-10", "00:00", BOGOTA);
const FIN_DE_GRACIA = localAUtc("2028-10-13", "00:00", BOGOTA);
const local = (fecha: string, hora: string) => localAUtc(fecha, hora, BOGOTA);

const ACTIVA: Partial<DatosSuscripcion> = { estadoSuscripcion: "activa", pagadoHasta: VENCE, finPrueba: null };
const EN_PRUEBA: Partial<DatosSuscripcion> = { estadoSuscripcion: "prueba", finPrueba: VENCE, pagadoHasta: null };
/** Un pago que deja el negocio fuera del alcance de los demás archivos del proyecto. */
const PAGO = "2099-12-31";

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

/** Una corrida del cron con el proveedor simulado; falla la prueba si alguna tarea falla. */
async function cron(ahora: Date, proveedor: ProveedorCorreo) {
  expect((await correrCron(ahora, tareasDelCron(() => proveedor))).ok).toBe(true);
}

/** Reserva desde la página pública, como la hace un cliente. */
function reservar(n: Negocio, inicio: Date, ahora: Date) {
  return reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: inicio.toISOString(),
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "300 123 4567",
      correo: "ana.cliente@mail.com",
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    ahora,
  );
}

async function reservada(n: Negocio, inicio: Date, ahora: Date) {
  const r = await reservar(n, inicio, ahora);
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId } = r.valor;
  return { citaId, link: { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) } };
}

const negocioPorId = async (id: string) => (await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, id)))[0];

const avisos = (negocioId: string, tipo: "dueno_gracia" | "dueno_suspension") =>
  db()
    .select()
    .from(esquema.notificacion)
    .where(and(eq(esquema.notificacion.negocioId, negocioId), eq(esquema.notificacion.tipo, tipo)));

const pendientes = (negocioId: string) =>
  db()
    .select({ tipo: esquema.notificacion.tipo })
    .from(esquema.notificacion)
    .where(and(eq(esquema.notificacion.negocioId, negocioId), eq(esquema.notificacion.estado, "pendiente")));

const porClave = async (clave: string) =>
  (await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.claveIdempotencia, clave)))[0];

const pagar = async (negocioId: string) => expect((await registrarPago({ negocioId, pagadoHasta: PAGO }, ADMIN_PRUEBA)).ok).toBe(true);

// ─── RN-31: el vencimiento y la gracia ──────────────────────────────────────

describe("RN-31: vencimiento, gracia y suspensión", () => {
  test.each([
    ["activa", ACTIVA],
    ["en prueba", EN_PRUEBA],
  ])(
    "un negocio %s con vencimiento el 10-oct funciona el 12-oct a las 23:59; el 13-oct a las 00:00 está suspendido aunque el cron no haya corrido, y su corrida lo audita con el autor «sistema»",
    async (_estado, suscripcion) => {
      const n = await negocioConAgenda({ suscripcion });
      const { proveedor } = proveedorSimulado();

      // En gracia, todo funciona: la página pública reserva y el link permite actuar.
      const casiFin = new Date(FIN_DE_GRACIA.getTime() - MINUTO);
      const { link } = await reservada(n, local("2028-10-16", "09:00"), casiFin);
      const enGracia = await verCitaPorLink(link, casiFin);
      expect(enGracia.ok && enGracia.valor.acciones).toMatchObject({ cancelar: { permitida: true }, reprogramar: { permitida: true } });

      // A las 00:00 del 13, sin que el cron haya corrido: el estado guardado no cambió,
      // pero el negocio ya está suspendido (el estado se calcula con la hora; ARCH §7.6).
      expect(await reservar(n, local("2028-10-13", "10:00"), FIN_DE_GRACIA)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
      const suspendida = await verCitaPorLink(link, FIN_DE_GRACIA);
      expect(suspendida.ok && suspendida.valor.acciones.cancelar).toMatchObject({ motivo: "negocio_suspendido" });
      expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe(suscripcion.estadoSuscripcion);

      await cron(FIN_DE_GRACIA, proveedor);

      expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe("suspendida");
      const [auditoria] = await db()
        .select()
        .from(esquema.auditoriaAdmin)
        .where(and(eq(esquema.auditoriaAdmin.negocioId, n.negocioId), eq(esquema.auditoriaAdmin.tabla, "negocio")))
        .orderBy(desc(esquema.auditoriaAdmin.id))
        .limit(1);
      expect(auditoria).toMatchObject({ operacion: "UPDATE", actor: "sistema" });
      expect(auditoria.antes).toMatchObject({ estado_suscripcion: suscripcion.estadoSuscripcion });
      expect(auditoria.despues).toMatchObject({ estado_suscripcion: "suspendida" });
      // A la hora del recordatorio de la cita (el domingo 15), el cron lo anula: no queda nada pendiente.
      await cron(local("2028-10-15", "09:00"), proveedor);
      expect(await pendientes(n.negocioId)).toEqual([]);
    },
  );

  test("aunque el cron corra muchas veces, el dueño recibe un solo C-07 durante la gracia y un solo C-08 al quedar suspendido (S-16)", async () => {
    const n = await negocioConAgenda({ suscripcion: ACTIVA });
    const { proveedor, enviados } = proveedorSimulado();

    for (const ahora of [
      VENCE.getTime() - HORA, // al día: nada
      VENCE.getTime(),
      VENCE.getTime() + 5 * MINUTO,
      VENCE.getTime() + DIA,
      VENCE.getTime() + 2 * DIA,
      FIN_DE_GRACIA.getTime() - 5 * MINUTO,
      FIN_DE_GRACIA.getTime(),
      FIN_DE_GRACIA.getTime() + 5 * MINUTO,
      FIN_DE_GRACIA.getTime() + DIA,
    ]) {
      await cron(new Date(ahora), proveedor);
    }

    expect(enviados.filter((m) => m.destinatario === n.correoDueno).map((m) => m.asunto)).toEqual([
      expect.stringMatching(/^Tu suscripción venció: renueva antes del /),
      "Tu suscripción está suspendida",
    ]);
    expect(await avisos(n.negocioId, "dueno_gracia")).toEqual([expect.objectContaining({ estado: "enviada", enviadaEn: VENCE })]);
    expect(await avisos(n.negocioId, "dueno_suspension")).toEqual([expect.objectContaining({ estado: "enviada", enviadaEn: FIN_DE_GRACIA })]);
  });
});

// ─── ARCH §20: el pago ──────────────────────────────────────────────────────

describe("el pago (ARCH §20; D-13)", () => {
  test("un C-07 pendiente se anula si el negocio paga antes de que salga", async () => {
    const n = await negocioConAgenda({ suscripcion: ACTIVA });
    const { proveedor, enviados } = proveedorSimulado();
    // Solo la primera tarea del cron: el C-07 queda encolado, todavía sin enviar.
    await aplicarVencimientos(new Date(VENCE.getTime() + HORA));
    expect(await avisos(n.negocioId, "dueno_gracia")).toEqual([expect.objectContaining({ estado: "pendiente" })]);

    await pagar(n.negocioId);
    await cron(new Date(VENCE.getTime() + HORA + 5 * MINUTO), proveedor);

    expect(await avisos(n.negocioId, "dueno_gracia")).toEqual([
      expect.objectContaining({ estado: "cancelada", ultimoError: "NEGOCIO_NO_EN_GRACIA" }),
    ]);
    expect(enviados.filter((m) => m.destinatario === n.correoDueno)).toEqual([]);
  });

  test("registrarPago reactiva un negocio suspendido de inmediato, sin esperar al cron (RN-31)", async () => {
    const n = await negocioConAgenda({ suscripcion: ACTIVA });
    const { proveedor } = proveedorSimulado();
    await cron(FIN_DE_GRACIA, proveedor);
    const ahora = new Date(FIN_DE_GRACIA.getTime() + HORA);
    expect(await reservar(n, local("2028-10-13", "09:00"), ahora)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });

    await pagar(n.negocioId);

    expect(await negocioPorId(n.negocioId)).toMatchObject({ estadoSuscripcion: "activa", pagadoHasta: local("2100-01-01", "00:00") });
    expect((await reservar(n, local("2028-10-13", "09:00"), ahora)).ok).toBe(true);
    // Que salgan C-01 y C-05 de la reserva: no quedan pendientes para los demás archivos.
    await cron(ahora, proveedor);
    expect(await pendientes(n.negocioId)).toEqual([]);
  });
});

// ─── RN-04 y F-12: lo que no pasa con el negocio suspendido ─────────────────

describe("RN-04 y F-12: el negocio suspendido", () => {
  test("los recordatorios no salen y el link no permite cancelar ni reprogramar; al reactivarlo, los que pasaron no se envían y los siguientes sí", async () => {
    const n = await negocioConAgenda({ suscripcion: ACTIVA });
    const { proveedor, enviados } = proveedorSimulado();
    const reservaEn = local("2028-10-09", "10:00");
    // A: lunes 16, su recordatorio cae el domingo 15, con el negocio suspendido. B: martes
    // 17, su recordatorio cae el lunes 16, después del pago.
    const a = await reservada(n, local("2028-10-16", "09:00"), reservaEn);
    const b = await reservada(n, local("2028-10-17", "09:00"), reservaEn);
    const recordatorioA = local("2028-10-15", "09:00");
    const recordatorioB = local("2028-10-16", "09:00");
    await cron(reservaEn, proveedor);
    await cron(FIN_DE_GRACIA, proveedor);
    expect((await negocioPorId(n.negocioId)).estadoSuscripcion).toBe("suspendida");

    // A la hora del recordatorio de A, el cron lo anula (D-14).
    const durante = new Date(recordatorioA.getTime() + 2 * MINUTO);
    await cron(durante, proveedor);
    expect(await porClave(`recordatorio:${a.citaId}:v1`)).toMatchObject({ estado: "cancelada", ultimoError: "NEGOCIO_SUSPENDIDO" });

    // El link no permite cancelar ni reprogramar (RN-04).
    expect(await cancelarCitaDelCliente(a.link, durante)).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
    expect(await reprogramarCita({ ...a.link, inicio: local("2028-10-18", "09:00").toISOString() }, durante)).toEqual({
      ok: false,
      error: "NEGOCIO_SUSPENDIDO",
    });
    const [citaA] = await db().select().from(esquema.cita).where(eq(esquema.cita.id, a.citaId));
    expect(citaA).toMatchObject({ estado: "confirmada", inicio: local("2028-10-16", "09:00"), version: 1 });

    // Se reactiva: el recordatorio de A, cuya hora pasó, no sale; el de B sale a su hora (F-12, paso 4).
    await pagar(n.negocioId);
    await cron(new Date(recordatorioA.getTime() + 3 * HORA), proveedor);
    await cron(recordatorioB, proveedor);

    expect(enviados.map((m) => m.claveIdempotencia).filter((c) => c.startsWith("recordatorio:"))).toEqual([`recordatorio:${b.citaId}:v1`]);
    expect(await porClave(`recordatorio:${a.citaId}:v1`)).toMatchObject({ estado: "cancelada" });
    expect(await pendientes(n.negocioId)).toEqual([]);
  });
});
