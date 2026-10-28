import { auth } from "@clerk/nextjs/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { reenviarInvitacionAdmin } from "@/app/(admin)/admin/negocios/[id]/acciones";
import DetalleNegocio from "@/app/(admin)/admin/negocios/[id]/page";
import { reenviarInvitacion } from "@/servidor/casos-uso/invitacion-admin";
import * as miembros from "@/servidor/db/repositorios/miembros";
import { errorDe, esNoEncontrado } from "../../ayudantes-next";
import { ADMIN_PRUEBA, crearMiembro, crearNegocio, idPlanIlimitado } from "../fixtures";

// "Reenviar invitación" del admin (ADM-02, F-05, F-11; ADR-06; ARCH §7.4 y §19.2; Q-08 de
// TASKS-01, Q-73), con clerkClient simulado.

const createInvitation = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  clerkClient: vi.fn(async () => ({ invitations: { createInvitation } })),
}));

beforeEach(() => {
  createInvitation.mockReset().mockResolvedValue({ id: "inv_prueba" });
  vi.stubEnv("APP_URL", "https://agenda.example.com");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(auth).mockReset();
});

/** Negocio con su dueño pendiente, como lo deja el alta (ARCH §7.4). */
async function negocioConDuenoPendiente() {
  const negocioId = await crearNegocio(await idPlanIlimitado());
  const { correo } = await crearMiembro(negocioId);
  return { negocioId, correo };
}

const registros = (metodo: "log" | "error") => vi.mocked(console[metodo]).mock.calls.map(([l]) => String(l));

describe("reenviarInvitacion (Q-73)", () => {
  test("con el dueño pendiente, la invitación se crea una sola vez, con su correo y la redirectUrl de /registro, aunque haya otra pendiente", async () => {
    const { negocioId, correo } = await negocioConDuenoPendiente();

    expect(await reenviarInvitacion({ negocioId }, ADMIN_PRUEBA)).toEqual({ ok: true, valor: { invitacionEnviada: true } });

    expect(createInvitation).toHaveBeenCalledTimes(1);
    expect(createInvitation).toHaveBeenCalledWith({
      emailAddress: correo,
      redirectUrl: "https://agenda.example.com/registro",
      ignoreExisting: true,
    });
    expect(registros("log").map((l) => JSON.parse(l))).toContainEqual({
      evento: "invitacion_reenviada",
      negocioId,
      admin: ADMIN_PRUEBA.clerkUserId,
    });
  });

  test("con el dueño ya vinculado, devuelve ESTADO_INVALIDO sin llamar a Clerk", async () => {
    const { negocioId, correo } = await negocioConDuenoPendiente();
    await miembros.vincular(correo, `user_${crypto.randomUUID().replaceAll("-", "")}`);

    expect(await reenviarInvitacion({ negocioId }, ADMIN_PRUEBA)).toEqual({ ok: false, error: "ESTADO_INVALIDO" });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("un negocio que no existe devuelve NO_ENCONTRADO sin llamar a Clerk", async () => {
    for (const negocioId of [crypto.randomUUID(), "no-es-un-uuid", 42]) {
      expect(await reenviarInvitacion({ negocioId }, ADMIN_PRUEBA)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("si Clerk falla, informa invitacionEnviada: false y registra invitacion_fallida con el negocioId, sin el correo (Q-08; ARCH §19.2)", async () => {
    const { negocioId, correo } = await negocioConDuenoPendiente();
    createInvitation.mockRejectedValue(new Error("Clerk no disponible"));

    expect(await reenviarInvitacion({ negocioId }, ADMIN_PRUEBA)).toEqual({ ok: true, valor: { invitacionEnviada: false } });

    expect(registros("error").map((l) => JSON.parse(l))).toContainEqual(
      expect.objectContaining({ evento: "invitacion_fallida", negocioId }),
    );
    expect([...registros("error"), ...registros("log")].join(" ")).not.toContain(correo);
    expect(registros("log").join(" ")).not.toContain("invitacion_reenviada");
  });

  test("la página del negocio muestra «Reenviar invitación» solo mientras el dueño no entra al panel (ARCH §7.4)", async () => {
    const { negocioId, correo } = await negocioConDuenoPendiente();
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", "user_admin");
    vi.mocked(auth).mockResolvedValue({ userId: "user_admin" } as Awaited<ReturnType<typeof auth>>);
    const pagina = async () => renderToStaticMarkup(await DetalleNegocio({ params: Promise.resolve({ id: negocioId }) }));

    expect(await pagina()).toContain("Reenviar invitación");

    await miembros.vincular(correo, `user_${crypto.randomUUID().replaceAll("-", "")}`);

    expect(await pagina()).not.toContain("Reenviar invitación");
  });

  test("sin la sesión del admin, la Server Action termina en 404 y no llama a Clerk (ADR-07)", async () => {
    const { negocioId } = await negocioConDuenoPendiente();
    vi.stubEnv("SUPERADMIN_CLERK_USER_IDS", "user_admin");
    vi.mocked(auth).mockResolvedValue({ userId: "user_dueno" } as Awaited<ReturnType<typeof auth>>);

    expect(esNoEncontrado(await errorDe(reenviarInvitacionAdmin(negocioId)))).toBe(true);
    expect(createInvitation).not.toHaveBeenCalled();
  });
});
