import { describe, expect, test } from "vitest";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import {
  crearCliente,
  crearNegocio,
  crearRecurso,
  crearSede,
  crearServicio,
  datosDeCita,
  errorDePostgres,
  ofrecerServicio,
} from "../fixtures";

// Restricciones del modelo de sedes (ARCH §20, Sedes). El límite `max_locations`
// se prueba cuando exista `guardarSede` (Q-16).

const VIOLA_FK = "23503";
const VIOLA_CHECK = "23514";

describe("esquema: sedes y recursos", () => {
  test("rechaza ofrecer un servicio en una sede con un recurso de otra sede (RN-32; ARCH §20, Sedes)", async () => {
    const negocioId = await crearNegocio();
    const [sedeA, sedeB] = [await crearSede(negocioId), await crearSede(negocioId)];
    const servicioId = await crearServicio(negocioId);
    await ofrecerServicio(negocioId, servicioId, sedeA);
    const recursoDeB = await crearRecurso(negocioId, sedeB);

    const error = await errorDePostgres(
      db()
        .insert(esquema.servicioSedeRecurso)
        .values({ negocioId, servicioId, sedeId: sedeA, recursoId: recursoDeB }),
    );

    expect(error).toEqual({
      code: VIOLA_FK,
      constraint: "servicio_sede_recurso_recurso_id_sede_id_fkey",
    });
  });

  test("rechaza una cita con un servicio que su sede no ofrece (ARCH §20, Sedes)", async () => {
    const negocioId = await crearNegocio();
    const [sedeA, sedeB] = [await crearSede(negocioId), await crearSede(negocioId)];
    const servicioId = await crearServicio(negocioId);
    await ofrecerServicio(negocioId, servicioId, sedeA); // solo en la sede A
    const recursoDeB = await crearRecurso(negocioId, sedeB);
    const clienteId = await crearCliente(negocioId);

    const error = await errorDePostgres(
      db()
        .insert(esquema.cita)
        .values(datosDeCita({ negocioId, sedeId: sedeB, servicioId, recursoId: recursoDeB, clienteId })),
    );

    expect(error).toEqual({ code: VIOLA_FK, constraint: "cita_servicio_id_sede_id_fkey" });
  });

  test("rechaza un recurso con capacidad 0 (RN-06)", async () => {
    const negocioId = await crearNegocio();
    const sedeId = await crearSede(negocioId);

    const error = await errorDePostgres(crearRecurso(negocioId, sedeId, { capacidad: 0 }));

    expect(error).toEqual({ code: VIOLA_CHECK, constraint: "recurso_capacidad_check" });
  });
});
