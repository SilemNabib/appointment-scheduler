import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/calendario/[enlaceId]/[token]/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { cancelarCitaDelCliente } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { generarEnlaceCalendario } from "@/servidor/casos-uso/enlace-calendario";
import { reprogramarCita } from "@/servidor/casos-uso/reprogramar-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { procesarNotificaciones } from "@/servidor/notificaciones/procesar";
import type { MensajeCorreo, ProveedorCorreo } from "@/servidor/notificaciones/proveedor";
import { negocioConAgenda } from "../fixtures";

// Los calendarios (RN-24, RN-35; ARCH §14.6, §14.7 y §20, Calendario; T6.38): las
// invitaciones de los correos que recibe el proveedor simulado y el enlace del dueño. El
// enlace sirve las citas alrededor de la hora real, así que las citas son del próximo día
// hábil después de mañana. Cada envío se acota a su cita, como el envío inmediato (ARCH
// §14.4), para no tomar las filas de las demás pruebas.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const DUENO = "user_dueno_prueba";
const CORREO_CLIENTE = "ana.cliente@mail.com";

function proximoDiaHabil() {
  let fecha = sumarDias(fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO), 2);
  while (diaSemana(fecha) > 5) fecha = sumarDias(fecha, 1);
  return fecha;
}
const alas = (hora: string) => localAUtc(proximoDiaHabil(), hora, ZONA_HORARIA_POR_DEFECTO).toISOString();
const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO, suscripcion: { estado: "al_dia" as const } });

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.example.com");
  vi.stubEnv("CALENDARIO_SECRET", "secreto-del-calendario-de-prueba");
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

async function reservaPublica(n: Negocio, hora: string) {
  const r = await reservarCita(
    {
      slug: n.slug,
      sedeId: n.sedeId,
      servicioId: n.servicioId,
      recursoId: null,
      inicio: alas(hora),
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "310 555 0199",
      correo: CORREO_CLIENTE,
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    new Date(),
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  const { citaId } = r.valor;
  return { citaId, link: { slug: n.slug, citaId, token: await tokenDeGestion({ id: citaId, tokenVersion: 1 }) } };
}

async function citaDelPanel(n: Negocio, hora: string) {
  const r = await crearCitaManual(
    { negocioId: n.negocioId, clerkUserId: DUENO },
    { nombre: "Luis", apellido: "Gómez", telefono: "311 555 0100", correo: "luis.cliente@mail.com", servicioId: n.servicioId, inicio: alas(hora) },
    new Date(),
  );
  if (!r.ok) throw new Error(`La cita de prueba falló: ${r.error}`);
  return r.valor.citaId;
}

/** El tipo del correo, por el prefijo de su clave de idempotencia (ARCH §14.1). */
const tipoDe = (m: MensajeCorreo) => m.claveIdempotencia.split(":")[0];

/** El `.ics` adjunto, con las líneas largas ya desplegadas (RFC 5545, §3.1). */
const icsDe = (m: MensajeCorreo) => {
  expect(m.adjuntos).toHaveLength(1);
  return m.adjuntos[0].contenido.replace(/\r\n /g, "");
};
const secuenciaDe = (ics: string) => Number(/^SEQUENCE:(\d+)$/m.exec(ics)?.[1]);

/** El enlace vigente del negocio: su id y su token. */
async function enlaceDe(n: Negocio) {
  const r = await generarEnlaceCalendario(ctx(n), new Date());
  if (!r.ok) throw new Error("No se pudo generar el enlace de prueba.");
  const [, enlaceId, token] = /\/api\/calendario\/([^/]+)\/([^/]+)$/.exec(r.valor.https)!;
  return { enlaceId, token };
}

const pedir = (enlace: { enlaceId: string; token: string }) =>
  GET(new Request(`http://localhost/api/calendario/${enlace.enlaceId}/${enlace.token}`), { params: Promise.resolve(enlace) });

// ─── Las invitaciones de los correos ────────────────────────────────────────

describe("RN-35: las invitaciones de los correos (ARCH §14.6)", () => {
  test("C-01 lleva la invitación; C-04, el mismo UID con un SEQUENCE mayor; C-03, CANCEL con ese UID; y C-02, C-05 y C-06 no llevan", async () => {
    const n = await negocioConAgenda();
    const { proveedor, enviados } = proveedorSimulado();
    const { citaId, link } = await reservaPublica(n, "09:00");
    const uid = `UID:${citaId}@agenda-citas`;
    const ultimo = (tipo: string) => enviados.filter((m) => tipoDe(m) === tipo).at(-1)!;

    // Reserva: C-01 al cliente y C-05 al dueño.
    await procesarNotificaciones({ citaId }, new Date(), proveedor);
    const c01 = ultimo("confirmacion");
    expect(c01.adjuntos.map((a) => [a.nombre, a.tipo])).toEqual([["invitacion.ics", "text/calendar; method=REQUEST; charset=utf-8"]]);
    const ics01 = icsDe(c01);
    expect(ics01).toMatch(/^METHOD:REQUEST$/m);
    expect(ics01).toContain(uid);
    expect(ultimo("dueno_cita_nueva").adjuntos).toEqual([]);

    // Reprogramación por el link: C-04 mueve el mismo evento; C-06 al dueño, sin invitación.
    expect((await reprogramarCita({ ...link, inicio: alas("10:00") }, new Date())).ok).toBe(true);
    await procesarNotificaciones({ citaId }, new Date(), proveedor);
    const ics04 = icsDe(ultimo("reprogramacion"));
    expect(ics04).toMatch(/^METHOD:REQUEST$/m);
    expect(ics04).toContain(uid);
    expect(secuenciaDe(ics04)).toBeGreaterThan(secuenciaDe(ics01));
    expect(ultimo("dueno_cambio").adjuntos).toEqual([]);

    // El recordatorio de la hora nueva: C-02 no lleva invitación, para no duplicar el evento.
    const [recordatorio] = await db()
      .select()
      .from(esquema.notificacion)
      .where(eq(esquema.notificacion.claveIdempotencia, `recordatorio:${citaId}:v2`));
    await procesarNotificaciones({ citaId }, recordatorio.programadaPara, proveedor);
    expect(ultimo("recordatorio").adjuntos).toEqual([]);

    // Cancelación por el link: C-03 cancela el mismo evento; el segundo C-06, sin invitación.
    expect((await cancelarCitaDelCliente(link, new Date())).ok).toBe(true);
    await procesarNotificaciones({ citaId }, new Date(), proveedor);
    const c03 = ultimo("cancelacion");
    expect(c03.adjuntos.map((a) => a.tipo)).toEqual(["text/calendar; method=CANCEL; charset=utf-8"]);
    const ics03 = icsDe(c03);
    expect(ics03).toMatch(/^METHOD:CANCEL$/m);
    expect(ics03).toMatch(/^STATUS:CANCELLED$/m);
    expect(ics03).toContain(uid);
    expect(secuenciaDe(ics03)).toBeGreaterThan(secuenciaDe(ics04));
    const deCambio = enviados.filter((m) => tipoDe(m) === "dueno_cambio");
    expect(deCambio).toHaveLength(2);
    expect(deCambio.flatMap((m) => m.adjuntos)).toEqual([]);

    // Ningún otro correo salió.
    expect(enviados.map(tipoDe).sort()).toEqual(
      ["cancelacion", "confirmacion", "dueno_cambio", "dueno_cambio", "dueno_cita_nueva", "recordatorio", "reprogramacion"].sort(),
    );
  });
});

// ─── El enlace del dueño ────────────────────────────────────────────────────

describe("RN-35: el enlace del dueño (ARCH §14.7)", () => {
  test("muestra las citas de los clientes y las del dueño, sin teléfonos ni correos, y una cita cancelada desaparece en la siguiente consulta (RN-24)", async () => {
    const n = await negocioConAgenda();
    const publica = await reservaPublica(n, "09:00");
    const delPanel = await citaDelPanel(n, "10:00");
    const enlace = await enlaceDe(n);

    const antes = await pedir(enlace);

    expect(antes.status).toBe(200);
    const ics = (await antes.text()).replace(/\r\n /g, "");
    expect(ics).toContain(`UID:${publica.citaId}@agenda-citas`);
    expect(ics).toContain(`UID:${delPanel}@agenda-citas`);
    for (const dato of [CORREO_CLIENTE, "luis.cliente@mail.com", "3105550199", "310 555 0199", "3115550100", "311 555 0100"]) {
      expect(ics).not.toContain(dato);
    }

    expect((await cancelarCitaDelCliente(publica.link, new Date())).ok).toBe(true);
    const despues = (await (await pedir(enlace)).text()).replace(/\r\n /g, "");

    expect(despues).not.toContain(publica.citaId);
    expect(despues).toContain(`UID:${delPanel}@agenda-citas`);
  });

  test("al regenerar el enlace, el anterior responde «no encontrado» y el nuevo funciona", async () => {
    const n = await negocioConAgenda();
    const anterior = await enlaceDe(n);
    expect((await pedir(anterior)).status).toBe(200);

    const nuevo = await enlaceDe(n);

    const r = await pedir(anterior);
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: { codigo: "NO_ENCONTRADO" } });
    expect((await pedir(nuevo)).status).toBe(200);
  });
});
