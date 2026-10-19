import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/publico/[slug]/disponibilidad/route";
import { POST } from "@/app/api/publico/[slug]/reservas/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../../../fixtures";

// La consulta y la reserva públicas no alcanzan datos de otro negocio cuando se
// manipulan los identificadores (RN-01; ARCH §6 y §20, Multi-negocio). Las rutas usan
// la hora real: la reserva es a las 9:00 a. m. del próximo día hábil después de mañana.

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
