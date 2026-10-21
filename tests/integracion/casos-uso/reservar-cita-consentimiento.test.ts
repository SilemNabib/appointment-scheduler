import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { consultarDisponibilidad } from "@/servidor/casos-uso/disponibilidad";
import { publicarPolitica } from "@/servidor/casos-uso/politica-datos";
import { reservarCita, type EntradaReserva } from "@/servidor/casos-uso/reservar-cita";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { negocioConAgenda } from "../fixtures";

// Consentimiento y hora en la reserva (RN-03, RN-17). "Ahora" es el viernes 1-mar-2030
// a las 10:00 a. m. de Bogotá; la reserva es el lunes 4-mar-2030 a las 9:00 a. m.

const AHORA = new Date("2030-03-01T15:00:00Z");
const LUNES_9AM = "2030-03-04T14:00:00.000Z";

type Negocio = Awaited<ReturnType<typeof negocioConAgenda>>;

const reserva = (n: Negocio, cambios: Partial<EntradaReserva> = {}): EntradaReserva => ({
  slug: n.slug,
  sedeId: n.sedeId,
  servicioId: n.servicioId,
  inicio: LUNES_9AM,
  nombre: "Ana",
  apellido: "Pérez",
  telefono: "300 123 4567",
  correo: "ana@mail.com",
  politicaDatosId: n.politicaId,
  aceptaPolitica: true,
  sitioWeb: "",
  ...cambios,
});

const citasDe = (negocioId: string) => db().select().from(esquema.cita).where(eq(esquema.cita.negocioId, negocioId));

describe("consentimiento (RN-17)", () => {
  test("sin alguno de los cuatro datos, o sin marcar la casilla, no se puede reservar (RN-17)", async () => {
    const n = await negocioConAgenda();
    const sin = (clave: keyof EntradaReserva) =>
      Object.fromEntries(Object.entries(reserva(n)).filter(([nombre]) => nombre !== clave));
    const casos: [string, unknown][] = [
      ["sin nombre", sin("nombre")],
      ["sin apellido", sin("apellido")],
      ["sin teléfono", sin("telefono")],
      ["sin correo", sin("correo")],
      ["con el nombre vacío", reserva(n, { nombre: "" })],
      ["con el correo vacío", reserva(n, { correo: "" })],
      ["sin la casilla", sin("aceptaPolitica")],
      ["con la casilla sin marcar", { ...reserva(n), aceptaPolitica: false }],
    ];

    for (const [que, entrada] of casos) {
      expect(await reservarCita(entrada, AHORA), que).toEqual({ ok: false, error: "DATOS_INVALIDOS" });
    }
    expect(await citasDe(n.negocioId)).toEqual([]);
  });

  test("cada cita pública guarda la versión de la política y la fecha y hora de aceptación (RN-17)", async () => {
    const n = await negocioConAgenda();
    // El dueño publica la v2 mientras el cliente, que vio la v1, llena el formulario (F-01).
    const v2 = await publicarPolitica({ negocioId: n.negocioId }, { contenido: "Política v2" });
    if (!v2.ok) throw new Error(v2.error);

    const resultado = await reservarCita(reserva(n), AHORA);
    if (!resultado.ok) throw new Error(resultado.error);

    const [guardada] = await db()
      .select({
        origen: esquema.cita.origen,
        politicaAceptadaEn: esquema.cita.politicaAceptadaEn,
        version: esquema.politicaDatos.version,
      })
      .from(esquema.cita)
      .innerJoin(
        esquema.politicaDatos,
        and(eq(esquema.politicaDatos.id, esquema.cita.politicaDatosId), eq(esquema.politicaDatos.negocioId, esquema.cita.negocioId)),
      )
      .where(eq(esquema.cita.id, resultado.valor.citaId));
    expect(guardada).toEqual({ origen: "publico", politicaAceptadaEn: AHORA, version: 1 });
  });
});

describe("hora de la cita (RN-03)", () => {
  test("una cita reservada a las 7:00 p. m. hora de Colombia se guarda como las 00:00 UTC del día siguiente (RN-03)", async () => {
    const n = await negocioConAgenda({ franjas: [{ dia: 1, inicio: "14:00", fin: "20:00" }] });
    const sieteDeLaNoche = "2030-03-05T00:00:00.000Z"; // lunes 4-mar, 7:00 p. m. en Bogotá

    // La consulta la ofrece en el día local del lunes, no en el martes de UTC.
    const consulta = await consultarDisponibilidad(
      { slug: n.slug, sedeId: n.sedeId, servicioId: n.servicioId, desde: "2030-03-04", hasta: "2030-03-05" },
      AHORA,
    );
    expect(consulta.ok && consulta.valor.dias).toEqual([
      expect.objectContaining({ fecha: "2030-03-04", inicios: expect.arrayContaining([sieteDeLaNoche]) }),
      { fecha: "2030-03-05", inicios: [] },
    ]);

    const resultado = await reservarCita(reserva(n, { inicio: sieteDeLaNoche }), AHORA);
    expect(resultado).toEqual({
      ok: true,
      valor: { citaId: expect.any(String), codigo: expect.any(String), inicio: sieteDeLaNoche, fin: "2030-03-05T00:30:00.000Z" },
    });
    const [cita] = await citasDe(n.negocioId);
    expect(cita.inicio.toISOString()).toBe(sieteDeLaNoche);
  });
});
