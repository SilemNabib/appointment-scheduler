import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST as cancelar } from "@/app/api/publico/[slug]/citas/[citaId]/cancelar/route";
import { POST as disponibilidadGestion } from "@/app/api/publico/[slug]/citas/[citaId]/disponibilidad/route";
import { POST as reprogramar } from "@/app/api/publico/[slug]/citas/[citaId]/reprogramar/route";
import { GET } from "@/app/api/publico/[slug]/disponibilidad/route";
import { POST } from "@/app/api/publico/[slug]/reservas/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";
import { negocioConAgenda } from "../../../fixtures";

// La consulta, la reserva y la gestión por link públicas no alcanzan datos de otro
// negocio cuando se manipulan los identificadores (RN-01; ARCH §6 y §20, Multi-negocio).
// Las rutas usan la hora real: la reserva es a las 9:00 a. m. del próximo día hábil
// después de mañana.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const hoy = () => fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO);

function proximoDiaHabilALas9() {
  let fecha = sumarDias(hoy(), 2);
  while (diaSemana(fecha) > 5) fecha = sumarDias(fecha, 1);
  return localAUtc(fecha, "09:00", ZONA_HORARIA_POR_DEFECTO).toISOString();
}

function consultar(slug: string, ids: { sedeId: string; servicioId: string }) {
  const url = new URL(`http://localhost/api/publico/${slug}/disponibilidad`);
  for (const [nombre, valor] of Object.entries({ ...ids, desde: hoy(), hasta: sumarDias(hoy(), 6) })) {
    url.searchParams.set(nombre, valor);
  }
  return GET(new Request(url), { params: Promise.resolve({ slug }) });
}

function reservar(slug: string, ids: { sedeId: string; servicioId: string; politicaDatosId: string }) {
  const cuerpo = {
    ...ids,
    inicio: proximoDiaHabilALas9(),
    nombre: "Ana",
    apellido: "Pérez",
    telefono: "300 123 4567",
    correo: "ana@mail.com",
    aceptaPolitica: true,
    sitioWeb: "",
  };
  const solicitud = new Request(`http://localhost/api/publico/${slug}/reservas`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return POST(solicitud, { params: Promise.resolve({ slug }) });
}

const ids = (n: Negocio) => ({ sedeId: n.sedeId, servicioId: n.servicioId, politicaDatosId: n.politicaId });
const NO_ENCONTRADO = { error: { codigo: "NO_ENCONTRADO", mensaje: "No encontrado." } };
const citasDe = (negocioId: string) => db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

describe("API pública con identificadores de otro negocio (RN-01)", () => {
  test("con el slug de A, consultar o reservar con la sede o el servicio de B devuelve NO_ENCONTRADO, y en B no aparece ninguna cita (RN-01)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    // Con sus propios identificadores, B sí ofrece horas: lo que falla es la mezcla.
    expect((await consultar(b.slug, ids(b))).status).toBe(200);

    const mezclas = {
      "la sede de B": { ...ids(a), sedeId: b.sedeId },
      "el servicio de B": { ...ids(a), servicioId: b.servicioId },
      "la sede y el servicio de B": { ...ids(a), sedeId: b.sedeId, servicioId: b.servicioId },
    };
    for (const [que, mezcla] of Object.entries(mezclas)) {
      const consulta = await consultar(a.slug, mezcla);
      expect(consulta.status, `consulta con ${que}`).toBe(404);
      expect(await consulta.json()).toEqual(NO_ENCONTRADO);

      const reserva = await reservar(a.slug, mezcla);
      expect(reserva.status, `reserva con ${que}`).toBe(404);
      expect(await reserva.json()).toEqual(NO_ENCONTRADO);
    }

    expect(await citasDe(b.negocioId)).toEqual([]);
    expect(await citasDe(a.negocioId)).toEqual([]);
  });

  test("con el slug de A, una reserva con la política de B devuelve NO_ENCONTRADO (RN-01)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);

    const reserva = await reservar(a.slug, { ...ids(a), politicaDatosId: b.politicaId });

    expect(reserva.status).toBe(404);
    expect(await reserva.json()).toEqual(NO_ENCONTRADO);
    expect(await citasDe(a.negocioId)).toEqual([]);
    expect(await citasDe(b.negocioId)).toEqual([]);
  });

  test("con el slug de B y todos los identificadores de A, tampoco: NO_ENCONTRADO y ninguna cita (RN-01)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);

    expect((await consultar(b.slug, ids(a))).status).toBe(404);
    expect((await reservar(b.slug, ids(a))).status).toBe(404);
    expect(await citasDe(a.negocioId)).toEqual([]);
    expect(await citasDe(b.negocioId)).toEqual([]);
  });
});

// ─── La gestión por link (Fase 6) ───────────────────────────────────────────

type Link = { slug: string; citaId: string; token: string };

/** Una cita reservada en el negocio, con el link de su correo. */
async function citaConLink(n: Negocio): Promise<Link> {
  const r = await reservarCita({ ...ids(n), slug: n.slug, recursoId: null, ...datosDelCliente(), inicio: proximoDiaHabilALas9() }, new Date());
  if (!r.ok) throw new Error(`La reserva de prueba falló: ${r.error}`);
  return { slug: n.slug, citaId: r.valor.citaId, token: await tokenDeGestion({ id: r.valor.citaId, tokenVersion: 1 }) };
}

const datosDelCliente = () => ({
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "ana@mail.com",
  aceptaPolitica: true,
  sitioWeb: "",
});

/** Las tres rutas del link (GES-02, GES-03; ARCH §18.5), cada una con su cuerpo. */
function rutasDeGestion(link: Link) {
  const fecha = proximoDiaHabilALas9().slice(0, 10);
  const pedir = (ruta: typeof cancelar, cuerpo: Record<string, unknown>) =>
    ruta(
      new Request(`http://localhost/api/publico/${link.slug}/citas/${link.citaId}/x`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: link.token, ...cuerpo }),
      }),
      { params: Promise.resolve({ slug: link.slug, citaId: link.citaId }) },
    );
  return {
    cancelar: () => pedir(cancelar, {}),
    reprogramar: () => pedir(reprogramar, { inicio: localAUtc(fecha, "10:00", ZONA_HORARIA_POR_DEFECTO).toISOString() }),
    disponibilidad: () => pedir(disponibilidadGestion, { desde: fecha, hasta: fecha }),
  };
}

describe("la gestión por link con identificadores de otro negocio (RN-01)", () => {
  beforeEach(() => {
    vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
    // Fuera de una solicitud de Next, `after()` no programa el envío: el despacho solo lo registra.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("el link de una cita de B con el slug de A, y el token de una cita con el id de otra, devuelven NO_ENCONTRADO en las tres rutas, y la cita de B no cambia", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    const [deA, deB] = [await citaConLink(a), await citaConLink(b)];
    // Con su propio link, la cita de B sí responde: lo que falla es la mezcla.
    expect((await rutasDeGestion(deB).disponibilidad()).status).toBe(200);
    const citaDeB = async () => ({
      cita: await db().select().from(esquema.cita).where(eq(esquema.cita.id, deB.citaId)),
      eventos: await db().select().from(esquema.eventoCita).where(eq(esquema.eventoCita.citaId, deB.citaId)),
      avisos: await db().select().from(esquema.notificacion).where(eq(esquema.notificacion.citaId, deB.citaId)),
    });
    const antes = await citaDeB();

    const mezclas: Record<string, Link> = {
      "la cita de B con el slug de A": { ...deB, slug: a.slug },
      "el token de la cita de A con el id de la de B": { ...deB, token: deA.token },
      "el token de la cita de B con el id de la de A": { ...deA, token: deB.token },
    };
    for (const [que, link] of Object.entries(mezclas)) {
      for (const [ruta, pedir] of Object.entries(rutasDeGestion(link))) {
        const r = await pedir();
        expect(r.status, `${ruta} con ${que}`).toBe(404);
        expect(await r.json()).toEqual(NO_ENCONTRADO);
      }
    }

    expect(await citaDeB()).toEqual(antes);
    expect((await db().select().from(esquema.cita).where(eq(esquema.cita.id, deA.citaId)))[0].estado).toBe("confirmada");
  });
});
