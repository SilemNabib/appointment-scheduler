import { describe, expect, test } from "vitest";
import {
  enlaceContacto,
  enlaceMapa,
  MAXIMO_CONTACTOS,
  validarContactos,
  valorVisible,
  type ContactoEntrada,
} from "@/dominio/contactos";

// Contactos de la sede (D-29, D-30; Q-40).

/** Los `CHECK` de `contacto_sede` (ARCH §18.2). */
const CHECK_TELEFONO = /^\+[1-9][0-9]{6,14}$/;

describe("validarContactos", () => {
  test('un WhatsApp "300 123 4567" da +573001234567 y el enlace https://wa.me/573001234567', () => {
    const resultado = validarContactos([{ tipo: "whatsapp", valor: "300 123 4567" }]);
    expect(resultado).toEqual({ ok: true, valor: [{ tipo: "whatsapp", valor: "+573001234567", etiqueta: null }] });
    expect(resultado.ok && enlaceContacto(resultado.valor[0])).toBe("https://wa.me/573001234567");
  });

  test("normaliza cada tipo, conserva el orden y recorta la etiqueta (vacía = sin etiqueta)", () => {
    const lista: ContactoEntrada[] = [
      { tipo: "correo", valor: "  Citas@Optica.COM ", etiqueta: " Citas " },
      { tipo: "telefono", valor: "(601) 234-5678", etiqueta: "" },
      { tipo: "whatsapp", valor: "+1 202 555 0143", etiqueta: "   " },
    ];
    expect(validarContactos(lista)).toEqual({
      ok: true,
      valor: [
        { tipo: "correo", valor: "citas@optica.com", etiqueta: "Citas" },
        { tipo: "telefono", valor: "+576012345678", etiqueta: null },
        { tipo: "whatsapp", valor: "+12025550143", etiqueta: null },
      ],
    });
  });

  test("todo teléfono y WhatsApp válido cumple el CHECK de contacto_sede", () => {
    const resultado = validarContactos([
      { tipo: "telefono", valor: "3001234567" },
      { tipo: "whatsapp", valor: "+34 612 34 56 78" },
    ]);
    expect(resultado.ok).toBe(true);
    for (const c of resultado.ok ? resultado.valor : []) expect(c.valor).toMatch(CHECK_TELEFONO);
  });

  test("una lista vacía es válida", () => {
    expect(validarContactos([])).toEqual({ ok: true, valor: [] });
  });

  test.each([
    ["un teléfono no válido", { tipo: "telefono", valor: "123" }, "valor"],
    ["un WhatsApp que no es un número", { tipo: "whatsapp", valor: "mi whatsapp" }, "valor"],
    ["un correo sin arroba", { tipo: "correo", valor: "citas.optica.com" }, "valor"],
    ["un correo sin dominio", { tipo: "correo", valor: "citas@optica" }, "valor"],
    ["un correo con espacios", { tipo: "correo", valor: "ci tas@optica.com" }, "valor"],
    ["un tipo desconocido", { tipo: "fax", valor: "3001234567" }, "tipo"],
    ["una etiqueta de 41 caracteres", { tipo: "telefono", valor: "3001234567", etiqueta: "x".repeat(41) }, "etiqueta"],
  ] as const)("%s devuelve el error con el índice de ese contacto", (_caso, contacto, motivo) => {
    const lista: ContactoEntrada[] = [{ tipo: "correo", valor: "citas@optica.com" }, contacto];
    expect(validarContactos(lista)).toEqual({ ok: false, error: { motivo, indice: 1 } });
  });

  test(`más de ${MAXIMO_CONTACTOS} contactos devuelve "demasiados"`, () => {
    const lista = Array.from({ length: MAXIMO_CONTACTOS + 1 }, () => ({ tipo: "telefono", valor: "3001234567" }));
    expect(validarContactos(lista)).toEqual({ ok: false, error: { motivo: "demasiados" } });
    expect(validarContactos(lista.slice(1)).ok).toBe(true);
  });
});

describe("enlaces (PUB-01; D-30)", () => {
  test("teléfono y correo dan tel: y mailto:", () => {
    expect(enlaceContacto({ tipo: "telefono", valor: "+576012345678" })).toBe("tel:+576012345678");
    expect(enlaceContacto({ tipo: "correo", valor: "citas@optica.com" })).toBe("mailto:citas@optica.com");
  });

  test("el enlace de Google Maps codifica la dirección en el parámetro query", () => {
    const enlace = enlaceMapa("Cra. 7 # 12-34, Bogotá");
    expect(enlace).toBe("https://www.google.com/maps/search/?api=1&query=Cra.%207%20%23%2012-34%2C%20Bogot%C3%A1");
    expect(new URL(enlace).searchParams.get("query")).toBe("Cra. 7 # 12-34, Bogotá");
  });
});

describe("valorVisible", () => {
  test("un número colombiano de 10 dígitos va en grupos y sin indicativo; los demás, en E.164", () => {
    expect(valorVisible({ tipo: "whatsapp", valor: "+573001234567" })).toBe("300 123 4567");
    expect(valorVisible({ tipo: "telefono", valor: "+576012345678" })).toBe("601 234 5678");
    expect(valorVisible({ tipo: "telefono", valor: "+12025550143" })).toBe("+12025550143");
    expect(valorVisible({ tipo: "correo", valor: "hola@optica.com" })).toBe("hola@optica.com");
  });
});
