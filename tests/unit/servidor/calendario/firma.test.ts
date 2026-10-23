import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { tokenDeCalendario, urlsDeCalendario, verificarTokenDeCalendario } from "@/servidor/calendario/firma";
import { tokenDeGestion } from "@/servidor/gestion-cita/firma";

// Firma del enlace de calendario del dueño (RN-35; ADR-17, ARCH §14.7).

const ENLACE = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";
const OTRO = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

beforeEach(() => {
  vi.stubEnv("CALENDARIO_SECRET", "secreto-del-calendario-de-prueba");
  vi.stubEnv("GESTION_CITA_SECRET", "secreto-de-gestion-de-prueba");
  vi.stubEnv("APP_URL", "https://agenda.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tokenDeCalendario y verificarTokenDeCalendario (ARCH §14.7)", () => {
  test("el token de un enlace se verifica con su id y no con otro", async () => {
    const token = await tokenDeCalendario(ENLACE);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await verificarTokenDeCalendario(ENLACE, token)).toBe(true);
    expect(await verificarTokenDeCalendario(OTRO, token)).toBe(false);
  });

  test("un token de gestión del mismo id no sirve como token de calendario", async () => {
    const deGestion = await tokenDeGestion({ id: ENLACE, tokenVersion: 1 });
    expect(await verificarTokenDeCalendario(ENLACE, deGestion)).toBe(false);
  });

  test("tampoco con el mismo secreto: los prefijos son distintos", async () => {
    vi.stubEnv("GESTION_CITA_SECRET", "secreto-del-calendario-de-prueba");
    const deGestion = await tokenDeGestion({ id: ENLACE, tokenVersion: 1 });
    expect(await verificarTokenDeCalendario(ENLACE, deGestion)).toBe(false);
  });

  test("sin CALENDARIO_SECRET, firmar lanza un error", async () => {
    vi.stubEnv("CALENDARIO_SECRET", undefined);
    await expect(tokenDeCalendario(ENLACE)).rejects.toThrow(/CALENDARIO_SECRET/);
  });
});

describe("urlsDeCalendario (ARCH §14.7)", () => {
  test("arma la URL https:// de la ruta del calendario", async () => {
    const token = await tokenDeCalendario(ENLACE);
    const { https } = await urlsDeCalendario(ENLACE);
    expect(https).toBe(`https://agenda.example.com/api/calendario/${ENLACE}/${token}`);
  });

  test("la URL webcal:// es la https:// con otro esquema", async () => {
    const { https, webcal } = await urlsDeCalendario(ENLACE);
    expect(webcal.startsWith("webcal://")).toBe(true);
    expect(webcal.replace(/^webcal:/, "https:")).toBe(https);
  });

  test("con APP_URL en http (desarrollo), webcal:// también reemplaza el esquema", async () => {
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const { https, webcal } = await urlsDeCalendario(ENLACE);
    expect(https.startsWith("http://localhost:3000/api/calendario/")).toBe(true);
    expect(webcal).toBe(https.replace(/^http:/, "webcal:"));
  });
});
