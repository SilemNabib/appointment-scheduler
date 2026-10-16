import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import {
  crearBloqueo,
  eliminarBloqueo,
  listarBloqueos,
  type EntradaBloqueo,
} from "@/servidor/casos-uso/bloqueos";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, sesionDeDueno } from "../fixtures";

// Casos de uso de bloqueos (PAN-08, F-09; RN-07, D-15; ARCH §11.3 y §17.3). El reloj
// se inyecta: "ahora" es el lunes 4-mar-2030 a las 10:00 a. m. de Bogotá. Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const AHORA = new Date("2030-03-04T15:00:00Z");
const HORA = 60 * 60 * 1000;

/** Negocio con un servicio de 30 minutos en la sede principal. */
async function negocioConServicio() {
  const { negocioId } = await sesionDeDueno();
  const consultorio = await leerConsultorio({ negocioId });
  const servicio = await guardarServicio({ negocioId }, { nombre: "Examen visual", duracionMinutos: "30" });
  if (!servicio.ok) throw new Error(servicio.error);
  return { negocioId, sedeId: consultorio.sedeId, recursoId: consultorio.id, servicioId: servicio.valor.id };
}

/** Cita de 30 minutos (sin buffer) que empieza en `inicio`. */
async function crearCita(
  n: Awaited<ReturnType<typeof negocioConServicio>>,
  inicio: Date,
  estado: "confirmada" | "cancelada" = "confirmada",
) {
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  const [cita] = await db()
    .insert(esquema.cita)
    .values({
      ...datosDeCita({ ...n, clienteId: await crearCliente(n.negocioId) }),
      inicio,
      fin,
      ocupadoHasta: fin,
      estado,
      ...(estado === "cancelada" ? { canceladaEn: AHORA, canceladaPor: "dueno" as const } : {}),
    })
    .returning();
  return cita;
}

async function bloqueosDe(negocioId: string) {
  return db().select().from(esquema.bloqueo).where(eq(esquema.bloqueo.negocioId, negocioId));
}

const unDia = (fecha = "2030-03-05"): EntradaBloqueo => ({ tipo: "dia", fecha });

describe("crearBloqueo", () => {
  test("sin citas en el rango, guarda el bloqueo con la sede principal y recurso_id en NULL (ARCH §17.3)", async () => {
    const n = await negocioConServicio();

    const resultado = await crearBloqueo({ negocioId: n.negocioId }, { ...unDia(), motivo: "Capacitación" }, AHORA);

    expect(resultado.ok).toBe(true);
    expect(await bloqueosDe(n.negocioId)).toEqual([
      expect.objectContaining({
        sedeId: n.sedeId,
        recursoId: null,
        inicio: new Date("2030-03-05T05:00:00Z"),
        fin: new Date("2030-03-06T05:00:00Z"),
        motivo: "Capacitación",
      }),
    ]);
  });

  test.each<[string, EntradaBloqueo, string, string]>([
    ["unas horas", { tipo: "hora", fecha: "2030-03-05", horaInicio: "14:00", horaFin: "16:30" }, "2030-03-05T19:00:00Z", "2030-03-05T21:30:00Z"],
    ["un día completo", { tipo: "dia", fecha: "2030-03-05" }, "2030-03-05T05:00:00Z", "2030-03-06T05:00:00Z"],
    ["un rango de días", { tipo: "rango", desde: "2030-03-05", hasta: "2030-03-07" }, "2030-03-05T05:00:00Z", "2030-03-08T05:00:00Z"],
  ])("%s se guarda como intervalo UTC en la zona del negocio", async (_, entrada, inicio, fin) => {
    const n = await negocioConServicio();

    expect((await crearBloqueo({ negocioId: n.negocioId }, entrada, AHORA)).ok).toBe(true);
    expect(await bloqueosDe(n.negocioId)).toEqual([
      expect.objectContaining({ inicio: new Date(inicio), fin: new Date(fin), motivo: null }),
    ]);
  });

  test("una cita confirmada que ya terminó no lo impide (D-15: \"citas confirmadas que aún no terminan\")", async () => {
    const n = await negocioConServicio();
    // Hoy a las 8:00 a. m. de Bogotá: terminó a las 8:30, antes de AHORA (10:00).
    await crearCita(n, new Date(AHORA.getTime() - 2 * HORA));

    const resultado = await crearBloqueo({ negocioId: n.negocioId }, unDia("2030-03-04"), AHORA);

    expect(resultado.ok).toBe(true);
    expect(await bloqueosDe(n.negocioId)).toHaveLength(1);
  });

  test("una cita cancelada en el rango no lo impide", async () => {
    const n = await negocioConServicio();
    await crearCita(n, new Date("2030-03-05T15:00:00Z"), "cancelada");

    expect((await crearBloqueo({ negocioId: n.negocioId }, unDia(), AHORA)).ok).toBe(true);
  });

  test("BLOQUEO_CON_CITAS trae, para cada cita, su inicio, su servicio y el nombre del cliente (F-09)", async () => {
    const n = await negocioConServicio();
    const cita = await crearCita(n, new Date("2030-03-05T15:00:00Z"));
    // Una cita en curso también impide: empezó antes de AHORA y todavía no termina.
    const enCurso = await crearCita(n, new Date(AHORA.getTime() - 10 * 60 * 1000));

    const resultado = await crearBloqueo({ negocioId: n.negocioId }, { tipo: "rango", desde: "2030-03-04", hasta: "2030-03-05" }, AHORA);

    expect(resultado).toEqual({
      ok: false,
      error: "BLOQUEO_CON_CITAS",
      citas: [
        { id: enCurso.id, inicio: enCurso.inicio, servicio: "Examen visual", cliente: "Ana Pérez" },
        { id: cita.id, inicio: cita.inicio, servicio: "Examen visual", cliente: "Ana Pérez" },
      ],
    });
    expect(await bloqueosDe(n.negocioId)).toEqual([]);
  });

  test("el solapamiento es semiabierto: una cita que termina justo cuando empieza el bloqueo no lo impide (S-04)", async () => {
    const n = await negocioConServicio();
    await crearCita(n, new Date("2030-03-05T18:30:00Z")); // 1:30–2:00 p. m.

    const resultado = await crearBloqueo(
      { negocioId: n.negocioId },
      { tipo: "hora", fecha: "2030-03-05", horaInicio: "14:00", horaFin: "15:00" },
      AHORA,
    );

    expect(resultado.ok).toBe(true);
  });

  test.each<[string, EntradaBloqueo]>([
    ["unas horas que terminan antes de empezar", { tipo: "hora", fecha: "2030-03-05", horaInicio: "16:00", horaFin: "14:00" }],
    ["un rango que termina antes de empezar", { tipo: "rango", desde: "2030-03-07", hasta: "2030-03-05" }],
    ["una fecha que no existe", { tipo: "dia", fecha: "2030-02-30" }],
    ["un bloqueo que ya terminó", { tipo: "dia", fecha: "2030-03-03" }],
    ["un tipo desconocido", { tipo: "semana", fecha: "2030-03-05" } as unknown as EntradaBloqueo],
  ])("%s devuelve DATOS_INVALIDOS y no guarda nada", async (_, entrada) => {
    const n = await negocioConServicio();

    expect(await crearBloqueo({ negocioId: n.negocioId }, entrada, AHORA)).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    expect(await bloqueosDe(n.negocioId)).toEqual([]);
  });
});

describe("listarBloqueos y eliminarBloqueo", () => {
  async function insertarBloqueo(negocioId: string, sedeId: string, inicio: string, fin: string) {
    const [fila] = await db()
      .insert(esquema.bloqueo)
      .values({ negocioId, sedeId, inicio: new Date(inicio), fin: new Date(fin) })
      .returning({ id: esquema.bloqueo.id });
    return fila.id;
  }

  test("lista los vigentes y futuros por inicio, sin los que ya terminaron ni los de otros negocios", async () => {
    const n = await negocioConServicio();
    const otro = await negocioConServicio();
    const futuro = await insertarBloqueo(n.negocioId, n.sedeId, "2030-03-10T05:00:00Z", "2030-03-11T05:00:00Z");
    const vigente = await insertarBloqueo(n.negocioId, n.sedeId, "2030-03-04T14:00:00Z", "2030-03-04T16:00:00Z");
    await insertarBloqueo(n.negocioId, n.sedeId, "2030-03-03T05:00:00Z", "2030-03-04T05:00:00Z"); // terminó
    await insertarBloqueo(n.negocioId, n.sedeId, "2030-03-04T14:00:00Z", "2030-03-04T15:00:00Z"); // termina justo ahora
    await insertarBloqueo(otro.negocioId, otro.sedeId, "2030-03-05T05:00:00Z", "2030-03-06T05:00:00Z");

    expect((await listarBloqueos({ negocioId: n.negocioId }, AHORA)).map((b) => b.id)).toEqual([vigente, futuro]);
  });

  test("eliminar quita el bloqueo del negocio", async () => {
    const n = await negocioConServicio();
    const id = await insertarBloqueo(n.negocioId, n.sedeId, "2030-03-10T05:00:00Z", "2030-03-11T05:00:00Z");

    expect(await eliminarBloqueo({ negocioId: n.negocioId }, id)).toEqual({ ok: true, valor: undefined });
    expect(await bloqueosDe(n.negocioId)).toEqual([]);
  });

  test("eliminar un bloqueo inexistente o de otro negocio devuelve NO_ENCONTRADO, y el bloqueo sigue (ARCH §6)", async () => {
    const a = await negocioConServicio();
    const b = await negocioConServicio();
    const deB = await insertarBloqueo(b.negocioId, b.sedeId, "2030-03-10T05:00:00Z", "2030-03-11T05:00:00Z");

    for (const id of [deB, randomUUID(), "no-es-un-id"]) {
      expect(await eliminarBloqueo({ negocioId: a.negocioId }, id)).toEqual({ ok: false, error: "NO_ENCONTRADO" });
    }
    expect(await bloqueosDe(b.negocioId)).toHaveLength(1);
  });
});
