import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AvisoSuscripcion } from "@/componentes/panel/aviso-suscripcion";
import type { EstadoEfectivo } from "@/dominio/suscripcion";

// Aviso de la suscripción en el panel (PAN-19; RN-04, RN-31, D-14).

const BOGOTA = "America/Bogota";

/** Texto del aviso, sin etiquetas y con los espacios especiales de `Intl` normalizados. */
function texto(estado: EstadoEfectivo) {
  return renderToStaticMarkup(createElement(AvisoSuscripcion, { estado, zonaHoraria: BOGOTA }))
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u00a0\u202f\s]+/g, " ")
    .trim();
}

describe("AvisoSuscripcion", () => {
  test("en gracia dice hasta cuándo renovar, con la fecha de suspendeEn en la zona del negocio (PAN-19)", () => {
    // Pagado hasta el 9 de octubre: vence el 10 a las 00:00 y se suspende el 13 a las 00:00 locales.
    const suspendeEn = new Date("2026-10-13T05:00:00Z");

    expect(texto({ estado: "en_gracia", suspendeEn })).toBe(
      "Tu suscripción venció. Renueva antes del 13 de octubre de 2026 para no perder el servicio.",
    );
  });

  test("suspendido avisa que el panel está en solo lectura e invita a renovar (D-14)", () => {
    const aviso = texto({ estado: "suspendida" });

    expect(aviso).toContain("solo lectura");
    expect(aviso).toContain("Renueva tu suscripción");
  });

  test("al día no muestra nada", () => {
    expect(texto({ estado: "al_dia" })).toBe("");
  });
});
