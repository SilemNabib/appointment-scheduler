import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { sumarDias, localAUtc, ZONA_HORARIA_POR_DEFECTO } from "@/dominio/tiempo";
import { guardarNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Código de reserva (D-28; ARCH §11.4; Q-41). "Ahora" es el viernes 1-mar-2030 a las
// 10:00 a. m. de Bogotá; el negocio de prueba atiende de lunes a viernes de 8:00 a 12:00
// y de 14:00 a 18:00, con un servicio de 30 minutos: 16 horas por día.

const AHORA = new Date("2030-03-01T15:00:00Z");
const FORMATO = /^[A-Z]{2}-[0-9]{4,6}$/;

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

/** La n-ésima hora libre desde el lunes 4-mar-2030, con su propio cliente. */
function reserva(n: Negocio, i: number): EntradaReserva {
  const dia = sumarDias("2030-03-04", Math.floor(i / 16));
  const minutos = (i % 16 < 8 ? 8 * 60 : 14 * 60) + (i % 8) * 30;
  const hora = `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
  return {
    slug: n.slug,
    sedeId: n.sedeId,
    servicioId: n.servicioId,
    recursoId: null,
    inicio: localAUtc(dia, hora, ZONA_HORARIA_POR_DEFECTO).toISOString(),
    nombre: "Cliente",
    apellido: `Número ${i}`,
    telefono: `310 000 ${String(5000 + i)}`,
    correo: `cliente${i}@example.com`,
    politicaDatosId: n.politicaId,
    aceptaPolitica: true,
    sitioWeb: "",
  };
}

const citasDe = (negocioId: string) =>
  db().select({ id: esquema.cita.id, codigo: esquema.cita.codigo }).from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

describe("código de reserva (D-28)", () => {
  test("30 reservas del mismo negocio quedan con 30 códigos distintos con el formato de Q-41", { timeout: 120_000 }, async () => {
    const n = await negocioConAgenda(); // "Óptica Visión": OV
    // De a 5 en paralelo: varias reservas compiten por el mismo recurso y por los códigos.
    for (let tanda = 0; tanda < 6; tanda++) {
      const resultados = await Promise.all(Array.from({ length: 5 }, (_, j) => reservarCita(reserva(n, tanda * 5 + j), AHORA)));
      expect(resultados.map((r) => r.ok), JSON.stringify(resultados)).toEqual([true, true, true, true, true]);
    }

    const codigos = (await citasDe(n.negocioId)).map((c) => c.codigo);
    expect(codigos).toHaveLength(30);
    expect(new Set(codigos).size).toBe(30);
    for (const codigo of codigos) expect(codigo).toMatch(FORMATO);
    expect(codigos.every((c) => c.startsWith("OV-"))).toBe(true);
  });

  test("el código de una cita no cambia si el negocio cambia de nombre; las nuevas usan el prefijo nuevo", async () => {
    const n = await negocioConAgenda();
    const primera = await reservarCita(reserva(n, 0), AHORA);
    if (!primera.ok) throw new Error(primera.error);
    expect(primera.valor.codigo).toMatch(/^OV-/);

    await guardarNegocio({ negocioId: n.negocioId }, { nombre: "Ébano Estudio", colorPrimario: "#2b3fd6" });
    const segunda = await reservarCita(reserva(n, 1), AHORA);
    if (!segunda.ok) throw new Error(segunda.error);

    const porId = new Map((await citasDe(n.negocioId)).map((c) => [c.id, c.codigo]));
    expect(porId.get(primera.valor.citaId)).toBe(primera.valor.codigo);
    expect(segunda.valor.codigo).toMatch(/^EE-[0-9]{4}$/);
  });
});
