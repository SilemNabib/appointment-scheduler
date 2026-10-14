import { describe, expect, test } from "vitest";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import {
  crearNegocio,
  crearRecurso,
  crearSede,
  crearServicio,
  errorDePostgres,
  ofrecerServicio,
} from "../fixtures";

// El modelo de empleados ya protege sus invariantes, aunque no tenga interfaz en el MVP
// (D-17; ARCH §20, Modelo de empleados).

const VIOLA_FK = "23503";
const VIOLA_CHECK = "23514";

describe("esquema: modelo de empleados", () => {
  test("rechaza un recurso profesional con capacidad distinta de 1 (RN-33; ARCH §20)", async () => {
    const negocioId = await crearNegocio();
    const sedeId = await crearSede(negocioId);

    const error = await errorDePostgres(
      crearRecurso(negocioId, sedeId, { nombre: "Ana", tipo: "profesional", capacidad: 2 }),
    );

    expect(error).toEqual({ code: VIOLA_CHECK, constraint: "recurso_check" });
  });

  test("rechaza en servicio_sede_recurso a un empleado de otra sede (ARCH §20)", async () => {
    const negocioId = await crearNegocio();
    const [sedeA, sedeB] = [await crearSede(negocioId), await crearSede(negocioId)];
    const servicioId = await crearServicio(negocioId);
    await ofrecerServicio(negocioId, servicioId, sedeA);
    const empleadoDeB = await crearRecurso(negocioId, sedeB, { nombre: "Ana", tipo: "profesional" });

    const error = await errorDePostgres(
      db()
        .insert(esquema.servicioSedeRecurso)
        .values({ negocioId, servicioId, sedeId: sedeA, recursoId: empleadoDeB }),
    );

    expect(error).toEqual({
      code: VIOLA_FK,
      constraint: "servicio_sede_recurso_recurso_id_sede_id_fkey",
    });
  });

  test("rechaza un horario propio de un recurso de otra sede (D-19; ARCH §20)", async () => {
    const negocioId = await crearNegocio();
    const [sedeA, sedeB] = [await crearSede(negocioId), await crearSede(negocioId)];
    const empleadoDeB = await crearRecurso(negocioId, sedeB, { nombre: "Ana", tipo: "profesional" });

    const error = await errorDePostgres(
      db().insert(esquema.horarioSemanal).values({
        negocioId,
        sedeId: sedeA,
        recursoId: empleadoDeB,
        diaSemana: 1,
        horaInicio: "08:00",
        horaFin: "12:00",
      }),
    );

    expect(error).toEqual({ code: VIOLA_FK, constraint: "horario_semanal_recurso_id_sede_id_fkey" });
  });
});
