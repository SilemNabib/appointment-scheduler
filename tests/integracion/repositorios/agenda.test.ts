import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { db, enTransaccion } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as agenda from "@/servidor/db/repositorios/agenda";
import { crearCliente, crearRecurso, crearSede, datosDeCita, negocioConAgenda } from "../fixtures";

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

describe("repositorios/agenda.bloqueos (ARCH §11.2; RN-32)", () => {
  const h = (hora: string) => new Date(`2030-03-05T${hora}:00Z`);
  const RANGO = { inicio: h("13:00"), fin: h("17:00") };

  test("aplican los del negocio, los de su sede y los suyos; no los de otra sede ni los de otro recurso", async () => {
    const n = await negocioConAgenda();
    const otraSede = await crearSede(n.negocioId);
    const otroRecurso = await crearRecurso(n.negocioId, n.sedeId, { nombre: "Consultorio 2" });
    const base = { negocioId: n.negocioId, inicio: h("14:00"), fin: h("15:00") };
    await db()
      .insert(esquema.bloqueo)
      .values([
        { ...base, motivo: "negocio", sedeId: null, recursoId: null },
        { ...base, motivo: "sede", sedeId: n.sedeId, recursoId: null },
        { ...base, motivo: "recurso", sedeId: n.sedeId, recursoId: n.recursoId },
        { ...base, motivo: "otra sede", sedeId: otraSede, recursoId: null },
        { ...base, motivo: "otro recurso", sedeId: n.sedeId, recursoId: otroRecurso },
      ]);

    const leidos = await agenda.bloqueos(n.negocioId, { sedeId: n.sedeId, recursoId: n.recursoId }, RANGO);
    expect(leidos).toEqual([
      { inicio: h("14:00"), fin: h("15:00") },
      { inicio: h("14:00"), fin: h("15:00") },
      { inicio: h("14:00"), fin: h("15:00") },
    ]);
    // Desde la otra sede solo se ve el del negocio y el suyo.
    expect(await agenda.bloqueos(n.negocioId, { sedeId: otraSede, recursoId: randomUUID() }, RANGO)).toHaveLength(2);
  });

  test("solo los que se solapan con el rango: uno que termina justo donde empieza no aparece (S-04)", async () => {
    const n = await negocioConAgenda();
    const base = { negocioId: n.negocioId, sedeId: n.sedeId };
    await db()
      .insert(esquema.bloqueo)
      .values([
        { ...base, inicio: h("12:00"), fin: h("13:00") }, // termina donde empieza el rango
        { ...base, inicio: h("17:00"), fin: h("18:00") }, // empieza donde termina el rango
        { ...base, inicio: h("12:00"), fin: h("13:30") }, // se solapa por el inicio
        { ...base, inicio: h("16:30"), fin: h("20:00") }, // se solapa por el final
      ]);

    expect(await agenda.bloqueos(n.negocioId, { sedeId: n.sedeId, recursoId: n.recursoId }, RANGO)).toEqual([
      { inicio: h("12:00"), fin: h("13:30") },
      { inicio: h("16:30"), fin: h("20:00") },
    ]);
  });

  test("los de otro negocio no aparecen, aunque se pidan con su sede (ARCH §6)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    await db().insert(esquema.bloqueo).values({ negocioId: b.negocioId, sedeId: null, inicio: h("14:00"), fin: h("15:00") });

    expect(await agenda.bloqueos(a.negocioId, { sedeId: a.sedeId, recursoId: a.recursoId }, RANGO)).toEqual([]);
    expect(await agenda.bloqueos(a.negocioId, { sedeId: b.sedeId, recursoId: b.recursoId }, RANGO)).toEqual([]);
  });
});

describe("repositorios/agenda.ocupacion (ARCH §11.2; RN-10, RN-14, D-06)", () => {
  const h = (hora: string) => new Date(`2030-03-05T${hora}:00Z`);
  const RANGO = { inicio: h("13:00"), fin: h("17:00") };

  /** Inserta una cita del panel en el consultorio, con el estado y el intervalo indicados. */
  async function cita(
    n: Awaited<ReturnType<typeof negocioConAgenda>>,
    estado: (typeof esquema.estadoCita.enumValues)[number],
    desde: string,
    hasta: string,
    recursoId = n.recursoId,
  ) {
    const fin = new Date(h(desde).getTime() + 20 * 60_000);
    const [fila] = await db()
      .insert(esquema.cita)
      .values({
        ...datosDeCita({
          negocioId: n.negocioId,
          sedeId: n.sedeId,
          servicioId: n.servicioId,
          recursoId,
          clienteId: await crearCliente(n.negocioId),
        }),
        estado,
        inicio: h(desde),
        fin,
        ocupadoHasta: h(hasta),
        ...(estado === "cancelada" ? { canceladaEn: new Date(), canceladaPor: "dueno" as const } : {}),
      })
      .returning({ id: esquema.cita.id });
    return fila.id;
  }

  test("no incluye las canceladas ni la cita excluida, y sí las completada y no_asistio (D-06)", async () => {
    const n = await negocioConAgenda();
    await cita(n, "confirmada", "13:00", "13:40");
    await cita(n, "completada", "14:00", "14:40");
    await cita(n, "no_asistio", "15:00", "15:40");
    await cita(n, "cancelada", "16:00", "16:40");
    const excluida = await cita(n, "confirmada", "16:00", "16:30");

    expect(await agenda.ocupacion(n.negocioId, n.recursoId, RANGO, excluida)).toEqual([
      { inicio: h("13:00"), fin: h("13:40") },
      { inicio: h("14:00"), fin: h("14:40") },
      { inicio: h("15:00"), fin: h("15:40") },
    ]);
    // Sin excluir ninguna, la de las 16:00 también ocupa (RN-14 solo excluye la propia).
    expect(await agenda.ocupacion(n.negocioId, n.recursoId, RANGO)).toHaveLength(4);
  });

  test("ocupa hasta ocupado_hasta, con el buffer: una cita que termina antes del rango pero cuyo buffer entra en él, cuenta (RN-10)", async () => {
    const n = await negocioConAgenda();
    await cita(n, "confirmada", "12:30", "13:10"); // fin a las 12:50, buffer hasta las 13:10
    await cita(n, "confirmada", "12:20", "13:00"); // termina justo donde empieza el rango (S-04)
    await cita(n, "confirmada", "17:00", "17:30"); // empieza justo donde termina el rango

    expect(await agenda.ocupacion(n.negocioId, n.recursoId, RANGO)).toEqual([{ inicio: h("12:30"), fin: h("13:10") }]);
  });

  test("solo las del recurso y del negocio (ARCH §6)", async () => {
    const [a, b] = await Promise.all([negocioConAgenda(), negocioConAgenda()]);
    const otroRecurso = await crearRecurso(a.negocioId, a.sedeId, { nombre: "Consultorio 2" });
    await cita(a, "confirmada", "14:00", "14:30", otroRecurso);
    await cita(b, "confirmada", "14:00", "14:30");

    expect(await agenda.ocupacion(a.negocioId, a.recursoId, RANGO)).toEqual([]);
    expect(await agenda.ocupacion(a.negocioId, b.recursoId, RANGO)).toEqual([]);
  });

  test("funciona igual dentro de una transacción", async () => {
    const n = await negocioConAgenda();
    await cita(n, "confirmada", "14:00", "14:30");
    expect(await enTransaccion((tx) => agenda.ocupacion(n.negocioId, n.recursoId, RANGO, null, tx))).toEqual([
      { inicio: h("14:00"), fin: h("14:30") },
    ]);
  });
});
