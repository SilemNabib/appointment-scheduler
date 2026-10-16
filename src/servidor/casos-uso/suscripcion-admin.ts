import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { vencimientoAInstante } from "@/dominio/tiempo";
import { enTransaccion, fijarActor } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { esId } from "./esquemas";

// Acciones del admin sobre la suscripción de un negocio (ADM-03; RN-04, RN-29, RN-30,
// RN-31; ARCH §7.6 y §18.4). Solo se llaman detrás de `requireSuperadmin`. Cada una
// corre en una transacción con `app.actor` = el admin, así los triggers la auditan con
// su autor (RN-30). Las fechas se eligen como fecha local inclusiva y se guardan como
// las 00:00 locales del día siguiente (ARCH §7.6).

type Admin = { clerkUserId: string };

export const esquemaPago = z.object({
  negocioId: z.string(),
  /** "Pagado hasta", fecha local inclusiva `YYYY-MM-DD`. */
  pagadoHasta: z.iso.date(),
});

/**
 * Registra un pago: deja el negocio `activa` con el nuevo `pagado_hasta` en una sola
 * sentencia. El efecto es inmediato, porque el estado se calcula en cada solicitud
 * (RN-31). La fecha debe superar el `pagado_hasta` actual.
 */
export async function registrarPago(
  entrada: unknown,
  admin: Admin,
): Promise<Resultado<{ pagadoHasta: Date }, "DATOS_INVALIDOS" | "NO_ENCONTRADO">> {
  const leida = esquemaPago.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { negocioId } = leida.data;
  if (!esId(negocioId)) return fallo("NO_ENCONTRADO");

  const actual = await negocios.suscripcionParaAdmin(negocioId);
  if (!actual) return fallo("NO_ENCONTRADO");

  let pagadoHasta: Date;
  try {
    pagadoHasta = vencimientoAInstante(leida.data.pagadoHasta, actual.zonaHoraria);
  } catch {
    return fallo("DATOS_INVALIDOS"); // una fecha que no existe en el calendario
  }

  // La condición "supera el actual" va en el UPDATE: dos pagos simultáneos no se pisan.
  const registrado = await enTransaccion(async (tx) => {
    await fijarActor(tx, admin.clerkUserId);
    return negocios.registrarPago(negocioId, pagadoHasta, tx);
  });
  return registrado ? exito({ pagadoHasta }) : fallo("DATOS_INVALIDOS");
}
