import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Concurrencia de la reserva (RN-11, ADR-04; ARCH §11.3 y §20, Concurrencia) con
// reservas reales en paralelo contra Neon: cada una abre su transacción y espera en el
// `FOR UPDATE` del recurso. El caso "al reprogramar contra una reserva" va con
// `reprogramarCita`, en la Fase 6. "Ahora" es el viernes 1-mar-2030 a las 10:00 a. m.
// de Bogotá; todas piden el lunes 4-mar-2030 a las 9:00 a. m.

const AHORA = new Date("2030-03-01T15:00:00Z");
const INICIO = "2030-03-04T14:00:00.000Z";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

/** La reserva del cliente `i`: cada una con su propio teléfono y correo. */
const reserva = (n: Negocio, i: number): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  inicio: INICIO,
  nombre: `Cliente ${i}`,
  apellido: "Prueba",
  telefono: `310 000 ${String(1000 + i)}`,
  correo: `cliente${i}@mail.com`,
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
});

/** Lanza las 10 reservas a la vez y devuelve cuántas entraron y los errores de las demás. */
async function diezALaVez(n: Negocio) {
  const resultados = await Promise.all(Array.from({ length: 10 }, (_, i) => reservarCita(reserva(n, i), AHORA)));
  return {
    entraron: resultados.filter((r) => r.ok).length,
    errores: resultados.flatMap((r) => (r.ok ? [] : [r.error])),
  };
}

const citasDe = (negocioId: string) =>
  db().select({ inicio: esquema.cita.inicio }).from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

describe("reservarCita en paralelo (RN-11)", () => {
  test(
    "con 10 reservas simultáneas por el último cupo de un recurso de capacidad 1, entra exactamente una y las demás reciben HORARIO_NO_DISPONIBLE (RN-11)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 1 });

      const { entraron, errores } = await diezALaVez(n);

      expect(entraron).toBe(1);
      expect(errores).toEqual(Array(9).fill("HORARIO_NO_DISPONIBLE"));
      expect(await citasDe(n.negocioId)).toEqual([{ inicio: new Date(INICIO) }]);
    },
    120_000,
  );

  test(
    "con capacidad 2, entran exactamente dos (RN-11)",
    async () => {
      const n = await negocioConAgenda({ capacidad: 2 });

      const { entraron, errores } = await diezALaVez(n);

      expect(entraron).toBe(2);
      expect(errores).toEqual(Array(8).fill("HORARIO_NO_DISPONIBLE"));
      expect(await citasDe(n.negocioId)).toHaveLength(2);
    },
    120_000,
  );
});
