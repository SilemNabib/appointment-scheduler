import { describe, expect, test } from "vitest";
import { intervaloDeDias, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { consultarDisponibilidad } from "@/servidor/casos-uso/disponibilidad";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearRecurso, crearSede, negocioConAgenda } from "../fixtures";

// Las sedes en el motor (RN-32; ARCH §20, Sedes). La sede A es la principal del
// negocio de prueba; la sede B se crea por SQL, porque la interfaz de varias sedes
// llega después (D-16), con su recurso, la misma oferta del servicio y el mismo
// horario: lunes y martes de 8:00 a 12:00. "Ahora" es el viernes 1-mar-2030 a las
// 10:00 a. m. de Bogotá.

const AHORA = new Date("2030-03-01T15:00:00Z");
const LUNES = "2030-03-04";
const MARTES = "2030-03-05";
const FRANJAS = [
  { dia: 1, inicio: "08:00", fin: "12:00" },
  { dia: 2, inicio: "08:00", fin: "12:00" },
];

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

/** La sede B: su recurso, la oferta del servicio (con la duración que se indique) y el horario. */
async function segundaSede(n: Negocio, duracionMinutos: number | null = null) {
  const sedeId = await crearSede(n.negocioId);
  const recursoId = await crearRecurso(n.negocioId, sedeId);
  await db().insert(esquema.servicioSede).values({ negocioId: n.negocioId, servicioId: n.servicioId, sedeId, duracionMinutos });
  await db().insert(esquema.servicioSedeRecurso).values({ negocioId: n.negocioId, servicioId: n.servicioId, sedeId, recursoId });
  await db()
    .insert(esquema.horarioSemanal)
    .values(FRANJAS.map((f) => ({ negocioId: n.negocioId, sedeId, diaSemana: f.dia, horaInicio: f.inicio, horaFin: f.fin })));
  return sedeId;
}

async function inicios(n: Negocio, sedeId: string, fecha: string) {
  const resultado = await consultarDisponibilidad(
    { slug: n.slug, sedeId, servicioId: n.servicioId, desde: fecha, hasta: fecha },
    AHORA,
  );
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.dias.flatMap((d) => d.inicios);
}

/** Horas locales `HH:mm` de una lista de inicios en UTC (Bogotá, UTC−5). */
const horas = (lista: string[]) =>
  lista.map((iso) => {
    const d = new Date(Date.parse(iso) - 5 * 60 * 60 * 1000);
    return d.toISOString().slice(11, 16);
  });

describe("disponibilidad por sede (RN-32)", () => {
  test("un bloqueo de la sede A no afecta a la sede B, y uno sin sede afecta a las dos (RN-32)", async () => {
    const n = await negocioConAgenda({ franjas: FRANJAS });
    const sedeA = n.sedeId;
    const sedeB = await segundaSede(n);
    const dia = (fecha: string) => intervaloDeDias(fecha, fecha, ZONA_HORARIA_POR_DEFECTO);
    await db()
      .insert(esquema.bloqueo)
      .values([
        { negocioId: n.negocioId, sedeId: sedeA, ...dia(LUNES), motivo: "solo la sede A" },
        { negocioId: n.negocioId, sedeId: null, ...dia(MARTES), motivo: "todo el negocio" },
      ]);

    expect(await inicios(n, sedeA, LUNES)).toEqual([]);
    expect(await inicios(n, sedeB, LUNES)).toHaveLength(8); // de 8:00 a 11:30, sin el bloqueo de A
    expect(await inicios(n, sedeA, MARTES)).toEqual([]);
    expect(await inicios(n, sedeB, MARTES)).toEqual([]);
  });

  test("el mismo servicio con 30 minutos en la sede A y 45 en la sede B ofrece en cada sede las horas de su duración (RN-32; ARCH §20)", async () => {
    const n = await negocioConAgenda({ franjas: FRANJAS, servicio: { duracionMinutos: 30 } });
    const sedeB = await segundaSede(n, 45);

    expect(horas(await inicios(n, n.sedeId, LUNES))).toEqual([
      "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    ]);
    // Con 45 minutos, las 11:30 ya no caben antes de las 12:00.
    expect(horas(await inicios(n, sedeB, LUNES))).toEqual(["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00"]);

    // Y una reserva en la sede B dura 45 minutos.
    const reserva = await reservarCita(
      {
        slug: n.slug,
        sedeId: sedeB,
        servicioId: n.servicioId,
        inicio: "2030-03-04T16:00:00.000Z", // 11:00 a. m.
        nombre: "Ana",
        apellido: "Pérez",
        telefono: "300 123 4567",
        correo: "ana@mail.com",
        politicaDatosId: n.politicaId,
        aceptaPolitica: true,
        sitioWeb: "",
      },
      AHORA,
    );
    expect(reserva.ok && reserva.valor.fin).toBe("2030-03-04T16:45:00.000Z");
  });
});
