import { describe, expect, test } from "vitest";
import { GET } from "@/app/api/publico/[slug]/disponibilidad/route";
import { fechaLocal, sumarDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { negocioConAgenda } from "../../../fixtures";

// GET /api/publico/{slug}/disponibilidad (PUB-03, PUB-04; ARCH §18.5). La ruta usa la
// hora real, así que la semana consultada empieza hoy.

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

function consultar(slug: string, parametros: Record<string, string>) {
  const url = new URL(`http://localhost/api/publico/${slug}/disponibilidad`);
  for (const [nombre, valor] of Object.entries(parametros)) url.searchParams.set(nombre, valor);
  return GET(new Request(url), { params: Promise.resolve({ slug }) });
}

const semana = (n: Negocio) => {
  const hoy = fechaLocal(new Date(), ZONA_HORARIA_POR_DEFECTO);
  return { sedeId: n.sedeId, servicioId: n.servicioId, desde: hoy, hasta: sumarDias(hoy, 6) };
};

describe("GET /api/publico/{slug}/disponibilidad (ARCH §18.5)", () => {
  test("la consulta de una semana responde 200 con el JSON de ARCH §18.5", async () => {
    const n = await negocioConAgenda();
    const parametros = semana(n);

    const respuesta = await consultar(n.slug, parametros);

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toMatch(/^application\/json/);
    const cuerpo = (await respuesta.json()) as { zonaHoraria: string; dias: { fecha: string; inicios: string[] }[] };
    expect(cuerpo.zonaHoraria).toBe("America/Bogota");
    expect(cuerpo.dias.map((d) => d.fecha)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => sumarDias(parametros.desde, i)));
    const inicios = cuerpo.dias.flatMap((d) => d.inicios);
    expect(inicios.length).toBeGreaterThan(0); // de lunes a viernes hay horas en la semana
    for (const inicio of inicios) expect(inicio).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });

  test("sin sedeId o con fechas mal formadas responde 422 DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    const sinSede = Object.fromEntries(Object.entries(semana(n)).filter(([nombre]) => nombre !== "sedeId"));
    for (const parametros of [sinSede, { ...semana(n), desde: "14-10-2026" }, { ...semana(n), hasta: "mañana" }]) {
      const respuesta = await consultar(n.slug, parametros);
      expect(respuesta.status).toBe(422);
      expect(await respuesta.json()).toEqual({
        error: { codigo: "DATOS_INVALIDOS", mensaje: "Revisa los datos e intenta de nuevo." },
      });
    }
  });

  test("con un slug inexistente responde 404 NO_ENCONTRADO", async () => {
    const n = await negocioConAgenda();
    const respuesta = await consultar("no-existe-este-negocio", semana(n));
    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toEqual({ error: { codigo: "NO_ENCONTRADO", mensaje: "No encontrado." } });
  });

  test("con el negocio suspendido responde 403 NEGOCIO_SUSPENDIDO (PUB-07)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    const respuesta = await consultar(n.slug, semana(n));
    expect(respuesta.status).toBe(403);
    expect(await respuesta.json()).toEqual({
      error: { codigo: "NEGOCIO_SUSPENDIDO", mensaje: "Reservas no disponibles." },
    });
  });
});
