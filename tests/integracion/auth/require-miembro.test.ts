import { randomUUID } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { requireMiembro } from "@/servidor/auth/sesion";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as miembros from "@/servidor/db/repositorios/miembros";
import { destinoDeRedireccion, errorDe } from "../../ayudantes-next";
import { crearMiembro, crearNegocio } from "../fixtures";

// requireMiembro y la vinculación en el primer ingreso (RN-01, ADR-05; ARCH §7.4 y
// §7.5). Clerk se simula; el negocio y el miembro son reales.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const usuarioClerk = () => `user_${randomUUID().replaceAll("-", "")}`;

function conSesion(userId: string | null) {
  vi.mocked(auth).mockResolvedValue({ userId } as Awaited<ReturnType<typeof auth>>);
}

type Correo = { correo: string; verificado: boolean; principal?: boolean };

/** Usuario de Clerk con sus correos; el primero marcado `principal` es el principal. */
function conUsuario(correos: Correo[]) {
  const emailAddresses = correos.map((c, i) => ({
    id: `idn_${i}`,
    emailAddress: c.correo,
    verification: { status: c.verificado ? "verified" : "unverified" },
  }));
  const principal = correos.findIndex((c) => c.principal);
  vi.mocked(currentUser).mockResolvedValue({
    primaryEmailAddressId: principal >= 0 ? `idn_${principal}` : null,
    emailAddresses,
  } as unknown as Awaited<ReturnType<typeof currentUser>>);
}

async function clerkUserIdDe(miembroId: string) {
  const [fila] = await db()
    .select({ clerkUserId: esquema.miembroNegocio.clerkUserId })
    .from(esquema.miembroNegocio)
    .where(eq(esquema.miembroNegocio.id, miembroId));
  return fila.clerkUserId;
}

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(currentUser).mockReset();
});

describe("requireMiembro", () => {
  test("un usuario ya vinculado obtiene su negocioId y su suscripción, calculada con estadoEfectivo()", async () => {
    const negocioId = await crearNegocio(); // en prueba, vence en 30 días
    const { id, correo } = await crearMiembro(negocioId);
    const clerkUserId = usuarioClerk();
    await miembros.vincular(correo, clerkUserId);
    conSesion(clerkUserId);

    expect(await requireMiembro()).toEqual({
      negocioId,
      miembroId: id,
      rol: "dueno",
      clerkUserId,
      suscripcion: { estado: "al_dia" },
    });
    expect(currentUser).not.toHaveBeenCalled();
  });

  test("un miembro pendiente con el correo principal verificado queda vinculado en ese momento (ARCH §7.4)", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);
    const clerkUserId = usuarioClerk();
    conSesion(clerkUserId);
    // Clerk puede devolver el correo con mayúsculas; el miembro lo guarda en minúsculas.
    conUsuario([{ correo: correo.toUpperCase(), verificado: true, principal: true }]);

    expect(await requireMiembro()).toMatchObject({ negocioId, miembroId: id, clerkUserId });
    expect(await clerkUserIdDe(id)).toBe(clerkUserId);
  });

  test("con el correo principal sin verificar redirige a /sin-acceso y el miembro sigue sin usuario (ARCH §7.4)", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);
    conSesion(usuarioClerk());
    conUsuario([{ correo, verificado: false, principal: true }]);

    expect(destinoDeRedireccion(await errorDe(requireMiembro()))).toBe("/sin-acceso");
    expect(await clerkUserIdDe(id)).toBeNull();
  });

  test("un correo verificado que no es el principal tampoco vincula", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);
    conSesion(usuarioClerk());
    conUsuario([
      { correo: "otro@prueba.test", verificado: true, principal: true },
      { correo, verificado: true },
    ]);

    expect(destinoDeRedireccion(await errorDe(requireMiembro()))).toBe("/sin-acceso");
    expect(await clerkUserIdDe(id)).toBeNull();
  });

  test("un usuario válido sin miembro redirige a /sin-acceso", async () => {
    conSesion(usuarioClerk());
    conUsuario([{ correo: "sin-negocio@prueba.test", verificado: true, principal: true }]);

    expect(destinoDeRedireccion(await errorDe(requireMiembro()))).toBe("/sin-acceso");
  });

  test("sin sesión redirige a /login", async () => {
    conSesion(null);

    expect(destinoDeRedireccion(await errorDe(requireMiembro()))).toBe("/login");
    expect(currentUser).not.toHaveBeenCalled();
  });
});
