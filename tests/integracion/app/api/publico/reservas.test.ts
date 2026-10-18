import { describe, expect, test } from "vitest";
import { POST } from "@/app/api/publico/[slug]/reservas/route";
import { diaSemana, fechaLocal, localAUtc, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { negocioConAgenda } from "../../../fixtures";

// POST /api/publico/{slug}/reservas (PUB-05, PUB-06; ARCH §18.5 y §19.2; Q-33). La ruta
// usa la hora real: la reserva es a las 9:00 a. m. del próximo día hábil después de
// mañana, dentro de la anticipación de D-09 (de 2 horas a 60 días).

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

function proximoDiaHabilALas9() {
  let fecha = sumarDias(fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO), 2);
  while (diaSemana(fecha) > 5) fecha = sumarDias(fecha, 1);
  return localAUtc(fecha, "09:00", ZONA_HORARIA_POR_DEFECTO).toISOString();
}

const cuerpo = (n: Negocio, cambios: Record<string, unknown> = {}) => ({
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  recursoId: null,
  inicio: proximoDiaHabilALas9(),
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "ana@mail.com",
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
  ...cambios,
});

function enviar(slug: string, contenido: BodyInit, tipo: string | null = "application/json") {
  const headers = new Headers();
  if (tipo) headers.set("content-type", tipo);
  const solicitud = new Request(`http://localhost/api/publico/${slug}/reservas`, { method: "POST", headers, body: contenido });
  return POST(solicitud, { params: Promise.resolve({ slug }) });
}

const DATOS_INVALIDOS = { error: { codigo: "DATOS_INVALIDOS", mensaje: "Revisa los datos e intenta de nuevo." } };

describe("POST /api/publico/{slug}/reservas (ARCH §18.5)", () => {
  test("una reserva válida responde 201, y la misma hora pedida otra vez responde 409 HORARIO_NO_DISPONIBLE", async () => {
    const n = await negocioConAgenda();
    const inicio = proximoDiaHabilALas9();

    const primera = await enviar(n.slug, JSON.stringify(cuerpo(n, { inicio })));
    expect(primera.status).toBe(201);
    expect(await primera.json()).toEqual({
      citaId: expect.any(String),
      inicio,
      fin: new Date(Date.parse(inicio) + 30 * 60_000).toISOString(),
    });

    const segunda = await enviar(n.slug, JSON.stringify(cuerpo(n, { inicio, telefono: "310 555 0000", correo: "luis@mail.com" })));
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toEqual({
      error: { codigo: "HORARIO_NO_DISPONIBLE", mensaje: "Esa hora se acaba de ocupar." },
    });
  });

  test("con charset en el Content-Type también se acepta", async () => {
    const n = await negocioConAgenda();
    const respuesta = await enviar(n.slug, JSON.stringify(cuerpo(n)), "application/json; charset=utf-8");
    expect(respuesta.status).toBe(201);
  });

  test("un cuerpo que no es application/json responde 422 DATOS_INVALIDOS (Q-33)", async () => {
    const n = await negocioConAgenda();
    const comoFormulario = new URLSearchParams(Object.entries(cuerpo(n)).map(([k, v]) => [k, String(v)]));
    const casos: [BodyInit, string | null][] = [
      [comoFormulario, "application/x-www-form-urlencoded"],
      [JSON.stringify(cuerpo(n)), "text/plain"],
      [JSON.stringify(cuerpo(n)), null],
    ];
    for (const [contenido, tipo] of casos) {
      const respuesta = await enviar(n.slug, contenido, tipo);
      expect(respuesta.status, String(tipo)).toBe(422);
      expect(await respuesta.json()).toEqual(DATOS_INVALIDOS);
    }
  });

  test("un JSON mal formado, o que no es un objeto, responde 422 DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    for (const contenido of ["{ no es json", "[]", "null", '"texto"']) {
      const respuesta = await enviar(n.slug, contenido);
      expect(respuesta.status, contenido).toBe(422);
      expect(await respuesta.json()).toEqual(DATOS_INVALIDOS);
    }
  });

  test("el slug sale de la URL, no del cuerpo (ARCH §6)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    // La sede, el servicio y la política son de A, pero la URL es la de B.
    const respuesta = await enviar(b.slug, JSON.stringify({ ...cuerpo(a), slug: a.slug }));
    expect(respuesta.status).toBe(404);
  });
});
