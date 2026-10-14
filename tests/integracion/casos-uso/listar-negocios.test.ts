import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { DIAS_GRACIA } from "@/dominio/suscripcion";
import { altaNegocio } from "@/servidor/casos-uso/alta-negocio";
import { listarNegocios } from "@/servidor/casos-uso/listar-negocios";
import { correoAleatorio, crearNegocio, idPlanIlimitado } from "../fixtures";

// Caso de uso listarNegocios (ADM-01; RN-25, RN-31; ARCH §6 y §7.6).

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ invitations: { createInvitation: vi.fn(async () => ({})) } })),
}));

beforeEach(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000");
  return () => vi.unstubAllEnvs();
});

const DIA = 24 * 60 * 60 * 1000;

async function enLaLista(negocioId: string, ahora?: Date) {
  const negocio = (await listarNegocios(ahora)).find((n) => n.id === negocioId);
  expect(negocio).toBeDefined();
  return negocio!;
}

describe("listarNegocios", () => {
  test('un negocio dado de alta en activa con "pagado hasta 2026-10-09" aparece con vencimiento 2026-10-09', async () => {
    const slug = `lista-${randomUUID().slice(0, 8)}`;
    const alta = await altaNegocio(
      {
        slug,
        nombre: "Óptica Lista",
        plan: "ilimitado",
        estadoSuscripcion: "activa",
        vencimiento: "2026-10-09",
        correoDueno: correoAleatorio(),
      },
      { clerkUserId: "user_admin_prueba" },
    );
    if (!alta.ok) throw new Error(alta.error);

    expect(await enLaLista(alta.valor.negocioId, new Date("2026-10-01T12:00:00Z"))).toEqual({
      id: alta.valor.negocioId,
      slug,
      nombre: "Óptica Lista",
      plan: "ilimitado",
      zonaHoraria: "America/Bogota",
      estadoSuscripcion: "activa",
      vencimiento: "2026-10-09",
      estado: { estado: "al_dia" },
    });
  });

  test("un negocio con el vencimiento pasado hace un día aparece en gracia, con su fecha de suspensión (RN-31)", async () => {
    const pagadoHasta = new Date(Date.now() - DIA);
    const negocioId = await crearNegocio(await idPlanIlimitado(), { estadoSuscripcion: "activa", pagadoHasta });

    expect(await enLaLista(negocioId)).toMatchObject({
      estadoSuscripcion: "activa",
      estado: { estado: "en_gracia", suspendeEn: new Date(pagadoHasta.getTime() + DIAS_GRACIA * DIA) },
    });
  });

  test("uno con el vencimiento pasado hace más de 3 días aparece suspendido, aunque la columna siga en activa (RN-31)", async () => {
    const negocioId = await crearNegocio(await idPlanIlimitado(), {
      estadoSuscripcion: "activa",
      pagadoHasta: new Date(Date.now() - (DIAS_GRACIA * DIA + 60_000)),
    });

    expect(await enLaLista(negocioId)).toMatchObject({
      estadoSuscripcion: "activa",
      estado: { estado: "suspendida" },
    });
  });

  test("un negocio en prueba muestra su fin de prueba, y uno suspendido su último vencimiento", async () => {
    const enPrueba = await crearNegocio(undefined, { finPrueba: new Date("2026-12-01T05:00:00Z") });
    const suspendido = await crearNegocio(undefined, {
      estadoSuscripcion: "suspendida",
      finPrueba: null,
      pagadoHasta: new Date("2026-10-10T05:00:00Z"),
    });

    expect(await enLaLista(enPrueba)).toMatchObject({ vencimiento: "2026-11-30" });
    expect(await enLaLista(suspendido)).toMatchObject({
      vencimiento: "2026-10-09",
      estado: { estado: "suspendida" },
    });
  });
});
