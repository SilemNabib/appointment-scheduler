import "server-only";
import { estadoEfectivo, type EstadoEfectivo, type EstadoSuscripcion } from "@/dominio/suscripcion";
import { instanteAVencimiento, type FechaLocal } from "@/dominio/tiempo";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { listarPlanes } from "@/servidor/planes/acceso";

// Lista de negocios del admin (ADM-01; ARCH §6 y §7.6). Solo se llama detrás de
// `requireSuperadmin`.

export type NegocioEnLista = {
  id: string;
  slug: string;
  nombre: string;
  /** Código del plan, resuelto con `listarPlanes` (RN-25: nada fuera de planes/ lee `plan`). */
  plan: string;
  zonaHoraria: string;
  estadoSuscripcion: EstadoSuscripcion;
  /** Fin de prueba o pagado hasta, como fecha local inclusiva (ARCH §7.6). */
  vencimiento: FechaLocal | null;
  /** Estado efectivo: si está en gracia, trae `suspendeEn` (RN-31). */
  estado: EstadoEfectivo;
};

/** Una fila del admin como la muestra la lista (y el detalle, T2.37). */
export function aNegocioEnLista(
  n: negocios.FilaNegocioAdmin,
  codigoDelPlan: ReadonlyMap<string, string>,
  ahora: Date,
): NegocioEnLista {
  // Un negocio suspendido muestra el último vencimiento que tenga.
  const vence =
    n.estadoSuscripcion === "prueba"
      ? n.finPrueba
      : n.estadoSuscripcion === "activa"
        ? n.pagadoHasta
        : (n.pagadoHasta ?? n.finPrueba);
  return {
    id: n.id,
    slug: n.slug,
    nombre: n.nombre,
    plan: codigoDelPlan.get(n.planId) ?? n.planId,
    zonaHoraria: n.zonaHoraria,
    estadoSuscripcion: n.estadoSuscripcion,
    vencimiento: vence ? instanteAVencimiento(vence, n.zonaHoraria) : null,
    estado: estadoEfectivo(n, ahora),
  };
}

export async function listarNegocios(ahora: Date = new Date()): Promise<NegocioEnLista[]> {
  const [filas, planes] = await Promise.all([negocios.listarParaAdmin(), listarPlanes()]);
  const codigoDelPlan = new Map(planes.map((p) => [p.id, p.codigo]));
  return filas.map((n) => aNegocioEnLista(n, codigoDelPlan, ahora));
}
