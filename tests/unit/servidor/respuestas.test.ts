import { describe, expect, test } from "vitest";
import { exito, fallo } from "@/dominio/resultado";
import { ERRORES_PUBLICOS, responder, respuestaError, type CodigoPublico } from "@/servidor/http/respuestas";

// Respuestas de la API pública (ARCH §18.5 y §19.2; Q-33).

/** La tabla de ARCH §18.5. */
const TABLA: [CodigoPublico, number][] = [
  ["DATOS_INVALIDOS", 422],
  ["NO_ENCONTRADO", 404],
  ["NEGOCIO_SUSPENDIDO", 403],
  ["BLOQUEO_CON_CITAS", 409],
  ["LIMITE_PLAN", 403],
  ["HORARIO_NO_DISPONIBLE", 409],
  ["FUERA_DE_PLAZO", 409],
  ["LIMITE_REPROGRAMACIONES", 409],
  ["ESTADO_INVALIDO", 409],
  ["DEMASIADAS_SOLICITUDES", 429],
];

describe("respuestaError (ARCH §18.5)", () => {
  test("la tabla de errores tiene exactamente los códigos de ARCH §18.5", () => {
    expect(Object.keys(ERRORES_PUBLICOS).sort()).toEqual(TABLA.map(([codigo]) => codigo).sort());
  });

  test.each(TABLA)("%s sale con el estado %i y el formato { error: { codigo, mensaje } }", async (codigo, estado) => {
    const respuesta = respuestaError(codigo);
    expect(respuesta.status).toBe(estado);
    expect(respuesta.headers.get("content-type")).toMatch(/^application\/json/);
    const cuerpo = (await respuesta.json()) as { error: { codigo: string; mensaje: string } };
    expect(cuerpo).toEqual({ error: { codigo, mensaje: expect.any(String) } });
    expect(cuerpo.error.mensaje.length).toBeGreaterThan(0);
  });

  test('HORARIO_NO_DISPONIBLE sale con 409 y "Esa hora se acaba de ocupar."', async () => {
    const respuesta = respuestaError("HORARIO_NO_DISPONIBLE");
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toEqual({
      error: { codigo: "HORARIO_NO_DISPONIBLE", mensaje: "Esa hora se acaba de ocupar." },
    });
  });

  test("los mensajes son los textos del PRD donde existen (Q-33)", () => {
    expect(ERRORES_PUBLICOS.NEGOCIO_SUSPENDIDO.mensaje).toMatch(/^Reservas no disponibles/); // PUB-07
    expect(ERRORES_PUBLICOS.DEMASIADAS_SOLICITUDES.mensaje).toMatch(/intenta en un minuto/i); // F-01
    expect(ERRORES_PUBLICOS.FUERA_DE_PLAZO.mensaje).toBe("Para cambios, comunícate con el negocio."); // F-02
  });

  test("no se guardan en caché", () => {
    expect(respuestaError("NO_ENCONTRADO").headers.get("cache-control")).toBe("no-store");
  });
});

describe("responder", () => {
  test("un éxito sale con su valor como JSON y el estado indicado", async () => {
    const respuesta = responder(exito({ citaId: "c-1", inicio: "2030-03-04T13:00:00.000Z" }), 201);
    expect(respuesta.status).toBe(201);
    expect(await respuesta.json()).toEqual({ citaId: "c-1", inicio: "2030-03-04T13:00:00.000Z" });
  });

  test("un éxito sin estado indicado sale con 200", () => {
    expect(responder(exito({ dias: [] })).status).toBe(200);
  });

  test("un error no incluye datos del cliente ni detalles internos (ARCH §19.2)", async () => {
    // Aunque el resultado traiga más campos (por ejemplo, las citas de BLOQUEO_CON_CITAS),
    // la respuesta pública solo lleva el código y su mensaje fijo.
    const conDatos = { ...fallo("HORARIO_NO_DISPONIBLE" as const), cliente: "Ana Pérez", telefono: "+573001234567" };
    const respuesta = responder(conDatos);
    const texto = await respuesta.text();
    expect(respuesta.status).toBe(409);
    expect(JSON.parse(texto)).toEqual({ error: { codigo: "HORARIO_NO_DISPONIBLE", mensaje: "Esa hora se acaba de ocupar." } });
    expect(texto).not.toMatch(/Ana|\+57/);
  });
});
