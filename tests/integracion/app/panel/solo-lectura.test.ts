import { asc, eq } from "drizzle-orm";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { crearBloqueoPanel, eliminarBloqueoPanel } from "@/app/(panel)/panel/bloqueos/acciones";
import { cancelarCitaPanel, marcarAsistenciaPanel, moverCitaPanel } from "@/app/(panel)/panel/citas/[id]/acciones";
import {
  buscarClientesPanel,
  crearCitaManualPanel,
  horasDuenoPanel,
} from "@/app/(panel)/panel/citas/nueva/acciones";
import { guardarConsultorioPanel } from "@/app/(panel)/panel/configuracion/consultorio/acciones";
import { guardarHorarioPanel } from "@/app/(panel)/panel/configuracion/horario/acciones";
import {
  guardarContactosNegocio,
  guardarDatosNegocio,
  quitarLogoNegocio,
  subirLogoNegocio,
} from "@/app/(panel)/panel/configuracion/negocio/acciones";
import { publicarPoliticaPanel } from "@/app/(panel)/panel/configuracion/politica/acciones";
import { guardarRecordatorioPanel } from "@/app/(panel)/panel/configuracion/recordatorios/acciones";
import { guardarReglasPanel } from "@/app/(panel)/panel/configuracion/reglas/acciones";
import {
  activarServicioPanel,
  desactivarServicioPanel,
  guardarServicioPanel,
} from "@/app/(panel)/panel/configuracion/servicios/acciones";
import { localAUtc } from "@/dominio/tiempo";
import { requireMiembro } from "@/servidor/auth/sesion";
import { listarAgenda } from "@/servidor/casos-uso/agenda-panel";
import { crearBloqueo, listarBloqueos } from "@/servidor/casos-uso/bloqueos";
import { crearCitaManual } from "@/servidor/casos-uso/cita-manual";
import { buscarClientes } from "@/servidor/casos-uso/clientes";
import { leerConfiguracion } from "@/servidor/casos-uso/configuracion";
import { leerConsultorio } from "@/servidor/casos-uso/consultorio";
import { buscarCitaPorCodigo, detalleCita } from "@/servidor/casos-uso/detalle-cita";
import { estadoConfiguracion } from "@/servidor/casos-uso/estado-configuracion";
import { leerNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { guardarHorarioSemanal, leerHorarioSemanal } from "@/servidor/casos-uso/horario";
import { consultarHorasDueno } from "@/servidor/casos-uso/horas-dueno";
import { listarPoliticas } from "@/servidor/casos-uso/politica-datos";
import { desactivarServicio, guardarServicio, listarServicios } from "@/servidor/casos-uso/servicios";
import { db } from "@/servidor/db/cliente";
import * as esquema from "@/servidor/db/esquema";
import { sesionDeDueno } from "../../fixtures";

// Con el negocio suspendido, el panel es de solo lectura (RN-04, D-14; ARCH §20,
// Suscripción): cada Server Action de la fase que modifica datos devuelve
// NEGOCIO_SUSPENDIDO y no cambia nada, y las lecturas siguen funcionando. Clerk se
// simula; R2 no se debe tocar.

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    throw new Error("Con el negocio suspendido no se debe tocar R2.");
  },
}));

let negocioId: string;
let servicioActivo: string;
let servicioInactivo: string;
let bloqueoId: string;
let citaId: string;
let codigo: string;

const formulario = (campos: Record<string, string | Blob>) => {
  const datos = new FormData();
  for (const [campo, valor] of Object.entries(campos)) datos.set(campo, valor);
  return datos;
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);

/** Todo lo que las acciones de la fase pueden cambiar, para comparar antes y después. */
async function datosDelNegocio() {
  const { negocio, configuracionNegocio, sede, recurso, servicio, horarioSemanal, bloqueo, politicaDatos, contactoSede } = esquema;
  const { cita, eventoCita, notificacion, cliente } = esquema;
  return {
    negocio: await db().select().from(negocio).where(eq(negocio.id, negocioId)),
    configuracion: await db().select().from(configuracionNegocio).where(eq(configuracionNegocio.negocioId, negocioId)),
    sedes: await db().select().from(sede).where(eq(sede.negocioId, negocioId)).orderBy(asc(sede.id)),
    recursos: await db().select().from(recurso).where(eq(recurso.negocioId, negocioId)).orderBy(asc(recurso.id)),
    servicios: await db().select().from(servicio).where(eq(servicio.negocioId, negocioId)).orderBy(asc(servicio.id)),
    horario: await db()
      .select()
      .from(horarioSemanal)
      .where(eq(horarioSemanal.negocioId, negocioId))
      .orderBy(asc(horarioSemanal.id)),
    bloqueos: await db().select().from(bloqueo).where(eq(bloqueo.negocioId, negocioId)).orderBy(asc(bloqueo.id)),
    politicas: await db()
      .select()
      .from(politicaDatos)
      .where(eq(politicaDatos.negocioId, negocioId))
      .orderBy(asc(politicaDatos.id)),
    contactos: await db()
      .select()
      .from(contactoSede)
      .where(eq(contactoSede.negocioId, negocioId))
      .orderBy(asc(contactoSede.id)),
    // Fase 5: las citas, su historial, sus avisos y los clientes.
    citas: await db().select().from(cita).where(eq(cita.negocioId, negocioId)).orderBy(asc(cita.id)),
    eventos: await db().select().from(eventoCita).where(eq(eventoCita.negocioId, negocioId)).orderBy(asc(eventoCita.id)),
    notificaciones: await db()
      .select()
      .from(notificacion)
      .where(eq(notificacion.negocioId, negocioId))
      .orderBy(asc(notificacion.id)),
    clientes: await db().select().from(cliente).where(eq(cliente.negocioId, negocioId)).orderBy(asc(cliente.id)),
  };
}

beforeAll(async () => {
  // Los datos se crean con los casos de uso, que no miran la suscripción: la que corta
  // es `requireEscritura`, en cada Server Action.
  ({ negocioId } = await sesionDeDueno({ estadoSuscripcion: "suspendida" }));
  const crear = async (nombre: string) => {
    const r = await guardarServicio({ negocioId }, { nombre, duracionMinutos: "30" });
    if (!r.ok) throw new Error(r.error);
    return r.valor.id;
  };
  servicioActivo = await crear("Examen visual");
  servicioInactivo = await crear("Lentes de contacto");
  await desactivarServicio({ negocioId }, servicioInactivo);
  await guardarHorarioSemanal({ negocioId }, { franjas: [{ dia: 1, inicio: "08:00", fin: "12:00" }] });
  const bloqueo = await crearBloqueo({ negocioId }, { tipo: "dia", fecha: "2030-03-05" });
  if (!bloqueo.ok) throw new Error(bloqueo.error);
  bloqueoId = bloqueo.valor.id;
  // Una cita del lunes 4-mar-2030 a las 9:00, creada antes con el caso de uso (que no mira la suscripción).
  const creada = await crearCitaManual(
    { negocioId, clerkUserId: "user_dueno" },
    {
      nombre: "Ana",
      apellido: "Pérez",
      telefono: "300 123 4567",
      correo: "ana@mail.com",
      servicioId: servicioActivo,
      inicio: localAUtc("2030-03-04", "09:00", "America/Bogota").toISOString(),
    },
    localAUtc("2030-03-01", "10:00", "America/Bogota"),
  );
  if (!creada.ok) throw new Error(creada.error);
  ({ citaId, codigo } = creada.valor);
});

describe("solo lectura con el negocio suspendido", () => {
  test.each<[string, () => Promise<unknown>]>([
    ["negocio: guardar los datos", () => guardarDatosNegocio(formulario({ nombre: "Otro", colorPrimario: "#000000" }))],
    ["negocio: guardar la marca ampliada (D-27)", () =>
      guardarDatosNegocio(
        formulario({
          nombre: "Óptica Visión",
          colorPrimario: "#2b3fd6",
          rubro: "Óptica",
          eslogan: "Otro eslogan",
          fraseBanner: "Otra frase",
          descripcion: "Otra descripción",
        }),
      )],
    ["negocio: guardar los contactos (D-29)", () =>
      guardarContactosNegocio({ contactos: [{ tipo: "whatsapp", valor: "300 999 8877", etiqueta: "Citas" }] })],
    ["logo: subir", () => subirLogoNegocio(formulario({ logo: new File([PNG], "logo.png", { type: "image/png" }) }))],
    ["logo: quitar", () => quitarLogoNegocio()],
    ["servicios: crear", () => guardarServicioPanel(formulario({ nombre: "Nuevo", duracionMinutos: "30" }))],
    ["servicios: editar", () => guardarServicioPanel(formulario({ id: servicioActivo, nombre: "Otro", duracionMinutos: "60" }))],
    ["servicios: activar", () => activarServicioPanel(servicioInactivo)],
    ["servicios: desactivar", () => desactivarServicioPanel(servicioActivo)],
    ["consultorio: guardar", () => guardarConsultorioPanel(formulario({ nombre: "Sala", capacidad: "3" }))],
    ["horario: guardar", () => guardarHorarioPanel({ franjas: [{ dia: 2, inicio: "09:00", fin: "13:00" }] })],
    ["bloqueos: crear", () => crearBloqueoPanel(formulario({ tipo: "dia", fecha: "2030-03-06" }))],
    ["bloqueos: eliminar", () => eliminarBloqueoPanel(bloqueoId)],
    ["reglas de reserva: guardar", () =>
      guardarReglasPanel(
        formulario({
          granularidadMinutos: "15",
          anticipacionMinimaMinutos: "0",
          anticipacionMaximaDias: "30",
          plazoCancelacionHoras: "1",
          maxReprogramacionesCliente: "",
          asistenciaPorDefecto: "manual",
        }),
      )],
    ["recordatorio: guardar", () => guardarRecordatorioPanel(formulario({ recordatorio: "ninguno" }))],
    ["política: publicar", () => publicarPoliticaPanel(formulario({ contenido: "# Otra política" }))],
    // Fase 5 (D-14): las operaciones del dueño sobre las citas.
    ["citas: crear una cita manual", () =>
      crearCitaManualPanel(
        formulario({
          nombre: "Luis",
          apellido: "Gómez",
          telefono: "310 555 1234",
          correo: "",
          servicioId: servicioActivo,
          inicio: localAUtc("2030-03-04", "10:00", "America/Bogota").toISOString(),
        }),
      )],
    ["citas: mover", () =>
      moverCitaPanel({ citaId, inicio: localAUtc("2030-03-04", "10:00", "America/Bogota").toISOString(), version: 1 })],
    ["citas: cancelar", () => cancelarCitaPanel(citaId)],
    ["citas: marcar la asistencia", () => marcarAsistenciaPanel({ citaId, estado: "completada", estadoEsperado: "confirmada" })],
  ])("%s devuelve NEGOCIO_SUSPENDIDO y no cambia nada (RN-04; ARCH §20)", async (_, accion) => {
    const antes = await datosDelNegocio();

    expect(await accion()).toEqual({ ok: false, error: "NEGOCIO_SUSPENDIDO" });

    expect(await datosDelNegocio()).toEqual(antes);
  });

  test("las lecturas de esas páginas siguen funcionando (ARCH §20: \"se puede consultar\")", async () => {
    const ctx = await requireMiembro();
    expect(ctx).toMatchObject({ negocioId, suscripcion: { estado: "suspendida" } });

    expect(await leerNegocio(ctx)).toMatchObject({ nombre: "Óptica Visión" });
    expect((await listarServicios(ctx)).map((s) => [s.id, s.activo])).toEqual([
      [servicioActivo, true],
      [servicioInactivo, false],
    ]);
    expect(await leerConsultorio(ctx)).toMatchObject({ nombre: "Consultorio", capacidad: 1 });
    expect(await leerHorarioSemanal(ctx)).toEqual([{ dia: 1, inicio: "08:00", fin: "12:00" }]);
    expect((await listarBloqueos(ctx)).map((b) => b.id)).toEqual([bloqueoId]);
    expect(await leerConfiguracion(ctx)).toMatchObject({ granularidadMinutos: 30 });
    expect((await listarPoliticas(ctx)).map((p) => p.version)).toEqual([1]);
    vi.stubEnv("APP_URL", "https://agenda.prueba");
    expect(await estadoConfiguracion(ctx)).toMatchObject({ serviciosActivos: 1, franjas: 1, completa: true });
    vi.unstubAllEnvs();
  });

  test("la agenda, el detalle, la búsqueda de clientes y las horas libres se siguen leyendo (ARCH §20: \"se puede consultar\")", async () => {
    const ctx = await requireMiembro();
    const ahora = localAUtc("2030-03-01", "10:00", "America/Bogota");

    const agenda = await listarAgenda(ctx, "2030-03-04", "2030-03-10");
    expect(agenda.ok && agenda.valor.citas.map((c) => c.id)).toEqual([citaId]);
    const detalle = await detalleCita(ctx, citaId, ahora);
    expect(detalle.ok && detalle.valor).toMatchObject({ id: citaId, acciones: { mover: false, cancelar: false, marcar: false } });
    expect(await buscarCitaPorCodigo(ctx, codigo)).toEqual({ ok: true, valor: { citaId } });
    expect((await buscarClientes(ctx, "300 123 4567")).map((c) => c.nombre)).toEqual(["Ana"]);
    expect(await buscarClientesPanel("Pérez")).toEqual([expect.objectContaining({ nombre: "Ana" })]);
    const horas = await consultarHorasDueno(ctx, { servicioId: servicioActivo, fecha: "2030-03-04" }, ahora);
    expect(horas.ok && horas.valor.inicios).not.toContain(localAUtc("2030-03-04", "09:00", "America/Bogota").toISOString());
    expect((await horasDuenoPanel({ servicioId: servicioActivo, fecha: "2030-03-04" })).ok).toBe(true);
  });
});
