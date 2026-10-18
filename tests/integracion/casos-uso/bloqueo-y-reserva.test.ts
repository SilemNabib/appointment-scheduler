import { describe, expect, test } from "vitest";
import { crearBloqueo } from "@/servidor/casos-uso/bloqueos";
import { reservarCita } from "@/servidor/casos-uso/reservar-cita";
import { negocioConAgenda } from "../fixtures";

// Un bloqueo y una reserva simultáneos sobre el mismo rango (D-15, RN-11; ARCH §11.3 y
// §20, Bloqueos): los dos toman el bloqueo del recurso, así que entra solo uno. Es el
// caso que quedó pendiente en la Fase 2. "Ahora" es el viernes 1-mar-2030 a las 10:00
// a. m. de Bogotá; cada ronda usa media hora distinta del lunes 4-mar-2030.

const AHORA = new Date("2030-03-01T15:00:00Z");
const LUNES = "2030-03-04";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rondas con la hora local y quién sale primero, por cuántos milisegundos (0 = a la vez). */
const RONDAS = [
  { hora: "08:00", ventaja: { de: "nadie", ms: 0 } },
  { hora: "08:30", ventaja: { de: "nadie", ms: 0 } },
  { hora: "09:00", ventaja: { de: "reserva", ms: 150 } },
  { hora: "09:30", ventaja: { de: "bloqueo", ms: 150 } },
  { hora: "10:00", ventaja: { de: "reserva", ms: 400 } },
  { hora: "10:30", ventaja: { de: "bloqueo", ms: 400 } },
] as const;

const finDeMediaHora = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  const fin = h * 60 + m + 30;
  return `${String(Math.floor(fin / 60)).padStart(2, "0")}:${String(fin % 60).padStart(2, "0")}`;
};

describe("crearBloqueo y reservarCita a la vez (D-15, RN-11)", () => {
  test(
    "en cada ronda entra solo uno: si gana la reserva, el bloqueo responde BLOQUEO_CON_CITAS con esa cita; si gana el bloqueo, la reserva responde HORARIO_NO_DISPONIBLE",
    async () => {
      const n = await negocioConAgenda();

      for (const [i, { hora, ventaja }] of RONDAS.entries()) {
        const inicio = new Date(`${LUNES}T${hora}:00-05:00`);
        const bloquear = async () => {
          if (ventaja.de === "reserva") await esperar(ventaja.ms);
          return crearBloqueo(
            { negocioId: n.negocioId },
            { tipo: "hora", fecha: LUNES, horaInicio: hora, horaFin: finDeMediaHora(hora) },
            AHORA,
          );
        };
        const reservar = async () => {
          if (ventaja.de === "bloqueo") await esperar(ventaja.ms);
          return reservarCita(
            {
              slug: n.slug,
              sedeId: n.sedeId,
              servicioId: n.servicioId,
              inicio: inicio.toISOString(),
              nombre: "Ana",
              apellido: "Pérez",
              telefono: `310 000 ${2000 + i}`,
              correo: `ronda${i}@mail.com`,
              politicaDatosId: n.politicaId,
              aceptaPolitica: true,
              sitioWeb: "",
            },
            AHORA,
          );
        };

        const [bloqueo, reserva] = await Promise.all([bloquear(), reservar()]);
        const ronda = `ronda ${i} (${hora})`;

        // Nunca entran los dos, y siempre entra uno.
        expect(bloqueo.ok !== reserva.ok, ronda).toBe(true);
        if (reserva.ok) {
          expect(bloqueo, ronda).toEqual({
            ok: false,
            error: "BLOQUEO_CON_CITAS",
            citas: [{ id: reserva.valor.citaId, inicio, servicio: "Examen visual", cliente: "Ana Pérez" }],
          });
        } else {
          expect(bloqueo.ok, ronda).toBe(true);
          expect(reserva, ronda).toEqual({ ok: false, error: "HORARIO_NO_DISPONIBLE" });
        }
      }
    },
    180_000,
  );
});
