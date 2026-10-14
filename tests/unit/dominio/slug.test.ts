import { describe, expect, test } from "vitest";
import { RESERVADOS, validarSlug } from "@/dominio/slug";

describe("dominio/slug", () => {
  test("RESERVADOS tiene los 22 slugs de ARCH §5", () => {
    expect([...RESERVADOS].sort()).toEqual(
      [
        "admin", "api", "app", "ayuda", "blog", "cita", "citas", "contacto", "legal", "login",
        "logout", "panel", "planes", "precios", "privacidad", "registro", "sin-acceso",
        "soporte", "static", "status", "terminos", "www",
      ].sort(),
    );
  });

  test.each(RESERVADOS)('rechaza "%s" como reservado (RN-02)', (slug) => {
    expect(validarSlug(slug)).toEqual({ ok: false, error: "reservado" });
  });

  test.each([
    ["2 caracteres", "ab"],
    ["41 caracteres", "a".repeat(41)],
    ["mayúsculas", "Optica"],
    ["guion bajo", "optica_vision"],
    ["guion al inicio", "-optica"],
    ["guion al final", "optica-"],
    ["guion doble", "optica--vision"],
    ["_next", "_next"],
    ["espacios", "optica vision"],
    ["tildes", "óptica"],
    ["punto (nombre de archivo)", "favicon.ico"],
    ["vacío", ""],
  ])("rechaza por formato: %s (RN-02)", (_, slug) => {
    expect(validarSlug(slug)).toEqual({ ok: false, error: "formato" });
  });

  test.each([
    ["3 caracteres", "abc"],
    ["40 caracteres", "a".repeat(40)],
    ["con guiones y dígitos", "optica-vision-2"],
    ["solo dígitos", "123"],
  ])("acepta %s (RN-02)", (_, slug) => {
    expect(validarSlug(slug)).toEqual({ ok: true, valor: slug });
  });
});
