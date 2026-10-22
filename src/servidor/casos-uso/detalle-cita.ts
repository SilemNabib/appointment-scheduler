import "server-only";
import { sePuedeCancelar, sePuedeMarcar, sePuedeMover } from "@/dominio/estados-cita";
import { historialDeCita, type LineaHistorial } from "@/dominio/historial-cita";
import { puedeMarcarAsistencia } from "@/dominio/plazos";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as citas from "@/servidor/db/repositorios/citas";
import * as negocios from "@/servidor/db/repositorios/negocios";
import { esId } from "./esquemas";

// Detalle de la cita (PAN-03, PAN-05 a PAN-07; RN-01, RN-16, RN-18, D-14, S-08; ARCH
// §6; Q-55). Solo lee: funciona con el negocio suspendido (D-14), pero entonces no
// ofrece acciones. Las acciones que devuelve solo deciden qué botones se muestran: cada
// operación vuelve a comprobar sus reglas en el servidor.

type Ctx = Pick<ContextoMiembro, "negocioId" | "suscripcion">;

/** Lo que el dueño puede hacer con la cita en este momento (PAN-05 a PAN-07). */
export type AccionesCita = { mover: boolean; cancelar: boolean; marcar: boolean };

export type DetalleCita = citas.DetalleDeCita & {
  zonaHoraria: string;
  historial: LineaHistorial[];
  acciones: AccionesCita;
};

const SIN_ACCIONES: AccionesCita = { mover: false, cancelar: false, marcar: false };

/**
 * La cita con su código, servicio, horas, estado y `version` (la que envían mover y
 * marcar; Q-55); el nombre, el teléfono y el correo con que se reservó (RN-18.3); el
 * historial (`historial-cita.ts`); y las acciones que permite ahora: mover y cancelar si
 * está `confirmada`, marcar la asistencia desde el inicio (`estados-cita.ts` y
 * `plazos.ts`; RN-16) y ninguna si está cancelada (S-08) o con el negocio suspendido
 * (D-14). Una cita de otro negocio o un id que no es un uuid devuelven `NO_ENCONTRADO`
 * (RN-01; ARCH §6, defensa 3).
 */
export async function detalleCita(ctx: Ctx, citaId: unknown, ahora: Date): Promise<Resultado<DetalleCita, "NO_ENCONTRADO">> {
  if (!esId(citaId)) return fallo("NO_ENCONTRADO");
  const [cita, eventos, negocio] = await Promise.all([
    citas.detalle(ctx.negocioId, citaId),
    citas.eventos(ctx.negocioId, citaId),
    negocios.resumen(ctx.negocioId),
  ]);
  if (!cita) return fallo("NO_ENCONTRADO");
  if (!negocio) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);

  const acciones =
    ctx.suscripcion.estado === "suspendida"
      ? SIN_ACCIONES
      : {
          mover: sePuedeMover(cita.estado),
          cancelar: sePuedeCancelar(cita.estado),
          marcar: sePuedeMarcar(cita.estado) && puedeMarcarAsistencia(cita.inicio, ahora),
        };
  return exito({
    ...cita,
    zonaHoraria: negocio.zonaHoraria,
    historial: historialDeCita(eventos, negocio.zonaHoraria),
    acciones,
  });
}
