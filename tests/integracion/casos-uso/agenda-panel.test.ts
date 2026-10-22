import { describe, expect, test } from "vitest";
import { intervaloDeDias, localAUtc } from "@/dominio/tiempo";
import { listarAgenda } from "@/servidor/casos-uso/agenda-panel";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, HORARIO_LABORAL, negocioConAgenda } from "../fixtures";

// La agenda del panel (PAN-02; RN-01, RN-03, D-14; ARCH §9; Q-52, Q-58).

const BOGOTA = "America/Bogota";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

/** Una cita del negocio que empieza en ese instante, de 30 minutos. */
async function cita(n: Negocio, inicio: Date, cambios: Partial<typeof esquema.cita.$inferInsert> = {}) {
  const clienteId = await crearCliente(n.negocioId);
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  const [{ id }] = await db()
    .insert(esquema.cita)
    .values({ ...datosDeCita({ ...n, clienteId }), inicio, fin, ocupadoHasta: fin, ...cambios })
    .returning({ id: esquema.cita.id });
  return id;
}

describe("listarAgenda (PAN-02)", () => {
  test("una cita a las 7:00 p. m. del 14 de octubre aparece al pedir el 14 y no al pedir el 15 (RN-03; ARCH §9, regla 2)", async () => {
    const n = await negocioConAgenda();
    const id = await cita(n, new Date("2026-10-15T00:00:00Z"));

    const del14 = await listarAgenda({ negocioId: n.negocioId }, "2026-10-14", "2026-10-14");
    const del15 = await listarAgenda({ negocioId: n.negocioId }, "2026-10-15", "2026-10-15");

    expect(del14.ok && del14.valor.citas.map((c) => c.id)).toEqual([id]);
    expect(del15.ok && del15.valor.citas).toEqual([]);
  });

  test("trae cada cita con su código, horas, servicio, cliente de la instantánea y estado, y las franjas con la granularidad", async () => {
    const n = await negocioConAgenda({ reglas: { granularidadMinutos: 15 } });
    const inicio = localAUtc("2030-03-04", "09:00", BOGOTA);
    const id = await cita(n, inicio, { codigo: "OV-4821", clienteNombre: "Ana", clienteApellido: "Pérez", ocupadoHasta: new Date(inicio.getTime() + 40 * 60 * 1000) });

    const resultado = await listarAgenda({ negocioId: n.negocioId }, "2030-03-04", "2030-03-10");

    expect(resultado).toEqual({
      ok: true,
      valor: {
        zonaHoraria: BOGOTA,
        desde: "2030-03-04",
        hasta: "2030-03-10",
        citas: [
          {
            id,
            codigo: "OV-4821",
            inicio,
            fin: new Date(inicio.getTime() + 30 * 60 * 1000),
            ocupadoHasta: new Date(inicio.getTime() + 40 * 60 * 1000),
            servicio: "Examen visual",
            cliente: "Ana Pérez",
            estado: "confirmada",
          },
        ],
        bloqueos: [],
        franjas: HORARIO_LABORAL,
        granularidadMin: 15,
      },
    });
  });

  test("trae las citas canceladas con su estado (Q-58) y nunca citas de otro negocio (RN-01)", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const inicio = localAUtc("2030-03-04", "09:00", BOGOTA);
    const cancelada = await cita(a, inicio, { estado: "cancelada", canceladaEn: inicio, canceladaPor: "dueno" });
    const activa = await cita(a, localAUtc("2030-03-04", "10:00", BOGOTA));
    await cita(b, inicio);

    const resultado = await listarAgenda({ negocioId: a.negocioId }, "2030-03-04", "2030-03-04");

    expect(resultado.ok && resultado.valor.citas.map((c) => [c.id, c.estado])).toEqual([
      [cancelada, "cancelada"],
      [activa, "confirmada"],
    ]);
  });

  test("trae los bloqueos que se solapan con el rango, y no los de otro negocio", async () => {
    const a = await negocioConAgenda();
    const b = await negocioConAgenda();
    const dia = intervaloDeDias("2030-03-04", "2030-03-04", BOGOTA);
    // Uno de todo el negocio que empezó antes, uno de la sede, uno que no toca el rango y uno de otro negocio.
    await db().insert(esquema.bloqueo).values([
      { negocioId: a.negocioId, inicio: localAUtc("2030-03-03", "20:00", BOGOTA), fin: localAUtc("2030-03-04", "09:00", BOGOTA), motivo: "Viaje" },
      { negocioId: a.negocioId, sedeId: a.sedeId, inicio: localAUtc("2030-03-04", "14:00", BOGOTA), fin: localAUtc("2030-03-04", "16:00", BOGOTA) },
      { negocioId: a.negocioId, sedeId: a.sedeId, ...intervaloDeDias("2030-03-05", "2030-03-05", BOGOTA) },
      { negocioId: b.negocioId, sedeId: b.sedeId, ...dia },
    ]);

    const resultado = await listarAgenda({ negocioId: a.negocioId }, "2030-03-04", "2030-03-04");

    expect(resultado.ok && resultado.valor.bloqueos.map((x) => [x.inicio, x.fin, x.motivo])).toEqual([
      [localAUtc("2030-03-03", "20:00", BOGOTA), localAUtc("2030-03-04", "09:00", BOGOTA), "Viaje"],
      [localAUtc("2030-03-04", "14:00", BOGOTA), localAUtc("2030-03-04", "16:00", BOGOTA), null],
    ]);
  });

  test("un rango de más de 42 días, que termina antes de empezar o con fechas inválidas devuelve DATOS_INVALIDOS", async () => {
    const n = await negocioConAgenda();
    const ctx = { negocioId: n.negocioId };

    expect((await listarAgenda(ctx, "2030-03-01", "2030-04-11")).ok).toBe(true); // 42 días
    for (const [desde, hasta] of [
      ["2030-03-01", "2030-04-12"], // 43 días
      ["2030-03-05", "2030-03-04"],
      ["2030-02-30", "2030-03-04"],
      ["", "2030-03-04"],
      [undefined, undefined],
    ]) {
      expect(await listarAgenda(ctx, desde, hasta), `${desde} → ${hasta}`).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
  });

  test("funciona con el negocio suspendido (D-14)", async () => {
    const n = await negocioConAgenda({ suscripcion: { estadoSuscripcion: "suspendida" } });
    const id = await cita(n, localAUtc("2030-03-04", "09:00", BOGOTA));

    const resultado = await listarAgenda({ negocioId: n.negocioId }, "2030-03-04", "2030-03-04");

    expect(resultado.ok && resultado.valor.citas.map((c) => c.id)).toEqual([id]);
  });
});
