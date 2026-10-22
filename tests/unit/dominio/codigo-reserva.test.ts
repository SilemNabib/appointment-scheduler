import { describe, expect, test } from "vitest";
import {
  DIGITOS_CODIGO_LARGO,
  FORMATO_CODIGO,
  generarCodigo,
  normalizarCodigo,
  prefijoCodigo,
  type Azar,
} from "@/dominio/codigo-reserva";

// Código de reserva (D-28; ARCH §11.4; Q-41).

/** El `CHECK` de `cita.codigo` (ARCH §18.2), escrito aparte para no probar la constante consigo misma. */
const CHECK_CODIGO = /^[A-Z]{2}-[0-9]{4,6}$/;

const fijo =
  (valor: number): Azar =>
  () =>
    valor;

describe("prefijoCodigo", () => {
  test.each([
    ["Óptica Visión Clara", "OV"],
    ["Ébano", "EB"],
    ["peluquería ñandú", "PN"],
    ["Dr. Pérez", "DP"],
    ["  Spa  123  Zen ", "SZ"],
    ["123 Spa", "SP"],
    ["X", "XX"],
  ])('"%s" da %s: sin tildes y en mayúsculas', (nombre, prefijo) => {
    expect(prefijoCodigo(nombre)).toBe(prefijo);
  });

  test.each(["", "123", "  -- ", "日本"])('un nombre sin letras ("%s") da XX', (nombre) => {
    expect(prefijoCodigo(nombre)).toBe("XX");
  });
});

describe("generarCodigo", () => {
  test("con un azar fijo, el código es OV-0042", () => {
    expect(generarCodigo("OV", fijo(42))).toBe("OV-0042");
  });

  test("con 6 dígitos, OV-000042", () => {
    expect(generarCodigo("OV", fijo(42), DIGITOS_CODIGO_LARGO)).toBe("OV-000042");
  });

  test("pide al azar un número menor que 10^dígitos", () => {
    const pedidos: number[] = [];
    const azar: Azar = (maximo) => (pedidos.push(maximo), maximo - 1);
    expect(generarCodigo("EB", azar)).toBe("EB-9999");
    expect(generarCodigo("EB", azar, DIGITOS_CODIGO_LARGO)).toBe("EB-999999");
    expect(pedidos).toEqual([10_000, 1_000_000]);
  });

  test("todo código cumple el CHECK de cita.codigo", () => {
    const nombres = ["Óptica Visión Clara", "Ébano", "123", "X", "Clínica Dental Sonrisas"];
    for (const nombre of nombres) {
      for (const valor of [0, 7, 4821, 9999]) {
        const codigo = generarCodigo(prefijoCodigo(nombre), fijo(valor));
        expect(codigo, nombre).toMatch(CHECK_CODIGO);
        expect(codigo).toMatch(FORMATO_CODIGO);
      }
      expect(generarCodigo(prefijoCodigo(nombre), fijo(123_456), DIGITOS_CODIGO_LARGO)).toMatch(CHECK_CODIGO);
    }
  });
});

describe("normalizarCodigo (Q-59)", () => {
  test.each([
    [" ov-4821 ", "OV-4821"],
    ["OV4821", "OV-4821"],
    ["ov 4821", "OV-4821"],
    ["eb-000042", "EB-000042"],
    ["OV-4821", "OV-4821"],
  ])('"%s" se normaliza como %s', (texto, codigo) => {
    expect(normalizarCodigo(texto)).toBe(codigo);
    expect(normalizarCodigo(texto)).toMatch(CHECK_CODIGO);
  });

  test.each(["", "  ", "OV", "4821", "OV-482", "OV-4821234", "O-4821", "OVX-4821", "ÓV-4821", "OV--4821", "OV-48 21", "Ana Pérez"])(
    '"%s" no puede ser un código (Q-41)',
    (texto) => {
      expect(normalizarCodigo(texto)).toBeNull();
    },
  );
});
