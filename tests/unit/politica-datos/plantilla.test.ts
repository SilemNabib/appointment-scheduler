import { describe, expect, test } from "vitest";
import { AVISO_REVISION_PENDIENTE, politicaInicial } from "@/servidor/politica-datos/plantilla";

// Plantilla de la política de datos (D-05; ARCH §19.3; Q-10).

describe("servidor/politica-datos/plantilla", () => {
  const politica = politicaInicial("Óptica Visión");
  const secciones = [...politica.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

  test("tiene las secciones que exige ARCH §19.3", () => {
    expect(secciones).toEqual(
      expect.arrayContaining([
        "Finalidad",
        "Derechos del titular",
        "Datos sensibles: salud",
        "Canal de atención",
        "Proveedores fuera de Colombia",
      ]),
    );
  });

  test("nombra al negocio como responsable del tratamiento", () => {
    expect(politica).toContain("# Política de tratamiento de datos personales de Óptica Visión");
    expect(politica).toContain("Óptica Visión es el **responsable del tratamiento**");
  });

  test("empieza con el aviso visible de que falta la revisión de un abogado (Q-10)", () => {
    expect(politica.startsWith(`> ${AVISO_REVISION_PENDIENTE}`)).toBe(true);
    expect(AVISO_REVISION_PENDIENTE).toMatch(/revisión legal/);
  });

  test("informa los proveedores que procesan datos fuera de Colombia (ARCH §19.3)", () => {
    for (const proveedor of ["Cloudflare", "Neon", "Clerk", "Resend"]) {
      expect(politica).toContain(`**${proveedor}**`);
    }
  });

  test("escapa el Markdown del nombre del negocio", () => {
    const conMarcas = politicaInicial("Clínica *Sol* [norte]");

    expect(conMarcas).toContain("Clínica \\*Sol\\* \\[norte\\] es el **responsable del tratamiento**");
    expect(conMarcas).not.toContain("*Sol*");
  });
});
