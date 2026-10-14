import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ErrorNegocio } from "@/dominio/resultado";
import { DIAS_GRACIA } from "@/dominio/suscripcion";
import { accion } from "@/servidor/accion";
import { requireEscritura, requireMiembro } from "@/servidor/auth/sesion";
import type * as esquema from "@/servidor/db/esquema";
import * as miembros from "@/servidor/db/repositorios/miembros";
import { errorDe } from "../../ayudantes-next";
import { crearMiembro, crearNegocio, idPlanIlimitado } from "../fixtures";

// Acceso al panel según el estado efectivo de la suscripción (RN-04, RN-29, RN-31,
// D-14; ARCH §7.6 y §20, Suscripción). Clerk se simula; el negocio y el dueño son reales.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const DIA = 24 * 60 * 60 * 1000;

afterEach(() => {
  vi.mocked(auth).mockReset();
});

/** Negocio con el plan ilimitado y su dueño ya vinculado, con la sesión de ese dueño. */
async function sesionDeDueno(campos: Partial<typeof esquema.negocio.$inferInsert>) {
  const negocioId = await crearNegocio(await idPlanIlimitado(), campos);
  const { correo } = await crearMiembro(negocioId);
  const clerkUserId = `user_${randomUUID().replaceAll("-", "")}`;
  await miembros.vincular(correo, clerkUserId);
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as Awaited<ReturnType<typeof auth>>);
  return negocioId;
}

/** Una Server Action que modifica datos, envuelta como en el panel. */
const accionDeEscritura = accion(async () => {
  await requireEscritura();
  return { ok: true as const, valor: "hecho" };
});

async function rechazaPorSuspension() {
  const error = await errorDe(requireEscritura());
  expect(error).toBeInstanceOf(ErrorNegocio);
  expect((error as ErrorNegocio).codigo).toBe("NEGOCIO_SUSPENDIDO");
  expect(await accionDeEscritura()).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });
}

describe("acceso según la suscripción", () => {
  test("suspendido con el plan ilimitado: el dueño obtiene su contexto, pero requireEscritura y la acción devuelven NEGOCIO_SUSPENDIDO (RN-04, RN-29)", async () => {
    const negocioId = await sesionDeDueno({ estadoSuscripcion: "suspendida" });

    // Conserva el acceso y puede consultar.
    expect(await requireMiembro()).toMatchObject({ negocioId, suscripcion: { estado: "suspendida" } });
    await rechazaPorSuspension();
  });

  test("en activa con pagado_hasta + 3 días ya pasado se trata como suspendido, aunque la columna siga en activa (RN-31)", async () => {
    const negocioId = await sesionDeDueno({
      estadoSuscripcion: "activa",
      pagadoHasta: new Date(Date.now() - (DIAS_GRACIA * DIA + 60_000)),
    });

    expect(await requireMiembro()).toMatchObject({ negocioId, suscripcion: { estado: "suspendida" } });
    await rechazaPorSuspension();
  });

  test("en gracia pasa requireEscritura y su contexto trae suspendeEn (RN-31: todo funciona)", async () => {
    const pagadoHasta = new Date(Date.now() - DIA);
    const negocioId = await sesionDeDueno({ estadoSuscripcion: "activa", pagadoHasta });

    expect(await requireEscritura()).toMatchObject({
      negocioId,
      suscripcion: { estado: "en_gracia", suspendeEn: new Date(pagadoHasta.getTime() + DIAS_GRACIA * DIA) },
    });
    expect(await accionDeEscritura()).toEqual({ ok: true, valor: "hecho" });
  });

  test("al día pasa requireEscritura", async () => {
    await sesionDeDueno({ estadoSuscripcion: "activa", pagadoHasta: new Date(Date.now() + 30 * DIA) });

    expect(await requireEscritura()).toMatchObject({ suscripcion: { estado: "al_dia" } });
  });
});
