import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import {
  activarServicio,
  desactivarServicio,
  guardarServicio,
  type EntradaServicio,
} from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as recursos from "@/servidor/db/repositorios/recursos";
import { fijarLimite, sesionDeDueno } from "../fixtures";

// Casos de uso de servicios (PAN-12; RN-05, RN-06, RN-25, RN-28, RN-32; ARCH §16.3
// y §18.4). Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const examenVisual = (cambios: Partial<EntradaServicio> = {}): EntradaServicio => ({
  nombre: "Examen visual",
  descripcion: "Revisión completa",
  duracionMinutos: "30",
  bufferMinutos: "",
  ...cambios,
});

async function crear(negocioId: string, cambios: Partial<EntradaServicio> = {}) {
  const resultado = await guardarServicio({ negocioId }, examenVisual(cambios));
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.id;
}

async function filasDe(servicioId: string) {
  const [servicio] = await db().select().from(esquema.servicio).where(eq(esquema.servicio.id, servicioId));
  const ofertas = await db().select().from(esquema.servicioSede).where(eq(esquema.servicioSede.servicioId, servicioId));
  const atienden = await db()
    .select()
    .from(esquema.servicioSedeRecurso)
    .where(eq(esquema.servicioSedeRecurso.servicioId, servicioId));
  return { servicio, ofertas, atienden };
}

async function serviciosDe(negocioId: string) {
  return db().select().from(esquema.servicio).where(eq(esquema.servicio.negocioId, negocioId));
}

describe("guardarServicio: crear", () => {
  test("deja el servicio activo, ofrecido en la sede principal y atendido por el consultorio", async () => {
    const { negocioId } = await sesionDeDueno();
    const consultorio = await recursos.consultorioPrincipal(negocioId);

    const id = await crear(negocioId);

    const { servicio, ofertas, atienden } = await filasDe(id);
    expect(servicio).toMatchObject({
      negocioId,
      nombre: "Examen visual",
      descripcion: "Revisión completa",
      duracionMinutos: 30,
      bufferMinutos: 0,
      activo: true,
    });
    expect(ofertas).toEqual([
      expect.objectContaining({ sedeId: consultorio!.sedeId, clienteElige: false, activo: true }),
    ]);
    expect(atienden).toEqual([
      expect.objectContaining({ sedeId: consultorio!.sedeId, recursoId: consultorio!.id, activo: true }),
    ]);
  });

  test.each([
    ["una duración de 4 minutos", { duracionMinutos: "4" }],
    ["una duración de 721 minutos", { duracionMinutos: "721" }],
    ["una duración vacía", { duracionMinutos: "" }],
    ["una duración con decimales", { duracionMinutos: "30.5" }],
    ["un buffer negativo", { bufferMinutos: "-1" }],
    ["un buffer de 241 minutos", { bufferMinutos: "241" }],
    ["un nombre vacío", { nombre: " " }],
  ])("%s devuelve DATOS_INVALIDOS y no crea nada", async (_, cambios) => {
    const { negocioId } = await sesionDeDueno();

    expect(await guardarServicio({ negocioId }, examenVisual(cambios))).toEqual({
      ok: false,
      error: "DATOS_INVALIDOS",
    });
    expect(await serviciosDe(negocioId)).toEqual([]);
  });

  test("acepta los bordes: 5 y 720 minutos de duración, 0 y 240 de buffer", async () => {
    const { negocioId } = await sesionDeDueno();

    await crear(negocioId, { duracionMinutos: "5", bufferMinutos: "0" });
    await crear(negocioId, { duracionMinutos: "720", bufferMinutos: "240" });
    expect(await serviciosDe(negocioId)).toHaveLength(2);
  });

  test("con el cupo de max_services agotado devuelve LIMITE_PLAN y no crea nada (RN-25)", async () => {
    const { negocioId } = await sesionDeDueno();
    await crear(negocioId);
    await fijarLimite(negocioId, "max_services", 1);

    expect(await guardarServicio({ negocioId }, examenVisual({ nombre: "Lentes de contacto" }))).toEqual({
      ok: false,
      error: "LIMITE_PLAN",
    });
    expect(await serviciosDe(negocioId)).toHaveLength(1);
  });
});

describe("guardarServicio: editar", () => {
  test("cambia el nombre, la descripción, la duración y el buffer", async () => {
    const { negocioId } = await sesionDeDueno();
    const id = await crear(negocioId);

    const resultado = await guardarServicio(
      { negocioId },
      { id, nombre: "Examen visual completo", descripcion: "", duracionMinutos: "45", bufferMinutos: "10" },
    );

    expect(resultado).toEqual({ ok: true, valor: { id } });
    expect((await filasDe(id)).servicio).toMatchObject({
      nombre: "Examen visual completo",
      descripcion: null,
      duracionMinutos: 45,
      bufferMinutos: 10,
      activo: true,
    });
  });

  test("editar no exige cupo, aunque el negocio tenga más servicios activos que el límite (RN-28)", async () => {
    const { negocioId } = await sesionDeDueno();
    const id = await crear(negocioId);
    await crear(negocioId, { nombre: "Lentes de contacto" });
    await fijarLimite(negocioId, "max_services", 1);

    expect(await guardarServicio({ negocioId }, examenVisual({ id, duracionMinutos: "60" }))).toEqual({
      ok: true,
      valor: { id },
    });
  });

  test("un servicio inexistente o de otro negocio devuelve NO_ENCONTRADO, y el otro negocio no cambia (ARCH §6)", async () => {
    const a = await sesionDeDueno();
    const b = await sesionDeDueno();
    const deB = await crear(b.negocioId);
    const antes = await filasDe(deB);

    for (const id of [deB, randomUUID()]) {
      expect(await guardarServicio({ negocioId: a.negocioId }, examenVisual({ id, nombre: "Cambiado" }))).toEqual({
        ok: false,
        error: "NO_ENCONTRADO",
      });
    }
    expect(await filasDe(deB)).toEqual(antes);
  });
});

describe("activarServicio y desactivarServicio", () => {
  /** Las filas del servicio sin `actualizado_en`, que cambia con cualquier UPDATE. */
  async function sinFecha(id: string) {
    const { servicio, ...resto } = await filasDe(id);
    return { servicio: { ...servicio, actualizadoEn: null }, ...resto };
  }

  test("desactivar y volver a activar cambia servicio.activo y nada más (RN-05)", async () => {
    const { negocioId } = await sesionDeDueno();
    const id = await crear(negocioId);
    const antes = await sinFecha(id);

    expect(await desactivarServicio({ negocioId }, id)).toEqual({ ok: true, valor: undefined });
    expect(await sinFecha(id)).toEqual({ ...antes, servicio: { ...antes.servicio, activo: false } });

    expect(await activarServicio({ negocioId }, id)).toEqual({ ok: true, valor: undefined });
    expect(await sinFecha(id)).toEqual(antes);
  });

  test("un servicio de otro negocio, inexistente o con un id inválido devuelve NO_ENCONTRADO, y no cambia (ARCH §6)", async () => {
    const a = await sesionDeDueno();
    const b = await sesionDeDueno();
    const deB = await crear(b.negocioId);
    await desactivarServicio({ negocioId: b.negocioId }, deB);
    const antes = await filasDe(deB);

    for (const id of [deB, randomUUID(), "no-es-un-id", null]) {
      expect(await activarServicio({ negocioId: a.negocioId }, id)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
      expect(await desactivarServicio({ negocioId: a.negocioId }, id)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
    expect(await filasDe(deB)).toEqual(antes);
  });

  test("con más servicios activos que max_services, se pueden editar y desactivar; reactivar exige cupo (RN-28)", async () => {
    const { negocioId } = await sesionDeDueno();
    const [uno, dos, tres] = [
      await crear(negocioId, { nombre: "Uno" }),
      await crear(negocioId, { nombre: "Dos" }),
      await crear(negocioId, { nombre: "Tres" }),
    ];
    await fijarLimite(negocioId, "max_services", 1); // 3 activos, límite 1

    expect(await guardarServicio({ negocioId }, examenVisual({ id: uno, nombre: "Uno editado" }))).toMatchObject({
      ok: true,
    });
    expect(await desactivarServicio({ negocioId }, dos)).toMatchObject({ ok: true });
    expect(await desactivarServicio({ negocioId }, tres)).toMatchObject({ ok: true });

    // Queda 1 activo: reactivar otro superaría el límite.
    expect(await activarServicio({ negocioId }, dos)).toEqual({ ok: false, error: "LIMITE_PLAN" });
    expect((await filasDe(dos)).servicio.activo).toBe(false);

    // Activar el que ya está activo no exige cupo ni cambia nada.
    expect(await activarServicio({ negocioId }, uno)).toEqual({ ok: true, valor: undefined });

    await desactivarServicio({ negocioId }, uno);
    expect(await activarServicio({ negocioId }, dos)).toEqual({ ok: true, valor: undefined });
  });
});
