import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as agenda from "@/servidor/db/repositorios/agenda";
import { crearSede, negocioConAgenda } from "../fixtures";

// Lecturas de la agenda de un servicio en una sede (ARCH §10, §10.3 y §11.2), con la
// conexión HTTP y dentro de una transacción.

const deLaOferta = (n: { negocioId: string; servicioId: string; sedeId: string }) =>
  and(
    eq(esquema.servicioSede.negocioId, n.negocioId),
    eq(esquema.servicioSede.servicioId, n.servicioId),
    eq(esquema.servicioSede.sedeId, n.sedeId),
  );

describe("repositorios/agenda.oferta (RN-05, RN-32; ARCH §10.3)", () => {
  test("devuelve el servicio, la sede, su único recurso activo con su capacidad y las franjas de la sede", async () => {
    const n = await negocioConAgenda({
      servicio: { duracionMinutos: 40, bufferMinutos: 10 },
      capacidad: 2,
      franjas: [
        { dia: 3, inicio: "14:00", fin: "18:00" },
        { dia: 1, inicio: "08:00", fin: "12:00" },
        { dia: 3, inicio: "08:00", fin: "12:00" },
      ],
    });

    expect(await agenda.oferta(n.negocioId, n.sedeId, n.servicioId)).toEqual({
      servicio: { id: n.servicioId, nombre: "Examen visual", duracionMinutos: 40, bufferMinutos: 10 },
      sedeId: n.sedeId,
      recurso: { id: n.recursoId, capacidad: 2 },
      franjas: [
        { dia: 1, inicio: "08:00", fin: "12:00" },
        { dia: 3, inicio: "08:00", fin: "12:00" },
        { dia: 3, inicio: "14:00", fin: "18:00" },
      ],
    });
  });

  test("si servicio_sede sobrescribe la duración o el buffer, la oferta usa los de la sede; si no, los del servicio (RN-32)", async () => {
    const n = await negocioConAgenda({ servicio: { duracionMinutos: 30, bufferMinutos: 5 } });
    expect((await agenda.oferta(n.negocioId, n.sedeId, n.servicioId))?.servicio).toMatchObject({
      duracionMinutos: 30,
      bufferMinutos: 5,
    });

    await db().update(esquema.servicioSede).set({ duracionMinutos: 45 }).where(deLaOferta(n));
    expect((await agenda.oferta(n.negocioId, n.sedeId, n.servicioId))?.servicio).toMatchObject({
      duracionMinutos: 45,
      bufferMinutos: 5,
    });

    await db().update(esquema.servicioSede).set({ bufferMinutos: 0 }).where(deLaOferta(n));
    expect((await agenda.oferta(n.negocioId, n.sedeId, n.servicioId))?.servicio).toMatchObject({
      duracionMinutos: 45,
      bufferMinutos: 0,
    });
  });

  test("las franjas propias de un empleado no entran en las de la sede (D-19)", async () => {
    const n = await negocioConAgenda({ franjas: [{ dia: 2, inicio: "09:00", fin: "10:00" }] });
    await db()
      .insert(esquema.horarioSemanal)
      .values({ negocioId: n.negocioId, sedeId: n.sedeId, recursoId: n.recursoId, diaSemana: 4, horaInicio: "08:00", horaFin: "09:00" });

    expect((await agenda.oferta(n.negocioId, n.sedeId, n.servicioId))?.franjas).toEqual([
      { dia: 2, inicio: "09:00", fin: "10:00" },
    ]);
  });

  test("funciona igual dentro de una transacción", async () => {
    const n = await negocioConAgenda();
    const porHttp = await agenda.oferta(n.negocioId, n.sedeId, n.servicioId);
    const enTx = await enTransaccion((tx) => agenda.oferta(n.negocioId, n.sedeId, n.servicioId, tx));
    expect(enTx).toEqual(porHttp);
    expect(enTx).not.toBeNull();
  });

  test("un servicio, una sede, una oferta o un recurso inactivos no devuelven oferta (RN-05)", async () => {
    const casos: [string, (n: Awaited<ReturnType<typeof negocioConAgenda>>) => Promise<unknown>][] = [
      ["servicio", (n) => db().update(esquema.servicio).set({ activo: false }).where(eq(esquema.servicio.id, n.servicioId))],
      ["sede", (n) => db().update(esquema.sede).set({ activa: false }).where(eq(esquema.sede.id, n.sedeId))],
      ["servicio_sede", (n) => db().update(esquema.servicioSede).set({ activo: false }).where(deLaOferta(n))],
      [
        "servicio_sede_recurso",
        (n) =>
          db()
            .update(esquema.servicioSedeRecurso)
            .set({ activo: false })
            .where(eq(esquema.servicioSedeRecurso.recursoId, n.recursoId)),
      ],
      ["recurso", (n) => db().update(esquema.recurso).set({ activo: false }).where(eq(esquema.recurso.id, n.recursoId))],
    ];
    await Promise.all(
      casos.map(async ([que, desactivar]) => {
        const n = await negocioConAgenda();
        await desactivar(n);
        expect(await agenda.oferta(n.negocioId, n.sedeId, n.servicioId), que).toBeNull();
      }),
    );
  });

  test("con el negocioId de otro negocio, o con una sede que no ofrece el servicio, no hay oferta (ARCH §6)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);

    expect(await agenda.oferta(b.negocioId, a.sedeId, a.servicioId)).toBeNull();
    expect(await agenda.oferta(a.negocioId, b.sedeId, a.servicioId)).toBeNull();
    expect(await agenda.oferta(a.negocioId, a.sedeId, b.servicioId)).toBeNull();
    expect(await agenda.oferta(a.negocioId, await crearSede(a.negocioId), a.servicioId)).toBeNull();
    expect(await agenda.oferta(a.negocioId, a.sedeId, randomUUID())).toBeNull();
  });
});
