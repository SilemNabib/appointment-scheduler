import "server-only";
import { instanteAVencimiento, type FechaLocal } from "@/dominio/tiempo";
import * as miembros from "@/servidor/db/repositorios/miembros";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { listarPlanes } from "@/servidor/planes/acceso";
import { esId } from "./esquemas";
import { aNegocioEnLista, type NegocioEnLista } from "./listar-negocios";

// Detalle de un negocio en el admin (ADM-01, ADM-03; ARCH §6 y §7.6): los datos de la
// suscripción, para las acciones de T2.38, y el dueño, para "Reenviar invitación" (T6.33).
// Solo se llama detrás de `requireSuperadmin`.

export type DetalleNegocioAdmin = NegocioEnLista & {
  /** Fin de la prueba y "pagado hasta", como fechas locales inclusivas (ARCH §7.6). */
  finPrueba: FechaLocal | null;
  pagadoHasta: FechaLocal | null;
  /** El correo del dueño y si ya entró al panel (`clerk_user_id`; ARCH §7.4). */
  dueno: { correo: string; vinculado: boolean } | null;
};

/** El negocio, o `null` si el id no existe (la página responde 404). */
export async function detalleNegocioAdmin(
  negocioId: string,
  ahora: Date = new Date(),
): Promise<DetalleNegocioAdmin | null> {
  if (!esId(negocioId)) return null;
  const [fila, planes, dueno] = await Promise.all([
    negocios.detalleParaAdmin(negocioId),
    listarPlanes(),
    miembros.duenoDelNegocio(negocioId),
  ]);
  if (!fila) return null;
  const local = (instante: Date | null) => (instante ? instanteAVencimiento(instante, fila.zonaHoraria) : null);
  return {
    ...aNegocioEnLista(fila, new Map(planes.map((p) => [p.id, p.codigo])), ahora),
    finPrueba: local(fila.finPrueba),
    pagadoHasta: local(fila.pagadoHasta),
    dueno,
  };
}
