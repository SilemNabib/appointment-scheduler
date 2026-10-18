import { describe, expect, test } from "vitest";
import { normalizarCorreo, normalizarTelefono } from "@/dominio/identidad-cliente";

// Identidad del cliente (RN-18, RN-19; ARCH §12 y §20, suite `dominio/identidad-cliente`).

/** El `CHECK` de `cliente.telefono_e164` (ARCH §18.2). */
const CHECK_TELEFONO = /^\+[1-9][0-9]{6,14}$/;

describe("normalizarTelefono (RN-18.1)", () => {
  test.each(["300 123 4567", "+57 300-123-4567", "3001234567", "+573001234567", "(300) 123-4567", "  300.123.4567  "])(
    '"%s" da +573001234567 (ARCH §20)',
    (telefono) => {
      expect(normalizarTelefono(telefono)).toBe("+573001234567");
    },
  );

  test("un fijo de Colombia y un número de otro país con su prefijo también se normalizan", () => {
    expect(normalizarTelefono("601 234 5678")).toBe("+576012345678");
    expect(normalizarTelefono("+1 202 555 0143")).toBe("+12025550143");
    expect(normalizarTelefono("+34 612 34 56 78")).toBe("+34612345678");
  });

  test.each(["", "   ", "123", "300 123", "abc", "300 123 4567 890", "+57", "+999 123 4567"])(
    'rechaza "%s": no es un número válido',
    (telefono) => {
      expect(normalizarTelefono(telefono)).toBeNull();
    },
  );

  test("todo teléfono normalizado cumple el CHECK de cliente.telefono_e164", () => {
    const telefonos = [
      "300 123 4567",
      "310-555-0000",
      "+57 320 987 6543",
      "601 234 5678",
      "604 444 1234",
      "+1 202 555 0143",
      "+34 612 34 56 78",
      "+52 55 1234 5678",
      "+593 99 123 4567",
      "+58 412 123 4567",
    ];
    for (const telefono of telefonos) {
      const normalizado = normalizarTelefono(telefono);
      expect(normalizado, telefono).not.toBeNull();
      expect(normalizado).toMatch(CHECK_TELEFONO);
    }
  });
});

describe("normalizarCorreo (RN-18.2)", () => {
  test('" Ana@Mail.com " da "ana@mail.com" (ARCH §20)', () => {
    expect(normalizarCorreo(" Ana@Mail.com ")).toBe("ana@mail.com");
  });

  test("un correo ya normalizado no cambia", () => {
    expect(normalizarCorreo("ana@mail.com")).toBe("ana@mail.com");
  });
});
