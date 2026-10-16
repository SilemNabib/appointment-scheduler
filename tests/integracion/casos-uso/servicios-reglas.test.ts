import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { guardarConsultorio, leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, sesionDeDueno } from "../fixtures";

// Reglas de servicios y recursos (RN-05, RN-06), con los casos de uso del módulo.
// Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

async function crearServicio(negocioId: string) {
  const resultado = await guardarServicio({ negocioId }, { nombre: "Examen visual", duracionMinutos: "30" });
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.id;
}

describe("reglas de servicios y recursos", () => {
  test("un servicio recién creado queda atendido por el consultorio de la sede principal: no hay servicio sin recurso (RN-06)", async () => {
    const { negocioId } = await sesionDeDueno();
    const consultorio = await leerConsultorio({ negocioId });

    const servicioId = await crearServicio(negocioId);

    const atienden = await db()
      .select({ recursoId: esquema.servicioSedeRecurso.recursoId, sedeId: esquema.servicioSedeRecurso.sedeId })
      .from(esquema.servicioSedeRecurso)
      .where(eq(esquema.servicioSedeRecurso.servicioId, servicioId));
    expect(atienden).toEqual([{ recursoId: consultorio.id, sedeId: consultorio.sedeId }]);
  });

  test("guardar el consultorio con capacidad 0 devuelve DATOS_INVALIDOS y la capacidad no cambia (RN-06)", async () => {
    const { negocioId } = await sesionDeDueno();
    const antes = await leerConsultorio({ negocioId });

    expect(await guardarConsultorio({ negocioId }, { nombre: antes.nombre, capacidad: "0" })).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect((await leerConsultorio({ negocioId })).capacidad).toBe(antes.capacidad);
  });

  test("desactivar un servicio conserva sus citas tal como estaban (RN-05: \"sus citas existentes se conservan\")", async () => {
    const { negocioId } = await sesionDeDueno();
    const consultorio = await leerConsultorio({ negocioId });
    const servicioId = await crearServicio(negocioId);
    const [cita] = await db()
      .insert(esquema.cita)
      .values(
        datosDeCita({
          negocioId,
          sedeId: consultorio.sedeId,
          servicioId,
          recursoId: consultorio.id,
          clienteId: await crearCliente(negocioId),
        }),
      )
      .returning();

    expect(await desactivarServicio({ negocioId }, servicioId)).toEqual({ ok: true, valor: undefined });

    const citas = await db().select().from(esquema.cita).where(eq(esquema.cita.servicioId, servicioId));
    expect(citas).toEqual([cita]);
  });
});
