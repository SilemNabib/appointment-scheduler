import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { intervaloDeDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { consultarDisponibilidad } from "@/servidor/casos-uso/disponibilidad";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import * as agenda from "@/servidor/db/repositorios/agenda";
import { negocioConAgenda } from "../fixtures";

// Ocupación con citas reales (RN-10, D-06; ARCH §20, Ocupación): todo estado salvo
// `cancelada` ocupa capacidad. Los cambios de estado se hacen por SQL, porque sus
// operaciones llegan en las Fases 5 y 6. El servicio dura 30 minutos con 10 de buffer
// y no hay anticipación mínima; la cita se reserva el viernes 1-mar-2030 para el lunes
// 4-mar-2030 a las 9:00 a. m. de Bogotá, y ocupa hasta las 9:40.

const RESERVADA_EN = new Date("2030-03-01T15:00:00Z");
const LUNES = "2030-03-04";
const a = (hora: string) => new Date(`${LUNES}T${hora}:00-05:00`).toISOString();

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const negocio = () =>
  negocioConAgenda({ servicio: { duracionMinutos: 30, bufferMinutos: 10 }, reglas: { anticipacionMinimaMinutos: 0 } });

const reserva = (n: Negocio, inicio: string, cliente: number): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  inicio,
  nombre: `Cliente ${cliente}`,
  apellido: "Prueba",
  telefono: `310 000 ${3000 + cliente}`,
  correo: `ocupacion${cliente}@mail.com`,
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
});

async function reservar(n: Negocio, inicio: string, cliente: number, ahora = RESERVADA_EN) {
  const resultado = await reservarCita(reserva(n, inicio, cliente), ahora);
  if (!resultado.ok) throw new Error(`La reserva de prueba falló: ${resultado.error}`);
  return resultado.valor.citaId;
}

async function iniciosDelLunes(n: Negocio, ahora: Date) {
  const resultado = await consultarDisponibilidad(
    { slug: n.slug, sedeId: n.sedeId, servicioId: n.servicioId, desde: LUNES, hasta: LUNES },
    ahora,
  );
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.dias.flatMap((d) => d.inicios);
}

describe("ocupación de las citas (RN-10, D-06)", () => {
  test.each(["completada", "no_asistio"] as const)(
    "una cita marcada %s antes de terminar sigue ocupando su intervalo hasta ocupado_hasta: la hora no se ofrece ni se puede reservar (RN-10; ARCH §20)",
    async (estado) => {
      const n = await negocio();
      const citaId = await reservar(n, a("09:00"), 1);
      // El dueño la marca a las 9:10, antes de que termine (9:30) y de que acabe el buffer (9:40).
      await db().update(esquema.cita).set({ estado }).where(eq(esquema.cita.id, citaId));
      const lasNueveYDiez = new Date(a("09:10"));

      const inicios = await iniciosDelLunes(n, lasNueveYDiez);
      expect(inicios).not.toContain(a("09:30")); // se solapa con el buffer, hasta las 9:40
      expect(inicios).toContain(a("10:00"));
      expect(await reservarCita(reserva(n, a("09:30"), 2), lasNueveYDiez)).toEqual({
        ok: false,
        error: "HORARIO_NO_DISPONIBLE",
      });
    },
  );

  test("una cita cancelada libera su cupo de inmediato (RN-10)", async () => {
    const n = await negocio();
    const citaId = await reservar(n, a("09:00"), 1);
    expect(await iniciosDelLunes(n, RESERVADA_EN)).not.toContain(a("09:00"));

    await db()
      .update(esquema.cita)
      .set({ estado: "cancelada", canceladaEn: RESERVADA_EN, canceladaPor: "cliente" })
      .where(eq(esquema.cita.id, citaId));

    expect(await iniciosDelLunes(n, RESERVADA_EN)).toContain(a("09:00"));
    expect((await reservarCita(reserva(n, a("09:00"), 2), RESERVADA_EN)).ok).toBe(true);
  });

  test("con enable_seqscan = off en la sesión de la prueba, el plan de la consulta de ocupación usa cita_ocupacion_idx (ARCH §20)", async () => {
    const n = await negocio();
    await reservar(n, a("09:00"), 1);
    // La misma consulta que lee la reserva: el día local del inicio.
    const consulta = agenda
      .consultaDeOcupacion(n.negocioId, n.recursoId, intervaloDeDias(LUNES, LUNES, ZONA_HORARIA_POR_DEFECTO), null, db())
      .toSQL();

    // Conexión directa: con el pooler, un SET de sesión no se conserva entre sentencias.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECTA });
    const sesion = await pool.connect();
    try {
      await sesion.query("SET enable_seqscan = off");
      const { rows } = await sesion.query<{ "QUERY PLAN": string }>(`EXPLAIN ${consulta.sql}`, consulta.params);
      const plan = rows.map((fila) => fila["QUERY PLAN"]).join("\n");
      expect(plan).toContain("cita_ocupacion_idx");
    } finally {
      sesion.release();
      await pool.end();
    }
  });
});
