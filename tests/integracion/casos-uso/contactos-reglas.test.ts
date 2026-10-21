import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { guardarContactosNegocio, guardarDatosNegocio } from "@/app/(panel)/panel/configuracion/negocio/acciones";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { sesionDeDueno } from "../fixtures";

// Reglas de los contactos (D-29; Q-40) y de la marca ampliada (D-27) por las Server
// Actions del panel: el negocio sale de la sesión (ARCH §6) y, suspendido, no se cambia
// nada (RN-04, D-14). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const contactosDe = (negocioId: string) =>
  db().select().from(esquema.contactoSede).where(eq(esquema.contactoSede.negocioId, negocioId));
const negocioDe = async (negocioId: string) =>
  (await db().select().from(esquema.negocio).where(eq(esquema.negocio.id, negocioId)))[0];

const marca = () => {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries({
    nombre: "Óptica Visión",
    colorPrimario: "#2b3fd6",
    rubro: "Óptica y optometría",
    eslogan: "Ve el mundo con claridad",
    fraseBanner: "Tu examen visual, sin filas",
    descripcion: "Exámenes y lentes.",
  })) {
    datos.set(campo, valor);
  }
  return datos;
};

describe("contactos y marca ampliada por el panel", () => {
  test("con el negocio suspendido, guardar contactos y la marca ampliada devuelven NEGOCIO_SUSPENDIDO y no cambian nada (RN-04, D-14)", async () => {
    const { negocioId } = await sesionDeDueno({ estadoSuscripcion: "suspendida" });
    const [contactosAntes, negocioAntes] = [await contactosDe(negocioId), await negocioDe(negocioId)];

    expect(await guardarContactosNegocio({ contactos: [{ tipo: "correo", valor: "otro@correo.com" }] })).toEqual({
      ok: false,
      error: "NEGOCIO_SUSPENDIDO",
    });
    expect(await guardarDatosNegocio(marca())).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });

    expect(await contactosDe(negocioId)).toEqual(contactosAntes);
    expect(await negocioDe(negocioId)).toEqual(negocioAntes);
  });

  test("al día, se guardan los contactos de la sede principal normalizados y la marca ampliada (D-27, D-29)", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(
      await guardarContactosNegocio({ contactos: [{ tipo: "whatsapp", valor: "300 123 4567", etiqueta: " Citas " }] }),
    ).toEqual({ ok: true, valor: undefined });
    expect(await guardarDatosNegocio(marca())).toEqual({ ok: true, valor: undefined });

    expect(await contactosDe(negocioId)).toEqual([
      expect.objectContaining({ tipo: "whatsapp", valor: "+573001234567", etiqueta: "Citas", orden: 0 }),
    ]);
    expect(await negocioDe(negocioId)).toMatchObject({ rubro: "Óptica y optometría", fraseBanner: "Tu examen visual, sin filas" });
  });

  test("más de 6 contactos por la Server Action devuelven DATOS_INVALIDOS y no cambian nada (Q-40)", async () => {
    const { negocioId } = await sesionDeDueno();
    const antes = await contactosDe(negocioId);
    const siete = Array.from({ length: 7 }, (_, i) => ({ tipo: "telefono", valor: `601 234 56${String(10 + i)}` }));

    expect(await guardarContactosNegocio({ contactos: siete })).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
      contacto: { motivo: "demasiados" },
    });
    expect(await contactosDe(negocioId)).toEqual(antes);
  });

  test("desde la sesión de A, guardar contactos no cambia los contactos de B (RN-01)", async () => {
    const { negocioId: b } = await sesionDeDueno();
    const deB = await contactosDe(b);
    const { negocioId: a } = await sesionDeDueno(); // la sesión queda en el dueño de A

    await guardarContactosNegocio({ contactos: [] });

    expect(await contactosDe(b)).toEqual(deB);
    expect(await contactosDe(a)).toEqual([]);
  });
});
