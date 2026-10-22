import "server-only";
import { z } from "zod";
import type { Azar } from "@/dominio/codigo-reserva";
import { normalizarCorreo, normalizarTelefono } from "@/dominio/identidad-cliente";
import { ErrorNegocio, exito, fallo, type Fallo, type Resultado } from "@/dominio/resultado";
import { mesLocal } from "@/dominio/tiempo";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as agenda from "@/servidor/db/repositorios/agenda";
import * as citas from "@/servidor/db/repositorios/citas";
import * as notificaciones from "@/servidor/db/repositorios/notificaciones";
import { exigirCupo } from "@/servidor/planes/acceso";
import {
  avisosDeCitaNueva,
  azarSeguro,
  crearCita,
  enTransaccionConReintentos,
  negocioDelPanel,
  type HorarioNoDisponible,
} from "./agendar";
import { esId } from "./esquemas";

// Cita manual del dueño (PAN-04, F-06; RN-11, RN-15, RN-18, RN-25, D-01, D-11, D-28,
// S-05, S-06; ARCH §11, §12 y §18.4; Q-53, Q-54). El dueño agenda un servicio en una de
// sus horas libres, con el mismo núcleo que la reserva pública y actor `dueno`: sin
// anticipación, sin sobrecupo y sin advertencias que se puedan confirmar. La cita queda
// en la sede principal y su consultorio (Q-20). La Server Action ya llamó a
// `requireEscritura` (D-14), y el negocio sale de la sesión (ARCH §6).

type Ctx = Pick<ContextoMiembro, "negocioId" | "clerkUserId">;

/** Correo opcional (S-05): vacío o ausente = sin correo. */
const correoOpcional = z.preprocess(
  (valor) => (typeof valor === "string" && valor.trim() === "" ? null : valor),
  z.string().trim().max(254).pipe(z.email()).nullish(),
);

/** Lo que envía el formulario de PAN-04: todo llega como texto. */
export const esquemaCitaManual = z.object({
  // El cliente: elegirlo en la búsqueda solo llena estos campos (Q-53).
  nombre: z.string().trim().min(1).max(100),
  apellido: z.string().trim().min(1).max(100),
  /** Obligatorio (Q-53): la identidad se busca primero por teléfono (RN-18.1). */
  telefono: z.string().max(40),
  correo: correoOpcional,
  servicioId: z.string().min(1),
  /** Una de las horas libres de `consultarHorasDueno`, en ISO 8601 UTC (ARCH §9, regla 4). */
  inicio: z.iso.datetime(),
});

export type EntradaCitaManual = z.input<typeof esquemaCitaManual>;

/** Los campos que `DATOS_INVALIDOS` puede nombrar, en el orden del formulario (como Q-46). */
export const CAMPOS_CITA_MANUAL = ["nombre", "apellido", "telefono", "correo", "servicioId", "inicio"] as const;
export type CampoCitaManual = (typeof CAMPOS_CITA_MANUAL)[number];

/** `DATOS_INVALIDOS` con los nombres de los campos que fallaron, nunca sus valores. */
export type DatosInvalidosCitaManual = Fallo<"DATOS_INVALIDOS"> & { campos: CampoCitaManual[] };

/** La cita creada, para llevar al dueño a su detalle (F-06). */
export type CitaManualCreada = { citaId: string; codigo: string; inicio: string; fin: string };

export type ResultadoCitaManual =
  | Resultado<CitaManualCreada, "NO_ENCONTRADO" | "LIMITE_PLAN">
  | DatosInvalidosCitaManual
  | HorarioNoDisponible;

function datosInvalidos(fallaron: ReadonlySet<string>): DatosInvalidosCitaManual {
  return { ...fallo("DATOS_INVALIDOS" as const), campos: CAMPOS_CITA_MANUAL.filter((c) => fallaron.has(c)) };
}

/**
 * Crea una cita manual (ARCH §18.4):
 *
 * 1. valida con Zod el nombre, el apellido, un teléfono normalizable, el correo opcional,
 *    el servicio y el inicio (S-05; Q-53). Si algo falla, `DATOS_INVALIDOS` con los
 *    campos que fallaron, sin tocar la base;
 * 2. comprueba que el servicio esté activo en la sede principal (`NO_ENCONTRADO` si no,
 *    o si es de otro negocio; RN-05, RN-01) y exige cupo de `max_appointments_per_month`
 *    (`LIMITE_PLAN`; Q-54, RN-25);
 * 3. con el núcleo y actor `dueno` crea la cita `confirmada`, con origen `panel`, sin
 *    consentimiento, con su código de reserva (D-28) y el evento `creada` del dueño con
 *    su `clerk_user_id` (Q-55). Una hora fuera del horario, bloqueada, desalineada, sin
 *    cupo o anterior a `ahora` devuelve `HORARIO_NO_DISPONIBLE` con sus motivos y no
 *    deja ninguna fila (D-01, RN-15). El mismo teléfono en otro formato usa el cliente
 *    existente (RN-18);
 * 4. encola C-01 y C-02 solo si hay correo (S-05), y nunca C-05 (S-06).
 *
 * `azar` es para las pruebas.
 */
export async function crearCitaManual(
  ctx: Ctx,
  entrada: unknown,
  ahora: Date,
  azar: Azar = azarSeguro,
): Promise<ResultadoCitaManual> {
  // 1. La entrada.
  const leida = esquemaCitaManual.safeParse(entrada);
  const telefonoE164 = normalizarTelefono(String((entrada as { telefono?: unknown } | null)?.telefono ?? ""));
  if (!leida.success || !telefonoE164) {
    const fallaron = new Set(leida.success ? [] : leida.error.issues.map((i) => String(i.path[0])));
    if (!telefonoE164) fallaron.add("telefono");
    return datosInvalidos(fallaron);
  }
  const datos = leida.data;
  if (!esId(datos.servicioId)) return fallo("NO_ENCONTRADO");

  // 2. La oferta en la sede principal y el cupo del plan.
  const { negocio, sedeId } = await negocioDelPanel(ctx.negocioId);
  const oferta = await agenda.oferta(negocio.id, sedeId, datos.servicioId);
  if (!oferta) return fallo("NO_ENCONTRADO");
  try {
    const creadasEsteMes = await citas.contarCreadas(negocio.id, mesLocal(ahora, negocio.zonaHoraria));
    await exigirCupo(negocio.id, "max_appointments_per_month", creadasEsteMes);
  } catch (error) {
    if (error instanceof ErrorNegocio && error.codigo === "LIMITE_PLAN") return fallo("LIMITE_PLAN");
    throw error;
  }

  // 3. La cita y 4. sus avisos, en la transacción del núcleo.
  const cliente = {
    nombre: datos.nombre,
    apellido: datos.apellido,
    telefonoE164,
    correo: datos.correo ? normalizarCorreo(datos.correo) : null,
  };
  return enTransaccionConReintentos(async (tx): Promise<ResultadoCitaManual> => {
    const creada = await crearCita(
      {
        negocio,
        sedeId,
        servicioId: datos.servicioId,
        recursoId: oferta.recurso.id,
        inicio: new Date(datos.inicio),
        cliente,
        quien: { actor: "dueno", actorId: ctx.clerkUserId },
      },
      ahora,
      azar,
      tx,
    );
    if (!creada.ok) return creada;
    // Nadie las envía hasta la Fase 6 (Q-60). Sin C-05: el dueño no recibe avisos de lo que él hace (S-06).
    if (cliente.correo !== null) {
      await notificaciones.encolar(negocio.id, cliente.correo, avisosDeCitaNueva(creada.valor, ahora), tx);
    }
    const { citaId, codigo, inicio, fin } = creada.valor;
    return exito({ citaId, codigo, inicio: inicio.toISOString(), fin: fin.toISOString() });
  });
}
