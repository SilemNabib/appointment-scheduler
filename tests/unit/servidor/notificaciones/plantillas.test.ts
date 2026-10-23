import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TINTA } from "@/dominio/color";
import type { Marca } from "@/servidor/notificaciones/plantillas/diseno";
import { renderizar } from "@/servidor/notificaciones/plantillas/render";
import {
  conNombre,
  remitenteDeCitas,
  remitenteDeCuenta,
  responderADeCitas,
} from "@/servidor/notificaciones/remitente";
import { PlantillaPrueba, URL_BOTON } from "./plantilla-prueba";

// Base de las plantillas y remitente (RNF-02, RNF-03; ARCH §14.3; Q-42 de TASKS-04, Q-63,
// Q-66, Q-77).

beforeEach(() => {
  vi.stubEnv("CORREO_REMITENTE", "onboarding@resend.dev");
  vi.stubEnv("CORREO_CUENTA", "cuenta@agenda.example.com");
  vi.stubEnv("CORREO_SOPORTE", "soporte@agenda.example.com");
  vi.stubEnv("NOMBRE_PRODUCTO", "Agenda de citas");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("remitente (ARCH §14.3)", () => {
  test('los correos de citas salen como "{nombre del negocio}" <CORREO_REMITENTE>', () => {
    expect(remitenteDeCitas("Consultorio Ana")).toBe('"Consultorio Ana" <onboarding@resend.dev>');
  });

  test("el nombre se escapa: comillas, barras y saltos de línea no rompen el encabezado", () => {
    expect(remitenteDeCitas('Estudio "Ébano" \\ Sur')).toBe('"Estudio \\"Ébano\\" \\\\ Sur" <onboarding@resend.dev>');
    expect(remitenteDeCitas("Ana\r\nBcc: otro@mail.com")).toBe('"Ana Bcc: otro@mail.com" <onboarding@resend.dev>');
    expect(conNombre("  Café, té y más  ", "x@y.co")).toBe('"Café, té y más" <x@y.co>');
  });

  test('los de la cuenta salen como "{NOMBRE_PRODUCTO}" <CORREO_CUENTA>, con reply_to CORREO_SOPORTE (Q-66)', () => {
    expect(remitenteDeCuenta()).toEqual({
      remitente: '"Agenda de citas" <cuenta@agenda.example.com>',
      responderA: "soporte@agenda.example.com",
    });
  });

  test.each(["CORREO_REMITENTE", "CORREO_CUENTA", "CORREO_SOPORTE", "NOMBRE_PRODUCTO"])("sin %s, lanza un error", (nombre) => {
    vi.stubEnv(nombre, undefined);
    const armar = nombre === "CORREO_REMITENTE" ? () => remitenteDeCitas("Ana") : () => remitenteDeCuenta();
    expect(armar).toThrow(new RegExp(nombre));
  });
});

describe("reply_to de los correos de citas (Q-63)", () => {
  const correos = {
    correoContacto: "contacto@ana.com",
    correosDeLaSede: ["sede1@ana.com", "sede2@ana.com"],
    correoDueno: "dueno@ana.com",
  };

  test.each<[string, Parameters<typeof responderADeCitas>[0], string | null]>([
    ["primero, correo_contacto del negocio", correos, "contacto@ana.com"],
    ["sin él, el primer contacto correo de la sede principal", { ...correos, correoContacto: null }, "sede1@ana.com"],
    ["sin contactos correo, el correo del dueño", { ...correos, correoContacto: null, correosDeLaSede: [] }, "dueno@ana.com"],
    ["sin ninguno, null", { correoContacto: null, correosDeLaSede: [], correoDueno: null }, null],
  ])("%s", (_, entrada, esperado) => {
    expect(responderADeCitas(entrada)).toBe(esperado);
  });
});

describe("base de las plantillas (RNF-02, RNF-03; Q-42 de TASKS-04)", () => {
  const negocio = (acento: string): Marca => ({
    tipo: "negocio",
    nombre: "Consultorio Ana",
    logoUrl: "https://agenda.example.com/api/media/logo.png",
    acento,
  });

  const prueba = (marca: Marca) => PlantillaPrueba({ marca });

  /** El estilo del enlace del botón. */
  const estiloDelBoton = (html: string) => new RegExp(`<a[^>]*href="${URL_BOTON}"[^>]*style="([^"]*)"`).exec(html)?.[1] ?? "";

  test('produce HTML con lang="es" y su texto plano', async () => {
    const { html, texto } = await renderizar(prueba(negocio("#2b3fd6")));
    expect(html).toMatch(/<html[^>]*lang="es"/);
    expect(html).toContain("Tu cita está confirmada");
    expect(html).toContain('src="https://agenda.example.com/api/media/logo.png"');
    expect(texto).toContain("Consultorio Ana");
    expect(texto).toContain("Tu cita está confirmada");
    expect(texto).toContain("Te esperamos.");
    expect(texto).toContain("OV-4821");
    expect(texto).toContain(URL_BOTON);
    expect(texto).toContain("300 123 4567");
    expect(texto).toContain("Recepción: contacto@ana.com");
    // Los títulos no pasan a mayúsculas, y el texto plano no trae HTML.
    expect(texto).not.toContain("TU CITA");
    expect(texto).not.toMatch(/<[a-z]/i);
  });

  test("con el acento #f5d90a, el texto del botón es tinta (RNF-03)", async () => {
    const estilo = estiloDelBoton((await renderizar(prueba(negocio("#f5d90a")))).html);
    expect(estilo).toMatch(/background-color:#f5d90a/);
    expect(estilo).toMatch(new RegExp(`(^|;)color:${TINTA}`));
  });

  test("con el acento por defecto (#2b3fd6), el texto del botón es blanco", async () => {
    const estilo = estiloDelBoton((await renderizar(prueba(negocio("#2b3fd6")))).html);
    expect(estilo).toMatch(/(^|;)color:#ffffff/);
  });

  test("los correos del producto llevan su nombre, sin logo, y el botón en tinta (S-16)", async () => {
    const { html } = await renderizar(prueba({ tipo: "producto", nombre: "Agenda de citas" }));
    expect(html).toContain("Agenda de citas");
    expect(html).not.toContain("<img");
    expect(estiloDelBoton(html)).toMatch(new RegExp(`background-color:${TINTA}`));
  });
});
