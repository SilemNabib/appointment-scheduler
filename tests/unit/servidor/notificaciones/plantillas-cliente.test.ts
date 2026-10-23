import { beforeEach, describe, expect, test, vi } from "vitest";
import { asuntoConfirmacion, Confirmacion, type DatosConfirmacion } from "@/servidor/notificaciones/plantillas/confirmacion";
import { asuntoRecordatorio, Recordatorio } from "@/servidor/notificaciones/plantillas/recordatorio";
import { renderizar } from "@/servidor/notificaciones/plantillas/render";

// Plantillas de los correos al cliente (PRD §5.4; RN-03, RN-24, RNF-02; Q-65).

const BOGOTA = "America/Bogota";
const URL_GESTION = "https://agenda.example.com/consultorio-ana/cita/6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f/Xk3pQ9vZ2mN8rT4wY7bC1dF6gH0jL5sA9eU2iO3qW8z";
const URL_POLITICA = "https://agenda.example.com/consultorio-ana/politica/2";

/** `Intl` separa "7:00 p. m." con espacios especiales según la versión de ICU (formato.ts). */
const plano = (texto: string) => texto.replace(/[  ]/g, " ");

/** Una cita a las 7:00 p. m. del 14 de octubre en Bogotá, que en UTC es el 15 (ARCH §9). */
const datos: DatosConfirmacion = {
  negocio: {
    nombre: "Consultorio Ana",
    logoUrl: null,
    acento: "#2b3fd6",
    contactos: [{ tipo: "whatsapp", valor: "+573001234567", etiqueta: null }],
  },
  zonaHoraria: BOGOTA,
  cita: {
    servicio: "Limpieza dental",
    inicio: new Date("2026-10-15T00:00:00Z"),
    fin: new Date("2026-10-15T00:30:00Z"),
    direccion: "Calle 10 # 5-20, Bogotá",
    codigo: "OV-4821",
  },
  urlGestion: URL_GESTION,
  urlPolitica: URL_POLITICA,
};

// La suite corre con una zona lejana a la del negocio: las horas no deben depender de ella (RN-03).
beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe.each([
  ["C-01 (confirmación)", () => Confirmacion(datos)],
  ["C-02 (recordatorio)", () => Recordatorio(datos)],
])("%s", (_, plantilla) => {
  test("la cita de 2026-10-15T00:00:00Z se lee el 14 de octubre a las 7:00 p. m., en el HTML y en el texto (RN-03, RNF-02)", async () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Tokyo");
    const { html, texto } = await renderizar(plantilla());
    for (const salida of [plano(html), plano(texto)]) {
      expect(salida).toContain("Miércoles, 14 de octubre de 2026");
      expect(salida).toContain("7:00 p. m. – 7:30 p. m.");
      expect(salida).not.toContain("15 de octubre");
    }
  });

  test("lleva el negocio, el servicio, la dirección con Cómo llegar, el código, el link de gestión y la política (Q-65)", async () => {
    const { html, texto } = await renderizar(plantilla());
    for (const salida of [html, texto]) {
      expect(salida).toContain("Consultorio Ana");
      expect(salida).toContain("Limpieza dental");
      expect(salida).toContain("Calle 10 # 5-20, Bogotá");
      expect(salida).toContain("OV-4821");
      expect(salida).toContain(URL_GESTION);
      expect(salida).toContain(URL_POLITICA);
    }
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=Calle%2010%20%23%205-20%2C%20Bogot%C3%A1"');
    expect(texto).toContain("Cómo llegar");
    // Los contactos del negocio van al pie (Q-65).
    expect(texto).toContain("WhatsApp: 300 123 4567");
  });

  test("no lleva el teléfono ni el correo del cliente: solo el contacto del negocio (RN-24)", async () => {
    const { html, texto } = await renderizar(plantilla());
    for (const salida of [html, texto]) {
      expect(salida).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const sinElNegocio = salida.replace(/\+?573001234567|300 123 4567/g, "");
      expect(sinElNegocio).not.toMatch(/\b3\d{2} ?\d{3} ?\d{4}\b/);
    }
  });

  test("da lo mismo con la zona del proceso en Bogotá", async () => {
    const enTokio = await renderizar(plantilla());
    vi.stubEnv("TZ", BOGOTA);
    expect(await renderizar(plantilla())).toEqual(enTokio);
  });
});

describe("asuntos (Q-65)", () => {
  test("C-01: Tu cita en {negocio} está confirmada", () => {
    expect(asuntoConfirmacion("Consultorio Ana")).toBe("Tu cita en Consultorio Ana está confirmada");
  });

  test("C-02: Recordatorio: tu cita en {negocio} es el {fecha}, en la zona del negocio", () => {
    expect(plano(asuntoRecordatorio("Consultorio Ana", datos.cita.inicio, BOGOTA))).toBe(
      "Recordatorio: tu cita en Consultorio Ana es el miércoles, 14 de octubre",
    );
  });
});

test("C-01 menciona la invitación de calendario; C-02 no, porque no la lleva (ARCH §14.6)", async () => {
  expect((await renderizar(Confirmacion(datos))).texto).toContain("invitación");
  expect((await renderizar(Recordatorio(datos))).texto).not.toContain("invitación");
});

test("sin dirección, no hay Cómo llegar", async () => {
  const { texto } = await renderizar(Confirmacion({ ...datos, cita: { ...datos.cita, direccion: null } }));
  expect(texto).not.toContain("Cómo llegar");
  expect(texto).not.toContain("Dirección");
});
