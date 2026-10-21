import { asc, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { guardarContactos, listarContactos, type EntradaContactos } from "@/servidor/casos-uso/contactos";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearSede, sesionDeDueno } from "../fixtures";

// Contactos del negocio (PAN-11; D-29, Q-40; ARCH §6). El alta de prueba crea la sede
// principal con el teléfono "+57 300 123 4567" como su primer contacto. Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const LISTA: EntradaContactos["contactos"] = [
  { tipo: "whatsapp", valor: "300 123 4567", etiqueta: "Citas" },
  { tipo: "telefono", valor: "(601) 234-5678", etiqueta: "" },
  { tipo: "correo", valor: " Hola@Optica.com " },
];

/** Todas las filas de contacto_sede del negocio, con su sede y su orden. */
const filasDe = (negocioId: string) =>
  db()
    .select()
    .from(esquema.contactoSede)
    .where(eq(esquema.contactoSede.negocioId, negocioId))
    .orderBy(asc(esquema.contactoSede.sedeId), asc(esquema.contactoSede.orden));

describe("listarContactos y guardarContactos", () => {
  test("después del alta, la sede principal tiene el teléfono del alta como contacto telefono", async () => {
    const { negocioId } = await sesionDeDueno();
    expect(await listarContactos({ negocioId })).toEqual([{ tipo: "telefono", valor: "+573001234567", etiqueta: null }]);
  });

  test("guardar reemplaza los contactos de la sede principal en el orden recibido, normalizados", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarContactos({ negocioId }, { contactos: LISTA })).toEqual({ ok: true, valor: undefined });

    expect(await listarContactos({ negocioId })).toEqual([
      { tipo: "whatsapp", valor: "+573001234567", etiqueta: "Citas" },
      { tipo: "telefono", valor: "+576012345678", etiqueta: null },
      { tipo: "correo", valor: "hola@optica.com", etiqueta: null },
    ]);
    expect((await filasDe(negocioId)).map((c) => c.orden)).toEqual([0, 1, 2]);

    // Cambiar el orden y quitar uno.
    await guardarContactos({ negocioId }, { contactos: [LISTA[2], LISTA[0]] });
    expect((await listarContactos({ negocioId })).map((c) => c.tipo)).toEqual(["correo", "whatsapp"]);

    // Una lista vacía deja la sede sin contactos.
    await guardarContactos({ negocioId }, { contactos: [] });
    expect(await listarContactos({ negocioId })).toEqual([]);
  });

  test("no toca los contactos de otras sedes ni de otros negocios (ARCH §6)", async () => {
    const { negocioId } = await sesionDeDueno();
    const otraSede = await crearSede(negocioId);
    await db()
      .insert(esquema.contactoSede)
      .values({ negocioId, sedeId: otraSede, tipo: "telefono", valor: "+576019998877" });
    const { negocioId: otroNegocio } = await sesionDeDueno();
    const antesOtraSede = (await filasDe(negocioId)).filter((c) => c.sedeId === otraSede);
    const antesOtroNegocio = await filasDe(otroNegocio);

    await guardarContactos({ negocioId }, { contactos: LISTA });

    expect((await filasDe(negocioId)).filter((c) => c.sedeId === otraSede)).toEqual(antesOtraSede);
    expect(await filasDe(otroNegocio)).toEqual(antesOtroNegocio);
  });

  test.each([
    ["un teléfono no válido", [LISTA[0], { tipo: "telefono", valor: "123" }], { motivo: "valor", indice: 1 }],
    ["un correo mal formado", [{ tipo: "correo", valor: "hola@" }], { motivo: "valor", indice: 0 }],
    ["un tipo desconocido", [{ tipo: "fax", valor: "3001234567" }], { motivo: "tipo", indice: 0 }],
    ["siete contactos", Array.from({ length: 7 }, () => LISTA[0]), { motivo: "demasiados" }],
  ])("con %s devuelve DATOS_INVALIDOS con el contacto que falló, y la lista anterior queda intacta", async (_, contactos, contacto) => {
    const { negocioId } = await sesionDeDueno();
    const antes = await filasDe(negocioId);

    expect(await guardarContactos({ negocioId }, { contactos })).toEqual({ ok: false, error: "DATOS_INVALIDOS", contacto });
    expect(await filasDe(negocioId)).toEqual(antes);
  });

  test("una entrada sin la forma esperada devuelve DATOS_INVALIDOS sin contacto", async () => {
    const { negocioId } = await sesionDeDueno();
    for (const entrada of [null, {}, { contactos: "x" }, { contactos: [{ tipo: "telefono" }] }]) {
      expect(await guardarContactos({ negocioId }, entrada)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
  });
});
