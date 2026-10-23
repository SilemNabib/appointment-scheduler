import { beforeEach, describe, expect, test, vi } from "vitest";
import { formatearFecha, formatearFechaLocal } from "@/dominio/formato";
import { estadoEfectivo } from "@/dominio/suscripcion";
import { instanteAVencimiento, vencimientoAInstante } from "@/dominio/tiempo";
import { asuntoGracia, CuentaGracia, type DatosGracia } from "@/servidor/notificaciones/plantillas/cuenta-gracia";
import { asuntoSuspension, CuentaSuspension, SIN_FUNCIONAR } from "@/servidor/notificaciones/plantillas/cuenta-suspension";
import { renderizar } from "@/servidor/notificaciones/plantillas/render";

// Correos de la cuenta (PRD §5.4; RN-31, D-13, D-14, S-16; ARCH §7.6; Q-66).

const BOGOTA = "America/Bogota";
const plano = (texto: string) => texto.replace(/[  ]/g, " ");

// "Pagado hasta el 9 de octubre": se guarda como las 00:00 locales del 10 (ARCH §7.6).
const vence = vencimientoAInstante("2026-10-09", BOGOTA);
const enGracia = estadoEfectivo({ estadoSuscripcion: "activa", finPrueba: null, pagadoHasta: vence }, new Date(vence.getTime() + 1));
if (enGracia.estado !== "en_gracia") throw new Error("La prueba necesita un negocio en gracia.");

const cuenta = { producto: "Agenda de citas", correoSoporte: "soporte@agenda.example.com", negocio: "Consultorio Ana", zonaHoraria: BOGOTA };
const gracia: DatosGracia = { ...cuenta, vence, suspendeEn: enGracia.suspendeEn };

beforeEach(() => {
  vi.stubEnv("TZ", "Asia/Tokyo");
  return () => vi.unstubAllEnvs();
});

describe("C-07 (suscripción vencida)", () => {
  test("muestra el vencimiento como fecha local inclusiva, igual que /admin (ARCH §7.6)", async () => {
    expect(vence.toISOString()).toBe("2026-10-10T05:00:00.000Z");
    const comoAdmin = formatearFechaLocal(instanteAVencimiento(vence, BOGOTA));
    expect(comoAdmin).toBe("9 de octubre de 2026");
    const { html, texto } = await renderizar(CuentaGracia(gracia));
    for (const salida of [html, texto]) expect(salida).toContain(comoAdmin);
  });

  test("muestra la fecha límite igual que el aviso de gracia del panel (PAN-19)", async () => {
    const comoPanel = formatearFecha(enGracia.suspendeEn, BOGOTA);
    expect(comoPanel).toBe("13 de octubre de 2026");
    const { html, texto } = await renderizar(CuentaGracia(gracia));
    for (const salida of [html, texto]) expect(salida).toContain(comoPanel);
    expect(plano(asuntoGracia(enGracia.suspendeEn, BOGOTA))).toBe("Tu suscripción venció: renueva antes del 13 de octubre de 2026");
  });

  test("lleva las instrucciones de pago y el contacto de soporte (Q-66)", async () => {
    const { html, texto } = await renderizar(CuentaGracia(gracia));
    expect(texto).toContain("responde este correo");
    expect(texto).toContain("soporte@agenda.example.com");
    expect(html).toContain('href="mailto:soporte@agenda.example.com"');
  });
});

describe("C-08 (suscripción suspendida)", () => {
  test("enumera lo que dejó de funcionar según D-14 y dice que los datos se conservan", async () => {
    const { texto } = await renderizar(CuentaSuspension(cuenta));
    for (const linea of SIN_FUNCIONAR) expect(texto).toContain(linea);
    expect(SIN_FUNCIONAR.join(" ")).toMatch(/reservas/);
    expect(SIN_FUNCIONAR.join(" ")).toMatch(/enlace del correo/);
    expect(SIN_FUNCIONAR.join(" ")).toMatch(/recordatorios/);
    expect(SIN_FUNCIONAR.join(" ")).toMatch(/solo lectura/);
    expect(texto).toContain("Tus datos se conservan");
    expect(texto).toContain("responde este correo");
    expect(texto).toContain("soporte@agenda.example.com");
    expect(asuntoSuspension()).toBe("Tu suscripción está suspendida");
  });
});

describe.each([
  ["C-07", () => CuentaGracia(gracia)],
  ["C-08", () => CuentaSuspension(cuenta)],
])("%s sale a nombre del producto (S-16)", (_, plantilla) => {
  test("con el nombre del producto, sin el logo ni el color de un negocio", async () => {
    const { html, texto } = await renderizar(plantilla());
    expect(texto.startsWith("Agenda de citas")).toBe(true);
    expect(html).not.toContain("<img");
    expect(html).not.toMatch(/background-color:#2b3fd6/i);
  });
});
