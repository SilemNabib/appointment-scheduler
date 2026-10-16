import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { eliminarBloqueoPanel } from "@/app/(panel)/panel/bloqueos/acciones";
import {
  activarServicioPanel,
  desactivarServicioPanel,
  guardarServicioPanel,
} from "@/app/(panel)/panel/configuracion/servicios/acciones";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearBloqueo } from "@/servidor/casos-uso/bloqueos";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { sesionDeDueno } from "../../fixtures";

// Un dueño no alcanza datos de otro negocio por las Server Actions de la fase que
// reciben identificadores del cliente (RN-01; ARCH §6 y §20, Multi-negocio). Clerk se
// simula: la sesión es la del dueño de A, y los datos son de B.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** Negocio B con un servicio activo, uno inactivo y un bloqueo; después, la sesión de A. */
async function negocioBYSesionDeA() {
  const { negocioId: negocioB } = await sesionDeDueno();
  const crear = async (nombre: string) => {
    const r = await guardarServicio({ negocioId: negocioB }, { nombre, duracionMinutos: "30" });
    if (!r.ok) throw new Error(r.error);
    return r.valor.id;
  };
  const activo = await crear("Examen visual");
  const inactivo = await crear("Lentes de contacto");
  await desactivarServicio({ negocioId: negocioB }, inactivo);
  const bloqueo = await crearBloqueo({ negocioId: negocioB }, { tipo: "dia", fecha: "2030-03-05" });
  if (!bloqueo.ok) throw new Error(bloqueo.error);

  const { negocioId: negocioA } = await sesionDeDueno(); // la sesión queda en el dueño de A
  return { negocioA, negocioB, activo, inactivo, bloqueoId: bloqueo.valor.id };
}

const serviciosDe = (negocioId: string) =>
  db().select().from(esquema.servicio).where(eq(esquema.servicio.negocioId, negocioId));

describe("multi-negocio en las Server Actions del panel", () => {
  test("desde la sesión del dueño de A, editar, activar o desactivar un servicio de B devuelve NO_ENCONTRADO, y B no cambia (RN-01)", async () => {
    const { negocioA, negocioB, activo, inactivo } = await negocioBYSesionDeA();
    const antes = await serviciosDe(negocioB);

    const edicion = new FormData();
    for (const [campo, valor] of Object.entries({ id: activo, nombre: "Cambiado", duracionMinutos: "60", bufferMinutos: "0" })) {
      edicion.set(campo, valor);
    }
    expect(await guardarServicioPanel(edicion)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await activarServicioPanel(inactivo)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    expect(await desactivarServicioPanel(activo)).toEqual({ ok: false, error: "NO_ENCONTRADO" });

    expect(await serviciosDe(negocioB)).toEqual(antes);
    expect(await serviciosDe(negocioA)).toEqual([]);
  });

  test("desde la sesión de A, eliminar un bloqueo de B devuelve NO_ENCONTRADO, y el bloqueo sigue (RN-01)", async () => {
    const { bloqueoId } = await negocioBYSesionDeA();

    expect(await eliminarBloqueoPanel(bloqueoId)).toEqual({ ok: false, error: "NO_ENCONTRADO" });

    const quedan = await db().select().from(esquema.bloqueo).where(eq(esquema.bloqueo.id, bloqueoId));
    expect(quedan).toHaveLength(1);
  });
});
