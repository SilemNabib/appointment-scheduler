import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { guardarHorarioSemanal, leerHorarioSemanal } from "@/servidor/casos-uso/horario";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearSede, sesionDeDueno } from "../fixtures";

// Casos de uso del horario semanal (PAN-14; RN-07, RN-32, Q-20; ARCH §17.3).
// Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const franja = (dia: number, inicio: string, fin: string) => ({ dia, inicio, fin });

async function todasLasFranjas(negocioId: string) {
  const filas = await db()
    .select()
    .from(esquema.horarioSemanal)
    .where(eq(esquema.horarioSemanal.negocioId, negocioId));
  return filas.sort((a, b) => a.id.localeCompare(b.id));
}

describe("guardarHorarioSemanal y leerHorarioSemanal", () => {
  test("guardar reemplaza todas las franjas de la sede principal, sin tocar otras sedes ni los horarios de los recursos", async () => {
    const { negocioId } = await sesionDeDueno();
    const consultorio = await leerConsultorio({ negocioId });
    const otraSede = await crearSede(negocioId);
    const ajenas = await db()
      .insert(esquema.horarioSemanal)
      .values([
        // Horario de otra sede y horario propio de un recurso de la sede principal (D-19).
        { negocioId, sedeId: otraSede, diaSemana: 1, horaInicio: "07:00", horaFin: "09:00" },
        {
          negocioId,
          sedeId: consultorio.sedeId,
          recursoId: consultorio.id,
          diaSemana: 1,
          horaInicio: "07:00",
          horaFin: "09:00",
        },
      ])
      .returning();

    const primera = { franjas: [franja(1, "08:00", "12:00"), franja(1, "14:00", "18:00"), franja(2, "09:00", "13:00")] };
    expect(await guardarHorarioSemanal({ negocioId }, primera)).toEqual({ ok: true, valor: undefined });
    expect(await leerHorarioSemanal({ negocioId })).toEqual(primera.franjas);

    const segunda = { franjas: [franja(5, "10:00", "16:00")] };
    expect(await guardarHorarioSemanal({ negocioId }, segunda)).toEqual({ ok: true, valor: undefined });
    expect(await leerHorarioSemanal({ negocioId })).toEqual(segunda.franjas);

    // Las ajenas siguen igual; de la sede principal solo queda la semana nueva.
    const filas = await todasLasFranjas(negocioId);
    expect(filas.filter((f) => ajenas.some((a) => a.id === f.id))).toEqual(
      ajenas.sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(filas).toHaveLength(ajenas.length + 1);
  });

  test("con franjas solapadas devuelve FRANJAS_SOLAPADAS con los días, y la semana anterior queda intacta", async () => {
    const { negocioId } = await sesionDeDueno();
    await guardarHorarioSemanal({ negocioId }, { franjas: [franja(1, "08:00", "12:00")] });
    const antes = await todasLasFranjas(negocioId);

    const resultado = await guardarHorarioSemanal(
      { negocioId },
      { franjas: [franja(3, "08:00", "12:00"), franja(3, "11:00", "13:00")] },
    );

    expect(resultado).toEqual({ ok: false, error: "FRANJAS_SOLAPADAS", dias: [3] });
    expect(await todasLasFranjas(negocioId)).toEqual(antes);
  });

  test("una franja inválida devuelve DATOS_INVALIDOS sin cambiar nada", async () => {
    const { negocioId } = await sesionDeDueno();
    await guardarHorarioSemanal({ negocioId }, { franjas: [franja(1, "08:00", "12:00")] });
    const antes = await todasLasFranjas(negocioId);

    for (const entrada of [{ franjas: [franja(1, "12:00", "08:00")] }, { franjas: [franja(9, "08:00", "12:00")] }, {}]) {
      expect(await guardarHorarioSemanal({ negocioId }, entrada)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
    expect(await todasLasFranjas(negocioId)).toEqual(antes);
  });

  test("una semana vacía deja todos los días cerrados", async () => {
    const { negocioId } = await sesionDeDueno();
    await guardarHorarioSemanal({ negocioId }, { franjas: [franja(1, "08:00", "12:00")] });

    expect(await guardarHorarioSemanal({ negocioId }, { franjas: [] })).toEqual({ ok: true, valor: undefined });
    expect(await leerHorarioSemanal({ negocioId })).toEqual([]);
  });
});
