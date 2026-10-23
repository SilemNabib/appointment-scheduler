import { beforeEach, describe, expect, test, vi } from "vitest";
import { asuntoCancelacion, Cancelacion } from "@/servidor/notificaciones/plantillas/cancelacion";
import { asuntoConfirmacion, Confirmacion, type DatosConfirmacion } from "@/servidor/notificaciones/plantillas/confirmacion";
import { asuntoRecordatorio, Recordatorio } from "@/servidor/notificaciones/plantillas/recordatorio";
import { renderizar } from "@/servidor/notificaciones/plantillas/render";
import { asuntoReprogramacion, Reprogramacion, type DatosReprogramacion } from "@/servidor/notificaciones/plantillas/reprogramacion";

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

describe("C-04 (reprogramación; Q-60 de TASKS-05)", () => {
  // De las 7:00 p. m. del miércoles 14 (el 15 en UTC) a las 9:00 a. m. del viernes 16.
  const reprogramacion: DatosReprogramacion = {
    negocio: datos.negocio,
    zonaHoraria: BOGOTA,
    cita: { ...datos.cita, inicio: new Date("2026-10-16T14:00:00Z"), fin: new Date("2026-10-16T14:30:00Z") },
    inicioAnterior: new Date("2026-10-15T00:00:00Z"),
    urlGestion: URL_GESTION,
  };

  test("muestra la hora anterior y la nueva en hora de Colombia, también en días distintos (RN-03)", async () => {
    const { html, texto } = await renderizar(Reprogramacion(reprogramacion));
    for (const salida of [plano(html), plano(texto)]) {
      expect(salida).toContain("Miércoles, 14 de octubre de 2026, 7:00 p. m.");
      expect(salida).toContain("Viernes, 16 de octubre de 2026, 9:00 a. m. – 9:30 a. m.");
      expect(salida).not.toContain("15 de octubre");
    }
    expect(texto.indexOf("Antes")).toBeLessThan(texto.indexOf("Ahora"));
  });

  test("lleva el link de gestión, el código y la dirección, sin la política (Q-65)", async () => {
    const { html, texto } = await renderizar(Reprogramacion(reprogramacion));
    for (const salida of [html, texto]) {
      expect(salida).toContain(URL_GESTION);
      expect(salida).toContain("OV-4821");
      expect(salida).toContain("Calle 10 # 5-20, Bogotá");
      expect(salida).not.toContain("/politica/");
    }
    expect(texto).toContain("WhatsApp: 300 123 4567");
  });

  test("da lo mismo con la zona del proceso en Bogotá", async () => {
    const enTokio = await renderizar(Reprogramacion(reprogramacion));
    vi.stubEnv("TZ", BOGOTA);
    expect(await renderizar(Reprogramacion(reprogramacion))).toEqual(enTokio);
  });
});

describe("C-03 (cancelación)", () => {
  const URL_RESERVAR = "https://agenda.example.com/consultorio-ana";
  const cancelacion = () =>
    Cancelacion({ negocio: datos.negocio, zonaHoraria: BOGOTA, cita: datos.cita, urlReservar: URL_RESERVAR });

  test("lleva el servicio, la fecha cancelada y el enlace a {APP_URL}/{slug}", async () => {
    const { html, texto } = await renderizar(cancelacion());
    expect(html).toContain(`href="${URL_RESERVAR}"`);
    for (const salida of [plano(html), plano(texto)]) {
      expect(salida).toContain("Limpieza dental");
      expect(salida).toContain("Miércoles, 14 de octubre de 2026, 7:00 p. m. – 7:30 p. m.");
      expect(salida).toContain("OV-4821");
    }
    expect(texto).toContain("WhatsApp: 300 123 4567");
  });

  test("no lleva link de gestión", async () => {
    const { html, texto } = await renderizar(cancelacion());
    for (const salida of [html, texto]) {
      expect(salida).not.toContain(URL_GESTION);
      expect(salida).not.toContain("/cita/");
    }
  });
});

test("asuntos de C-03 y C-04 (Q-65)", () => {
  expect(asuntoCancelacion("Consultorio Ana")).toBe("Tu cita en Consultorio Ana fue cancelada");
  expect(asuntoReprogramacion("Consultorio Ana")).toBe("Tu cita en Consultorio Ana cambió de hora");
});
