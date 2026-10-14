import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as miembros from "@/servidor/db/repositorios/miembros";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { crearMiembro, crearNegocio } from "../fixtures";

// Repositorios que usa la sesión (ADR-05; ARCH §6 y §7.4).

const usuarioClerk = () => `user_${randomUUID().replaceAll("-", "")}`;

async function filaDe(miembroId: string) {
  const [fila] = await db()
    .select()
    .from(esquema.miembroNegocio)
    .where(eq(esquema.miembroNegocio.id, miembroId));
  return fila;
}

describe("repositorios/miembros", () => {
  test("vincular guarda clerk_user_id y vinculado_en en un miembro pendiente (ARCH §7.4)", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);
    const clerkUserId = usuarioClerk();

    expect(await miembros.vincular(correo, clerkUserId)).toEqual({ id, negocioId, rol: "dueno" });

    const fila = await filaDe(id);
    expect(fila.clerkUserId).toBe(clerkUserId);
    expect(fila.vinculadoEn).toBeInstanceOf(Date);
  });

  test("una segunda vinculación con el mismo correo y otro usuario devuelve null y no cambia la fila (ARCH §7.4)", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);
    await miembros.vincular(correo, usuarioClerk());
    const antes = await filaDe(id);

    expect(await miembros.vincular(correo, usuarioClerk())).toBeNull();
    expect(await filaDe(id)).toEqual(antes);
  });

  test("vincular compara el correo en minúsculas y devuelve null si no hay miembro con ese correo", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);

    expect(await miembros.vincular("nadie@prueba.test", usuarioClerk())).toBeNull();
    expect(await miembros.vincular(correo.toUpperCase(), usuarioClerk())).toMatchObject({ id });
  });

  test("porClerkId encuentra al miembro vinculado y devuelve null para un usuario sin miembro", async () => {
    const negocioId = await crearNegocio();
    const { id, correo } = await crearMiembro(negocioId);
    const clerkUserId = usuarioClerk();

    expect(await miembros.porClerkId(clerkUserId)).toBeNull();
    await miembros.vincular(correo, clerkUserId);
    expect(await miembros.porClerkId(clerkUserId)).toEqual({ id, negocioId, rol: "dueno" });
  });
});

describe("repositorios/negocios", () => {
  test("suscripcion y resumen leen solo el negocio pedido", async () => {
    const negocioId = await crearNegocio();
    const [fila] = await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, negocioId));

    expect(await negocios.suscripcion(negocioId)).toEqual({
      estadoSuscripcion: "prueba",
      finPrueba: fila.finPrueba,
      pagadoHasta: null,
    });
    expect(await negocios.resumen(negocioId)).toEqual({ nombre: fila.nombre, slug: fila.slug });
    expect(await negocios.suscripcion(randomUUID())).toBeNull();
    expect(await negocios.resumen(randomUUID())).toBeNull();
  });
});
