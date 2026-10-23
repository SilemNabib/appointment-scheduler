import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TipoNotificacion } from "@/dominio/envios";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { moverCita } from "@/servidor/casos-uso/mover-cita";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import type { NotificacionReclamada } from "@/servidor/db/repositorios/notificaciones";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { armarMensaje } from "@/servidor/notificaciones/mensajes";
import { negocioConAgenda } from "../fixtures";

// El mensaje de cada notificación (C-01 a C-08; ARCH §14.3, paso 3, y §14.6; Q-63, Q-65,
// Q-71). "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m. de Bogotá; la reserva es el
// lunes 4-mar-2030 a las 9:00 a. m. (14:00 UTC).

const AHORA = new Date("2030-03-01T15:00:00Z");
const APP_URL = "https://agenda.example.com";
const DUENO = { clerkUserId: "user_dueno_prueba" };
const plano = (texto: string) => texto.replace(/[  ]/g, " ");
const desplegar = (ics: string) => ics.replace(/\r\n /g, "");

beforeEach(() => {
  vi.stubEnv("APP_URL", APP_URL);
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
  vi.stubEnv("CORREO_REMITENTE", "citas@agenda.example.com");
  vi.stubEnv("CORREO_CUENTA", "cuenta@agenda.example.com");
  vi.stubEnv("CORREO_SOPORTE", "soporte@agenda.example.com");
  vi.stubEnv("NOMBRE_PRODUCTO", "Agenda de citas");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

/** Una reserva pública del lunes a las 9:00 a. m., con C-01, C-02 y C-05 en la bandeja. */
async function reservada(n: Negocio) {
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
      correo: "ana@mail.com",
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    AHORA,
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  return r.valor;
}

/** La notificación de la cita, como la devolvería el reclamo. */
async function notificacionDe(citaId: string, tipo: TipoNotificacion): Promise<NotificacionReclamada> {
  const [fila] = await db()
    .select()
    .from(esquema.notificacion)
    .where(and(eq(esquema.notificacion.citaId, citaId), eq(esquema.notificacion.tipo, tipo)));
  if (!fila) throw new Error(`La cita ${citaId} no tiene notificación ${tipo}.`);
  return { ...fila, intentos: 1 };
}

const invitacionDe = (m: Awaited<ReturnType<typeof armarMensaje>>) => desplegar(m.adjuntos[0]?.contenido ?? "");

describe("C-01 (ARCH §14.6)", () => {
  test("lleva el link de gestión con el token_version actual y una invitación REQUEST con SEQUENCE igual a la versión", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    // Un token_version que no es el inicial: el link se firma con el actual (ARCH §13).
    await db().update(esquema.cita).set({ tokenVersion: 3 }).where(eq(esquema.cita.id, citaId));

    const m = await armarMensaje(await notificacionDe(citaId, "confirmacion"));

    const link = `${APP_URL}/${n.slug}/cita/${citaId}/${await tokenDeGestion({ id: citaId, tokenVersion: 3 })}`;
    expect(m.html).toContain(`href="${link}"`);
    expect(m.texto).toContain(link);
    expect(m.adjuntos).toEqual([
      { nombre: "invitacion.ics", tipo: "text/calendar; method=REQUEST; charset=utf-8", contenido: expect.any(String) },
    ]);
    const ics = invitacionDe(m);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain(`UID:${citaId}@agenda-citas`);
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("DTSTART:20300304T140000Z");
    const [{ nombre }] = await db().select({ nombre: esquema.negocio.nombre }).from(esquema.negocio).where(eq(esquema.negocio.id, n.negocioId));
    expect(ics).toContain(`ORGANIZER;CN="${nombre}":mailto:citas@agenda.example.com`);
    expect(ics).toContain(link);
  });

  test("sale a nombre del negocio, al correo de la reserva, con su asunto, la política aceptada y el reply_to de Q-63", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    const [negocio] = await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, n.negocioId));

    const m = await armarMensaje(await notificacionDe(citaId, "confirmacion"));

    expect(m.remitente).toBe(`"${negocio.nombre}" <citas@agenda.example.com>`);
    expect(m.destinatario).toBe("ana@mail.com");
    expect(m.asunto).toBe(`Tu cita en ${negocio.nombre} está confirmada`);
    expect(m.claveIdempotencia).toBe(`confirmacion:${citaId}`);
    // Sin correo_contacto ni contactos de correo, responde al dueño (Q-63).
    expect(m.responderA).toBe(n.correoDueno);
    expect(m.html).toContain(`href="${APP_URL}/${n.slug}/politica/1"`);
  });

  test("una cita movida antes de que salga su C-01 sale con su hora actual (ARCH §14.3, paso 3)", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    const movida = await moverCita({ negocioId: n.negocioId, ...DUENO }, { citaId, version: 1, inicio: "2030-03-05T15:00:00.000Z" }, AHORA);
    expect(movida.ok).toBe(true);

    const m = await armarMensaje(await notificacionDe(citaId, "confirmacion"));

    // El martes 5 a las 10:00 a. m. de Bogotá, versión 2.
    expect(plano(m.texto)).toContain("Martes, 5 de marzo de 2030");
    expect(plano(m.texto)).toContain("10:00 a. m. – 10:30 a. m.");
    expect(plano(m.texto)).not.toContain("4 de marzo");
    expect(invitacionDe(m)).toContain("DTSTART:20300305T150000Z");
    expect(invitacionDe(m)).toContain("SEQUENCE:2");
  });

  test("el mismo mensaje se arma igual en un reintento: el cuerpo no cambia y la clave lo reconoce (RN-20)", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    const notificacion = await notificacionDe(citaId, "confirmacion");

    const primero = await armarMensaje(notificacion);
    const reintento = await armarMensaje({ ...notificacion, intentos: 2, programadaPara: new Date(AHORA.getTime() + 120_000) });

    expect(reintento).toEqual(primero);
  });
});

describe("C-02, C-03 y C-04 (ARCH §14.6)", () => {
  test("el C-02 no lleva invitación", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    const m = await armarMensaje(await notificacionDe(citaId, "recordatorio"));
    expect(m.adjuntos).toEqual([]);
    expect(m.asunto).toMatch(/^Recordatorio: tu cita en .+ es el lunes, 4 de marzo$/);
  });

  test("el C-03 lleva una invitación CANCEL con la versión más 1", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    expect((await cancelarCita({ negocioId: n.negocioId, ...DUENO }, { citaId }, AHORA)).ok).toBe(true);

    const m = await armarMensaje(await notificacionDe(citaId, "cancelacion"));

    expect(m.adjuntos[0]?.tipo).toBe("text/calendar; method=CANCEL; charset=utf-8");
    const ics = invitacionDe(m);
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain(`UID:${citaId}@agenda-citas`);
    expect(ics).toContain("SEQUENCE:2");
    expect(m.html).toContain(`href="${APP_URL}/${n.slug}"`);
    expect(m.html).not.toContain("/cita/");
  });

  test("el C-04 lleva la hora anterior de datos, la nueva y una invitación REQUEST con la versión nueva", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);
    const movida = await moverCita({ negocioId: n.negocioId, ...DUENO }, { citaId, version: 1, inicio: "2030-03-05T15:00:00.000Z" }, AHORA);
    expect(movida.ok).toBe(true);

    const m = await armarMensaje(await notificacionDe(citaId, "reprogramacion"));

    expect(plano(m.texto)).toContain("Lunes, 4 de marzo de 2030, 9:00 a. m.");
    expect(plano(m.texto)).toContain("Martes, 5 de marzo de 2030, 10:00 a. m. – 10:30 a. m.");
    expect(m.adjuntos[0]?.tipo).toBe("text/calendar; method=REQUEST; charset=utf-8");
    expect(invitacionDe(m)).toContain("SEQUENCE:2");
  });
});

describe("C-05 y los correos de la cuenta", () => {
  test("el C-05 va al dueño, con el contacto del cliente y el enlace al panel, sin invitación (RN-35)", async () => {
    const n = await negocioConAgenda();
    const { citaId } = await reservada(n);

    const m = await armarMensaje(await notificacionDe(citaId, "dueno_cita_nueva"));

    expect(m.destinatario).toBe(n.correoDueno);
    expect(m.adjuntos).toEqual([]);
    expect(m.html).toContain(`href="${APP_URL}/panel/citas/${citaId}"`);
    expect(m.texto).toContain("Ana Pérez");
    expect(m.texto).toContain("300 123 4567");
  });

  test("el C-07 sale a nombre del producto, con reply_to a soporte (S-16; Q-66)", async () => {
    const n = await negocioConAgenda();
    const m = await armarMensaje({
      id: crypto.randomUUID(),
      negocioId: n.negocioId,
      citaId: null,
      tipo: "dueno_gracia",
      destinatario: n.correoDueno,
      datos: { vence: "2030-03-01T05:00:00+00:00", suspende_en: "2030-03-04T05:00:00+00:00" },
      claveIdempotencia: `dueno_gracia:${crypto.randomUUID()}:1898398800`,
      intentos: 1,
      programadaPara: AHORA,
      creadoEn: AHORA,
    });
    expect(m.remitente).toBe('"Agenda de citas" <cuenta@agenda.example.com>');
    expect(m.responderA).toBe("soporte@agenda.example.com");
    expect(plano(m.asunto)).toBe("Tu suscripción venció: renueva antes del 4 de marzo de 2030");
    expect(m.texto).toContain("28 de febrero de 2030");
  });
});

test("las lecturas filtran por el negocio_id de la notificación (ARCH §6)", async () => {
  const a = await negocioConAgenda();
  const b = await negocioConAgenda();
  const { citaId } = await reservada(a);
  const deA = await notificacionDe(citaId, "confirmacion");

  await expect(armarMensaje({ ...deA, negocioId: b.negocioId })).rejects.toThrow(/no es de su negocio/);
});
