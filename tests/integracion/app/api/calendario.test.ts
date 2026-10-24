import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/calendario/[enlaceId]/[token]/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { tokenDeCalendario } from "@/servidor/calendario/firma";
import { cancelarCita } from "@/servidor/casos-uso/cancelar-cita";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { generarEnlaceCalendario } from "@/servidor/casos-uso/enlace-calendario";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../../fixtures";

// GET /api/calendario/{enlaceId}/{token} (PAN-20; RN-01, RN-24, RN-35, D-14; ARCH §14.7 y
// §18.5; Q-71). La ruta usa la hora real: las citas son del próximo día hábil después de
// mañana.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;
const DUENO = "user_dueno_prueba";

function proximoDiaHabil() {
  let fecha = sumarDias(fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO), 2);
  while (diaSemana(fecha) > 5) fecha = sumarDias(fecha, 1);
  return fecha;
}
const alas = (hora: string) => localAUtc(proximoDiaHabil(), hora, ZONA_HORARIA_POR_DEFECTO).toISOString();
const ctx = (n: Negocio) => ({ negocioId: n.negocioId, clerkUserId: DUENO, suscripcion: { estado: "al_dia" as const } });

beforeEach(() => {
  vi.stubEnv("CALENDARIO_SECRET", "secreto-del-calendario-de-prueba");
  vi.stubEnv("APP_URL", "https://agenda.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

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
      correo: "ana.cliente@mail.com",
      politicaDatosId: n.politicaId,
      aceptaPolitica: true,
      sitioWeb: "",
    },
    new Date(),
  );
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  return r.valor.citaId;
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

/** El enlace vigente del negocio: su id y su token. */
async function enlaceDe(n: Negocio) {
  const r = await generarEnlaceCalendario(ctx(n), new Date());
  if (!r.ok) throw new Error("No se pudo generar el enlace de prueba.");
  const [, enlaceId, token] = /\/api\/calendario\/([^/]+)\/([^/]+)$/.exec(r.valor.https)!;
  return { enlaceId, token };
}

const pedir = (enlace: { enlaceId: string; token: string }) =>
  GET(new Request(`http://localhost/api/calendario/${enlace.enlaceId}/${enlace.token}`), { params: Promise.resolve(enlace) });

describe("GET /api/calendario/{enlaceId}/{token} (ARCH §14.7)", () => {
  test("incluye una cita reservada en la página y una creada en el panel; no las canceladas ni las de otro negocio (RN-35, RN-01)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const publica = await reservaPublica(a, "09:00");
    const delPanel = await citaDelPanel(a, "10:00");
    const cancelada = await citaDelPanel(a, "11:00");
    await cancelarCita({ negocioId: a.negocioId, clerkUserId: DUENO }, { citaId: cancelada }, new Date());
    const deB = await citaDelPanel(b, "09:00");
    const enlace = await enlaceDe(a);

    const r = await pedir(enlace);

    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("private, max-age=300");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    const ics = (await r.text()).replace(/\r\n /g, "");
    expect(ics).not.toContain("METHOD:");
    expect(ics).toContain(`UID:${publica}@agenda-citas`);
    expect(ics).toContain(`UID:${delPanel}@agenda-citas`);
    expect(ics).not.toContain(cancelada);
    expect(ics).not.toContain(deB);
    expect(ics).toContain("SUMMARY:Examen visual — Ana Pérez");
    expect(ics).toContain(`https://agenda.example.com/panel/citas/${delPanel}`);
  });

  test("no contiene ningún teléfono ni correo de cliente (RN-24); con el negocio suspendido se sirve igual (D-14)", async () => {
    const n = await negocioConAgenda();
    await reservaPublica(n, "09:00");
    await citaDelPanel(n, "10:00");
    const enlace = await enlaceDe(n);
    await db().update(esquema.negocio).set({ estadoSuscripcion: "suspendida" }).where(eq(esquema.negocio.id, n.negocioId));

    const r = await pedir(enlace);

    expect(r.status).toBe(200);
    const ics = await r.text();
    for (const dato of ["ana.cliente@mail.com", "luis.cliente@mail.com", "3105550199", "310 555 0199", "3115550100", "311 555 0100"]) {
      expect(ics).not.toContain(dato);
    }
    expect(ics).toContain("BEGIN:VEVENT");
  });

  test("un enlace revocado, un token alterado o un id inexistente responden 404 (RN-35)", async () => {
    const n = await negocioConAgenda();
    const anterior = await enlaceDe(n);
    const nuevo = await enlaceDe(n);
    const inexistente = crypto.randomUUID();

    for (const enlace of [
      anterior,
      { ...nuevo, token: (nuevo.token[0] === "A" ? "B" : "A") + nuevo.token.slice(1) },
      { enlaceId: inexistente, token: await tokenDeCalendario(inexistente) },
      { enlaceId: "no-es-un-uuid", token: nuevo.token },
    ]) {
      expect((await pedir(enlace)).status).toBe(404);
    }
    expect((await pedir(nuevo)).status).toBe(200);
  });

  test("anota el acceso como máximo una vez por hora", async () => {
    const n = await negocioConAgenda();
    const enlace = await enlaceDe(n);
    const acceso = async () =>
      (await db().select().from(esquema.enlaceCalendario).where(eq(esquema.enlaceCalendario.id, enlace.enlaceId)))[0].ultimoAccesoEn;

    await pedir(enlace);
    const primero = await acceso();
    await pedir(enlace);

    expect(primero).toBeInstanceOf(Date);
    expect(await acceso()).toEqual(primero);
  });
});
