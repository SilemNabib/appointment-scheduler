import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  CLAVES_FUNCIONALIDADES,
  CLAVES_LIMITES,
  FUNCIONALIDADES,
  LIMITES,
} from "@/servidor/planes/catalogo";

describe("servidor/planes/catalogo (ARCH §16.2)", () => {
  test("tiene las 6 funcionalidades de PRD §8.8, todas deshabilitadas por defecto", () => {
    expect(CLAVES_FUNCIONALIDADES).toEqual([
      "online_payments",
      "custom_booking_fields",
      "multi_user",
      "resource_per_service",
      "whatsapp_notifications",
      "reports",
    ]);
    for (const clave of CLAVES_FUNCIONALIDADES) {
      expect(FUNCIONALIDADES[clave].porDefecto, clave).toBe(false);
    }
  });

  test("tiene los 6 límites de PRD §8.8, en 0 por defecto salvo max_locations, en 1", () => {
    expect(Object.fromEntries(CLAVES_LIMITES.map((clave) => [clave, LIMITES[clave].porDefecto]))).toEqual({
      max_resources: 0,
      max_users: 0,
      max_services: 0,
      max_appointments_per_month: 0,
      max_emails_per_month: 0,
      max_locations: 1,
    });
  });

  test("el archivo empieza con import 'server-only'", () => {
    const fuente = readFileSync("src/servidor/planes/catalogo.ts", "utf8");
    expect(fuente).toMatch(/^import ["']server-only["'];/);
  });
});
