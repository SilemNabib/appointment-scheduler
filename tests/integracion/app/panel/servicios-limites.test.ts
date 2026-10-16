import { and, count, eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import {
  activarServicioPanel,
  guardarServicioPanel,
} from "@/app/(panel)/panel/configuracion/servicios/acciones";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { fijarLimite, sesionDeDueno } from "../../fixtures";

// El límite `max_services` se valida en el servidor (RN-25; ARCH §16.3): se llama
// directamente a las Server Actions, sin pasar por la interfaz. Clerk se simula; la
// sesión es la del dueño.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
}

async function crearServicio(negocioId: string, nombre: string) {
  const resultado = await guardarServicio({ negocioId }, { nombre, duracionMinutos: "30" });
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.id;
}

async function servicios(negocioId: string, soloActivos = false) {
  const [{ total }] = await db()
    .select({ total: count() })
    .from(esquema.servicio)
    .where(
      and(eq(esquema.servicio.negocioId, negocioId), soloActivos ? eq(esquema.servicio.activo, true) : undefined),
    );
  return total;
}

describe("límite de servicios del plan, por las Server Actions", () => {
  test("con max_services alcanzado por una excepción en negocio_limite, crear devuelve LIMITE_PLAN y no crea nada (RN-25)", async () => {
    const { negocioId } = await sesionDeDueno();
    await crearServicio(negocioId, "Examen visual");
    await fijarLimite(negocioId, "max_services", 1);

    const resultado = await guardarServicioPanel(
      formulario({ nombre: "Lentes de contacto", duracionMinutos: "30", bufferMinutos: "0" }),
    );

    expect(resultado).toEqual({ ok: false, error: "LIMITE_PLAN" });
    expect(await servicios(negocioId)).toBe(1);
  });

  test("con el límite alcanzado, activar un servicio inactivo devuelve LIMITE_PLAN y el servicio sigue inactivo (RN-25)", async () => {
    const { negocioId } = await sesionDeDueno();
    await crearServicio(negocioId, "Examen visual");
    const inactivo = await crearServicio(negocioId, "Lentes de contacto");
    await desactivarServicio({ negocioId }, inactivo);
    await fijarLimite(negocioId, "max_services", 1);

    expect(await activarServicioPanel(inactivo)).toEqual({ ok: false, error: "LIMITE_PLAN" });

    const [fila] = await db()
      .select({ activo: esquema.servicio.activo })
      .from(esquema.servicio)
      .where(eq(esquema.servicio.id, inactivo));
    expect(fila.activo).toBe(false);
    expect(await servicios(negocioId, true)).toBe(1);
  });
});
