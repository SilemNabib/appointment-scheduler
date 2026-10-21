import { describe, expect, test } from "vitest";
import {
  BLANCO,
  coloresMarca,
  contraste,
  FONDO,
  LIMA,
  luminancia,
  NEGRO,
  sirveComoTexto,
  SUPERFICIE,
  textoSobre,
  TINTA,
} from "@/dominio/color";

// Color de marca y contraste (RNF-03; DESIGN §2.1; Q-42).

describe("contraste (WCAG 2.1)", () => {
  test("entre #ffffff y #000000 es 21, y el de un color consigo mismo es 1", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 5);
    for (const color of ["#2b3fd6", "#f5d90a", TINTA]) expect(contraste(color, color)).toBe(1);
  });

  test("coincide con valores de referencia y acepta mayúsculas", () => {
    expect(luminancia("#ffffff")).toBeCloseTo(1, 5);
    expect(luminancia("#000000")).toBe(0);
    expect(contraste("#767676", "#FFFFFF")).toBeCloseTo(4.54, 2); // el gris más claro que cumple AA sobre blanco
  });

  test("un color que no es #rrggbb lanza", () => {
    expect(() => contraste("azul", BLANCO)).toThrow();
    expect(() => contraste("#fff", BLANCO)).toThrow();
  });
});

describe("decisiones de Q-42", () => {
  test("con #2b3fd6, el texto sobre el acento es blanco y el acento sirve como texto", () => {
    expect(textoSobre("#2b3fd6")).toBe(BLANCO);
    expect(sirveComoTexto("#2b3fd6")).toBe(true);
    expect(coloresMarca("#2b3fd6")).toEqual({ acento: "#2b3fd6", sobreAcento: BLANCO, acentoTexto: "#2b3fd6", destaque: LIMA });
  });

  test("con #f5d90a, el texto sobre el acento es tinta y el acento no sirve como texto: esos textos usan tinta", () => {
    expect(textoSobre("#f5d90a")).toBe(TINTA);
    expect(sirveComoTexto("#f5d90a")).toBe(false);
    expect(coloresMarca("#F5D90A")).toMatchObject({ acento: "#f5d90a", sobreAcento: TINTA, acentoTexto: TINTA });
  });

  test("cada resultado cumple al menos 4.5:1", () => {
    for (const color of ["#2b3fd6", "#f5d90a", "#0f766e", "#b4321e", "#15171a", "#ffffff", "#8c9bff", "#777777", "#757575", "#7a7a7a", "#d9f36b"]) {
      const { acento, sobreAcento, acentoTexto } = coloresMarca(color);
      expect(contraste(sobreAcento, acento), color).toBeGreaterThanOrEqual(4.5);
      expect(contraste(acentoTexto, SUPERFICIE), color).toBeGreaterThanOrEqual(4.5);
      expect(contraste(acentoTexto, FONDO), color).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("con un gris medio que no da 4.5:1 ni con blanco ni con tinta, el texto sobre el acento es negro puro", () => {
    expect(contraste(BLANCO, "#777777")).toBeLessThan(4.5);
    expect(contraste(TINTA, "#777777")).toBeLessThan(4.5);
    expect(textoSobre("#777777")).toBe(NEGRO);
  });

  test("el secundario reemplaza a lima en los destaques solo si contrasta con tinta", () => {
    expect(coloresMarca("#2b3fd6", "#F5D90A").destaque).toBe("#f5d90a");
    expect(coloresMarca("#2b3fd6", "#1d4ed8").destaque).toBe(LIMA);
    expect(coloresMarca("#2b3fd6", null).destaque).toBe(LIMA);
  });
});
