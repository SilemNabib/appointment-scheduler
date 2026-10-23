import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { tokenDeGestion, urlDeGestion, verificarTokenDeGestion } from "@/servidor/gestion-cita/firma";

// Firma de los links de gestión (RN-13; ADR-09, ARCH §13).

const SECRETO = "secreto-de-prueba-de-32-bytes-al-azar";
const ANTERIOR = "secreto-anterior-de-la-rotacion";
const CITA = { id: "6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f", tokenVersion: 1 };
const OTRA = { id: "0b8e7c6d-5a4b-4f3e-9d2c-1b0a9f8e7d6c", tokenVersion: 1 };
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

beforeEach(() => {
  vi.stubEnv("GESTION_CITA_SECRET", SECRETO);
  vi.stubEnv("GESTION_CITA_SECRET_ANTERIOR", undefined);
  vi.stubEnv("APP_URL", "https://agenda.example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tokenDeGestion y verificarTokenDeGestion (ARCH §13)", () => {
  test("el token de una cita se verifica con su token_version", async () => {
    const token = await tokenDeGestion(CITA);
    expect(await verificarTokenDeGestion(CITA, token)).toBe(true);
  });

  test("no se verifica con otra versión ni con otro citaId", async () => {
    const token = await tokenDeGestion(CITA);
    expect(await verificarTokenDeGestion({ ...CITA, tokenVersion: 2 }, token)).toBe(false);
    expect(await verificarTokenDeGestion(OTRA, token)).toBe(false);
  });

  test("subir token_version invalida el link anterior (revocación)", async () => {
    const anterior = await tokenDeGestion(CITA);
    const nueva = { ...CITA, tokenVersion: 2 };
    expect(await tokenDeGestion(nueva)).not.toBe(anterior);
    expect(await verificarTokenDeGestion(nueva, anterior)).toBe(false);
  });

  test("con cualquier carácter cambiado, no se verifica", async () => {
    const token = await tokenDeGestion(CITA);
    for (let i = 0; i < token.length; i++) {
      // El siguiente carácter del alfabeto: en la última posición también cambia los 2
      // bits que la decodificación descarta (codificación no canónica).
      const otro = BASE64URL[(BASE64URL.indexOf(token[i]) + 1) % BASE64URL.length];
      const alterado = token.slice(0, i) + otro + token.slice(i + 1);
      expect(await verificarTokenDeGestion(CITA, alterado), `posición ${i}`).toBe(false);
    }
  });

  test.each([
    ["vacío", ""],
    ["corto", "abc"],
    ["con relleno", "A".repeat(42) + "="],
    ["con caracteres de base64 estándar", "+".repeat(43)],
    ["largo", "A".repeat(44)],
  ])("un token %s no se verifica", async (_, token) => {
    expect(await verificarTokenDeGestion(CITA, token)).toBe(false);
  });

  test("tiene 43 caracteres base64url (256 bits), sin =, + ni /", async () => {
    for (const tokenVersion of [1, 2, 3, 40, 32767]) {
      const token = await tokenDeGestion({ ...CITA, tokenVersion });
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});

describe("rotación del secreto (ARCH §13)", () => {
  test("el token del secreto anterior se acepta mientras exista GESTION_CITA_SECRET_ANTERIOR", async () => {
    vi.stubEnv("GESTION_CITA_SECRET", ANTERIOR);
    const firmadoConElAnterior = await tokenDeGestion(CITA);

    vi.stubEnv("GESTION_CITA_SECRET", SECRETO);
    vi.stubEnv("GESTION_CITA_SECRET_ANTERIOR", ANTERIOR);
    expect(await verificarTokenDeGestion(CITA, firmadoConElAnterior)).toBe(true);
    // El nuevo también vale, y es el que se firma.
    expect(await verificarTokenDeGestion(CITA, await tokenDeGestion(CITA))).toBe(true);
    expect(await tokenDeGestion(CITA)).not.toBe(firmadoConElAnterior);

    vi.stubEnv("GESTION_CITA_SECRET_ANTERIOR", undefined);
    expect(await verificarTokenDeGestion(CITA, firmadoConElAnterior)).toBe(false);
  });

  test("sin GESTION_CITA_SECRET, firmar lanza un error", async () => {
    vi.stubEnv("GESTION_CITA_SECRET", undefined);
    await expect(tokenDeGestion(CITA)).rejects.toThrow(/GESTION_CITA_SECRET/);
    vi.stubEnv("GESTION_CITA_SECRET", "");
    await expect(tokenDeGestion(CITA)).rejects.toThrow(/GESTION_CITA_SECRET/);
  });
});

describe("urlDeGestion (ARCH §13)", () => {
  test("arma {APP_URL}/{slug}/cita/{citaId}/{token}", async () => {
    const token = await tokenDeGestion(CITA);
    expect(await urlDeGestion("consultorio-ana", CITA)).toBe(
      `https://agenda.example.com/consultorio-ana/cita/${CITA.id}/${token}`,
    );
  });

  test("sin APP_URL, lanza un error", async () => {
    vi.stubEnv("APP_URL", undefined);
    await expect(urlDeGestion("consultorio-ana", CITA)).rejects.toThrow(/APP_URL/);
  });
});
