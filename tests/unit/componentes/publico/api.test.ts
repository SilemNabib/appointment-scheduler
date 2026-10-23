import { afterEach, describe, expect, test, vi } from "vitest";
import {
  cancelarPorLink,
  consultarDisponibilidad,
  consultarDisponibilidadGestion,
  reprogramarPorLink,
  reservar,
  type DatosReserva,
} from "@/componentes/publico/api";

// Cliente de la API pública (PUB-04, PUB-06, PUB-08; ARCH §18.5), con fetch simulado.

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });

const error = (estado: number, codigo: string, extra: Record<string, unknown> = {}) =>
  json(estado, { error: { codigo, mensaje: "…", ...extra } });

function simular(respuesta: Response | Error) {
  const fetch = vi.fn(async () => {
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const CONSULTA = { slug: "optica", sedeId: "s-1", servicioId: "v-1", desde: "2026-10-20", hasta: "2026-10-31" };
const DATOS: DatosReserva = {
  sedeId: "s-1",
  servicioId: "v-1",
  inicio: "2026-10-22T13:00:00.000Z",
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "ana@mail.com",
  politicaDatosId: "p-1",
  aceptaPolitica: true,
  sitioWeb: "",
};

describe("consultarDisponibilidad", () => {
  test("200 da los días, y pide la URL de ARCH §18.5", async () => {
    const dias = [{ fecha: "2026-10-20", inicios: [] }, { fecha: "2026-10-21", inicios: ["2026-10-21T13:00:00.000Z"] }];
    const fetch = simular(json(200, { zonaHoraria: "America/Bogota", dias }));

    expect(await consultarDisponibilidad(CONSULTA)).toEqual({ ok: true, valor: { zonaHoraria: "America/Bogota", dias } });
    expect(fetch).toHaveBeenCalledWith(
      "/api/publico/optica/disponibilidad?sedeId=s-1&servicioId=v-1&desde=2026-10-20&hasta=2026-10-31",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test.each([
    [403, "NEGOCIO_SUSPENDIDO"],
    [404, "NO_ENCONTRADO"],
    [422, "DATOS_INVALIDOS"],
  ])("%i da el error %s", async (estado, codigo) => {
    simular(error(estado, codigo));
    expect(await consultarDisponibilidad(CONSULTA)).toEqual({ ok: false, error: { codigo } });
  });
});

describe("reservar", () => {
  test("201 da la cita creada, y envía el cuerpo JSON con recursoId en null", async () => {
    const cita = { citaId: "c-1", codigo: "OV-0042", inicio: DATOS.inicio, fin: "2026-10-22T13:30:00.000Z" };
    const fetch = simular(json(201, cita));

    expect(await reservar("optica", DATOS)).toEqual({ ok: true, valor: cita });
    const [url, opciones] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/publico/optica/reservas");
    expect(opciones).toMatchObject({ method: "POST", headers: expect.objectContaining({ "content-type": "application/json" }) });
    expect(JSON.parse(String(opciones.body))).toEqual({ ...DATOS, recursoId: null });
  });

  test.each([
    [403, "NEGOCIO_SUSPENDIDO"],
    [403, "LIMITE_PLAN"],
    [404, "NO_ENCONTRADO"],
    [409, "HORARIO_NO_DISPONIBLE"],
  ])("%i da el error %s", async (estado, codigo) => {
    simular(error(estado, codigo));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo } });
  });

  test("422 con campos da DATOS_INVALIDOS con esos campos; sin campos, sin la clave", async () => {
    simular(error(422, "DATOS_INVALIDOS", { campos: ["telefono", "correo", 3] }));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "DATOS_INVALIDOS", campos: ["telefono", "correo"] } });
    simular(error(422, "DATOS_INVALIDOS"));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "DATOS_INVALIDOS" } });
  });

  test("429 da DEMASIADAS_SOLICITUDES, con o sin el JSON de §18.5", async () => {
    simular(error(429, "DEMASIADAS_SOLICITUDES"));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "DEMASIADAS_SOLICITUDES" } });
    simular(new Response("Too Many Requests", { status: 429 }));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "DEMASIADAS_SOLICITUDES" } });
  });
});

describe("error de conexión, sin lanzar excepciones", () => {
  test("una falla de red", async () => {
    simular(new TypeError("Failed to fetch"));
    await expect(reservar("optica", DATOS)).resolves.toEqual({ ok: false, error: { codigo: "CONEXION" } });
    await expect(consultarDisponibilidad(CONSULTA)).resolves.toEqual({ ok: false, error: { codigo: "CONEXION" } });
  });

  test("una página de error en HTML, un 200 con otro JSON y un código desconocido", async () => {
    simular(new Response("<html><body>Error 1101</body></html>", { status: 500, headers: { "content-type": "text/html" } }));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "CONEXION" } });
    simular(new Response("<html>ok</html>", { status: 201 }));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "CONEXION" } });
    simular(json(200, { dias: "no" }));
    expect(await consultarDisponibilidad(CONSULTA)).toEqual({ ok: false, error: { codigo: "CONEXION" } });
    simular(error(500, "ALGO_RARO"));
    expect(await reservar("optica", DATOS)).toEqual({ ok: false, error: { codigo: "CONEXION" } });
  });
});

// ─── Gestión por link (GES-02, GES-03; ARCH §18.5; Q-69) ──────────────────────

describe("gestión por link", () => {
  const LINK = { slug: "optica", citaId: "c-1", token: "t".repeat(43) };
  const GESTIONADA = { citaId: "c-1", estado: "confirmada", inicio: "2026-10-23T13:00:00.000Z", fin: "2026-10-23T13:30:00.000Z", reprogramacionesRestantes: 2 };
  const DISPONIBILIDAD = { zonaHoraria: "America/Bogota", dias: [{ fecha: "2026-10-23", inicios: ["2026-10-23T13:00:00.000Z"] }] };
  const llamadas = {
    disponibilidad: () => consultarDisponibilidadGestion(LINK, { desde: "2026-10-23", hasta: "2026-10-31" }),
    reprogramar: () => reprogramarPorLink(LINK, "2026-10-23T13:00:00.000Z"),
    cancelar: () => cancelarPorLink(LINK),
  };

  test("cada ruta va por POST con el token en el cuerpo, nunca en la URL (ARCH §18.5)", async () => {
    for (const [ruta, llamar] of Object.entries(llamadas)) {
      const fetch = simular(json(200, ruta === "disponibilidad" ? DISPONIBILIDAD : GESTIONADA));
      await llamar();
      const [url, opciones] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe(`/api/publico/optica/citas/c-1/${ruta}`);
      expect(url).not.toContain(LINK.token);
      expect(opciones.method).toBe("POST");
      expect(new Headers(opciones.headers).get("content-type")).toBe("application/json");
      expect(JSON.parse(String(opciones.body))).toEqual(expect.objectContaining({ token: LINK.token }));
    }
  });

  test("200 da la respuesta de Q-69 o la disponibilidad", async () => {
    simular(json(200, DISPONIBILIDAD));
    expect(await llamadas.disponibilidad()).toEqual({ ok: true, valor: DISPONIBILIDAD });
    simular(json(200, GESTIONADA));
    expect(await llamadas.reprogramar()).toEqual({ ok: true, valor: GESTIONADA });
    simular(json(200, { ...GESTIONADA, estado: "cancelada", reprogramacionesRestantes: null }));
    expect(await llamadas.cancelar()).toEqual({ ok: true, valor: { ...GESTIONADA, estado: "cancelada", reprogramacionesRestantes: null } });
  });

  test.each<[number, string]>([
    [404, "NO_ENCONTRADO"],
    [403, "NEGOCIO_SUSPENDIDO"],
    [409, "HORARIO_NO_DISPONIBLE"],
    [409, "FUERA_DE_PLAZO"],
    [409, "LIMITE_REPROGRAMACIONES"],
    [409, "ESTADO_INVALIDO"],
    [422, "DATOS_INVALIDOS"],
  ])("un %i con %s da ese código en las tres rutas", async (estado, codigo) => {
    for (const llamar of Object.values(llamadas)) {
      simular(error(estado, codigo));
      expect(await llamar()).toEqual({ ok: false, error: { codigo } });
    }
  });

  test("un 429, aunque no traiga el JSON de §18.5, da DEMASIADAS_SOLICITUDES", async () => {
    for (const llamar of Object.values(llamadas)) {
      simular(new Response("Too Many Requests", { status: 429 }));
      expect(await llamar()).toEqual({ ok: false, error: { codigo: "DEMASIADAS_SOLICITUDES" } });
    }
  });

  test("una falla de red, un 200 con otro cuerpo o un error desconocido dan CONEXION, sin lanzar", async () => {
    for (const llamar of Object.values(llamadas)) {
      simular(new TypeError("Failed to fetch"));
      await expect(llamar()).resolves.toEqual({ ok: false, error: { codigo: "CONEXION" } });
      simular(json(200, { otra: "cosa" }));
      await expect(llamar()).resolves.toEqual({ ok: false, error: { codigo: "CONEXION" } });
      simular(error(500, "ERROR_RARO"));
      await expect(llamar()).resolves.toEqual({ ok: false, error: { codigo: "CONEXION" } });
    }
  });
});
