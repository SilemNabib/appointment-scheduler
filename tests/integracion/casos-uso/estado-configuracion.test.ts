import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { estadoConfiguracion } from "@/servidor/casos-uso/estado-configuracion";
import { guardarHorarioSemanal } from "@/servidor/casos-uso/horario";
import { desactivarServicio, guardarServicio } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { sesionDeDueno } from "../fixtures";

// Estado de la configuración para el inicio del panel (F-05, PAN-18; Q-22). Clerk se
// simula.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));

beforeEach(() => {
  vi.stubEnv("APP_URL", "https://agenda.prueba");
  return () => vi.unstubAllEnvs();
});

async function crearServicio(negocioId: string) {
  const resultado = await guardarServicio({ negocioId }, { nombre: "Examen visual", duracionMinutos: "30" });
  if (!resultado.ok) throw new Error(resultado.error);
  return resultado.valor.id;
}

const lunes = { franjas: [{ dia: 1, inicio: "08:00", fin: "12:00" }] };

async function slugDe(negocioId: string) {
  const [fila] = await db().select({ slug: esquema.negocio.slug }).from(esquema.negocio).where(eq(esquema.negocio.id, negocioId));
  return fila.slug;
}

describe("estadoConfiguracion", () => {
  test("sin servicios activos ni franjas marca lo que falta; el enlace apunta a {APP_URL}/{slug}", async () => {
    const { negocioId } = await sesionDeDueno();

    expect(await estadoConfiguracion({ negocioId })).toEqual({
      serviciosActivos: 0,
      franjas: 0,
      completa: false,
      enlacePublico: `https://agenda.prueba/${await slugDe(negocioId)}`,
    });
  });

  test("con servicios pero sin horario, o con horario pero sin servicios, sigue incompleta (F-05, paso 4)", async () => {
    const conServicio = await sesionDeDueno();
    await crearServicio(conServicio.negocioId);
    const conHorario = await sesionDeDueno();
    await guardarHorarioSemanal({ negocioId: conHorario.negocioId }, lunes);

    expect(await estadoConfiguracion({ negocioId: conServicio.negocioId })).toMatchObject({
      serviciosActivos: 1,
      franjas: 0,
      completa: false,
    });
    expect(await estadoConfiguracion({ negocioId: conHorario.negocioId })).toMatchObject({
      serviciosActivos: 0,
      franjas: 1,
      completa: false,
    });
  });

  test("con un servicio activo y una franja está completa", async () => {
    const { negocioId } = await sesionDeDueno();
    await crearServicio(negocioId);
    await guardarHorarioSemanal({ negocioId }, { franjas: [...lunes.franjas, { dia: 2, inicio: "08:00", fin: "12:00" }] });

    expect(await estadoConfiguracion({ negocioId })).toMatchObject({ serviciosActivos: 1, franjas: 2, completa: true });
  });

  test("no cuenta los servicios inactivos, los horarios propios de los recursos ni los datos de otros negocios", async () => {
    const { negocioId } = await sesionDeDueno();
    await desactivarServicio({ negocioId }, await crearServicio(negocioId));
    const consultorio = await leerConsultorio({ negocioId });
    await db().insert(esquema.horarioSemanal).values({
      negocioId,
      sedeId: consultorio.sedeId,
      recursoId: consultorio.id,
      diaSemana: 1,
      horaInicio: "08:00",
      horaFin: "12:00",
    });
    const otro = await sesionDeDueno();
    await crearServicio(otro.negocioId);
    await guardarHorarioSemanal({ negocioId: otro.negocioId }, lunes);

    expect(await estadoConfiguracion({ negocioId })).toMatchObject({ serviciosActivos: 0, franjas: 0, completa: false });
  });
});
