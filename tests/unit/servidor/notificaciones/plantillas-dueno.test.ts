import { beforeEach, describe, expect, test, vi } from "vitest";
import { asuntoCambio, DuenoCambio, type DatosCambio } from "@/servidor/notificaciones/plantillas/dueno-cambio";
import { asuntoCitaNueva, DuenoCitaNueva, type DatosCitaNueva } from "@/servidor/notificaciones/plantillas/dueno-cita-nueva";
import { renderizar } from "@/servidor/notificaciones/plantillas/render";

// Avisos al dueño (PRD §5.4; RN-22, RN-35; Q-65, Q-68).

const BOGOTA = "America/Bogota";
const CITA_ID = "6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f";
const URL_PANEL = `https://agenda.example.com/panel/citas/${CITA_ID}`;
const plano = (texto: string) => texto.replace(/[  ]/g, " ");

const negocio = { nombre: "Consultorio Ana", logoUrl: null, acento: "#2b3fd6" };

/** La cita de las 7:00 p. m. del 14 de octubre en Bogotá, que en UTC es el 15 (ARCH §9). */
const nueva: DatosCitaNueva = {
  negocio,
  zonaHoraria: BOGOTA,
  cita: {
    servicio: "Limpieza dental",
    inicio: new Date("2026-10-15T00:00:00Z"),
    fin: new Date("2026-10-15T00:30:00Z"),
    codigo: "OV-4821",
  },
  cliente: { nombre: "Ana", apellido: "Pérez", telefono: "+573001234567", correo: "ana.perez@mail.com" },
  urlPanel: URL_PANEL,
};

const cambio = (c: DatosCambio["cambio"]): DatosCambio => ({
  negocio,
  zonaHoraria: BOGOTA,
  cita: { servicio: "Limpieza dental", inicio: new Date("2026-10-16T14:00:00Z"), codigo: "OV-4821" },
  cliente: { nombre: "Ana", apellido: "Pérez" },
  cambio: c,
  urlPanel: URL_PANEL,
});

beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("C-05 (cita nueva)", () => {
  test("lleva el código de la cita y enlaza a {APP_URL}/panel/citas/{citaId}", async () => {
    const { html, texto } = await renderizar(DuenoCitaNueva(nueva));
    expect(html).toContain(`href="${URL_PANEL}"`);
    expect(texto).toContain(URL_PANEL);
    for (const salida of [html, texto]) expect(salida).toContain("OV-4821");
  });

  test("lleva el cliente, su contacto, el servicio y la fecha en hora de Colombia (PRD §5.4)", async () => {
    const { html, texto } = await renderizar(DuenoCitaNueva(nueva));
    for (const salida of [plano(html), plano(texto)]) {
      expect(salida).toContain("Ana Pérez");
      expect(salida).toContain("300 123 4567");
      expect(salida).toContain("ana.perez@mail.com");
      expect(salida).toContain("Limpieza dental");
      expect(salida).toContain("Miércoles, 14 de octubre de 2026");
      expect(salida).toContain("7:00 p. m. – 7:30 p. m.");
    }
    expect(html).toContain('href="tel:+573001234567"');
    expect(html).toContain('href="mailto:ana.perez@mail.com"');
  });

  test("la vista previa termina en la hora, sin otro punto después de «p. m.» (T6.41)", async () => {
    const { html } = await renderizar(DuenoCitaNueva(nueva));
    expect(plano(html)).toContain("a las 7:00 p. m.");
    expect(plano(html)).not.toMatch(/[ap]\. m\.\./);
  });

  test("sin correo del cliente, no muestra la fila del correo", async () => {
    const { texto } = await renderizar(DuenoCitaNueva({ ...nueva, cliente: { ...nueva.cliente, correo: null } }));
    expect(texto).not.toContain("Correo");
  });

  test("no menciona invitaciones de calendario: C-05 no lleva (RN-35)", async () => {
    expect((await renderizar(DuenoCitaNueva(nueva))).texto).not.toMatch(/invitaci/i);
  });

  test('asunto: "Nueva cita: {servicio}, {fecha y hora}" en la zona del negocio (Q-65)', () => {
    expect(plano(asuntoCitaNueva("Limpieza dental", nueva.cita.inicio, BOGOTA))).toBe(
      "Nueva cita: Limpieza dental, miércoles, 14 de octubre a las 7:00 p. m.",
    );
  });
});

describe("C-06 (cambio de cita; Q-68)", () => {
  test("el de una reprogramación muestra la hora anterior y la nueva", async () => {
    const datos = cambio({
      tipo: "reprogramada",
      inicioAnterior: new Date("2026-10-15T00:00:00Z"),
      inicioNuevo: new Date("2026-10-16T14:00:00Z"),
    });
    const { html, texto } = await renderizar(DuenoCambio(datos));
    for (const salida of [plano(html), plano(texto)]) {
      expect(salida).toContain("Ana Pérez cambió la hora de su cita");
      expect(salida).toContain("Miércoles, 14 de octubre de 2026, 7:00 p. m.");
      expect(salida).toContain("Viernes, 16 de octubre de 2026, 9:00 a. m.");
    }
    expect(texto.indexOf("Antes")).toBeLessThan(texto.indexOf("Ahora"));
    expect(html).toContain(`href="${URL_PANEL}"`);
  });

  test("el de una cancelación dice que el cliente la canceló", async () => {
    const { html, texto } = await renderizar(DuenoCambio(cambio({ tipo: "cancelada" })));
    for (const salida of [plano(html), plano(texto)]) {
      expect(salida).toContain("Ana Pérez canceló su cita");
      expect(salida).toContain("Viernes, 16 de octubre de 2026, 9:00 a. m.");
      expect(salida).not.toContain("Antes");
    }
    expect(html).toContain(`href="${URL_PANEL}"`);
  });

  test("no menciona invitaciones de calendario: C-06 no lleva (RN-35)", async () => {
    expect((await renderizar(DuenoCambio(cambio({ tipo: "cancelada" })))).texto).not.toMatch(/invitaci/i);
  });

  test('asunto: "Cambio en la cita {código}" (Q-65)', () => {
    expect(asuntoCambio("OV-4821")).toBe("Cambio en la cita OV-4821");
  });
});
