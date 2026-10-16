import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";
import { crearBloqueo } from "@/servidor/casos-uso/bloqueos";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { crearCliente, datosDeCita, sesionDeDueno } from "../fixtures";

// Regla de D-15 en crearBloqueo (RN-07; ARCH §20, Bloqueos). El otro caso de ARCH §20
// (un bloqueo y una reserva simultáneos) va en la Fase 3, con `reservarCita`.
// "Ahora" es el lunes 4-mar-2030 a las 10:00 a. m. de Bogotá. Clerk se simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const AHORA = new Date("2030-03-04T15:00:00Z");

/** Negocio con una cita confirmada el martes 5-mar-2030 a las 10:00 a. m. de Bogotá. */
async function negocioConCita() {
  const { negocioId } = await sesionDeDueno();
  const consultorio = await leerConsultorio({ negocioId });
  const servicio = await guardarServicio({ negocioId }, { nombre: "Examen visual", duracionMinutos: "30" });
  if (!servicio.ok) throw new Error(servicio.error);
  const inicio = new Date("2030-03-05T15:00:00Z");
  const fin = new Date(inicio.getTime() + 30 * 60 * 1000);
  const [cita] = await db()
    .insert(esquema.cita)
    .values({
      ...datosDeCita({
        negocioId,
        sedeId: consultorio.sedeId,
        servicioId: servicio.valor.id,
        recursoId: consultorio.id,
        clienteId: await crearCliente(negocioId),
      }),
      inicio,
      fin,
      ocupadoHasta: fin,
    })
    .returning();
  return { negocioId, cita };
}

const bloqueosDe = (negocioId: string) =>
  db().select().from(esquema.bloqueo).where(eq(esquema.bloqueo.negocioId, negocioId));

describe("reglas de bloqueos (D-15)", () => {
  test("un bloqueo que se solapa con una cita confirmada se rechaza con BLOQUEO_CON_CITAS y no se guarda (RN-07; ARCH §20, Bloqueos)", async () => {
    const { negocioId } = await negocioConCita();

    const resultado = await crearBloqueo(
      { negocioId },
      { tipo: "hora", fecha: "2030-03-05", horaInicio: "09:00", horaFin: "11:00" },
      AHORA,
    );

    expect(resultado).toMatchObject({ ok: false, error: "BLOQUEO_CON_CITAS" });
    expect(await bloqueosDe(negocioId)).toEqual([]);
  });

  test("el rechazo trae esa cita, para que el panel la muestre (RN-07: \"se rechaza y muestra esa cita\")", async () => {
    const { negocioId, cita } = await negocioConCita();

    const resultado = await crearBloqueo({ negocioId }, { tipo: "dia", fecha: "2030-03-05" }, AHORA);

    expect(resultado).toEqual({
      ok: false,
      error: "BLOQUEO_CON_CITAS",
      citas: [{ id: cita.id, inicio: cita.inicio, servicio: cita.servicioNombre, cliente: "Ana Pérez" }],
    });
  });
});
