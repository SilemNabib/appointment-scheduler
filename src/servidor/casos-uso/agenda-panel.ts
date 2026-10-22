import "server-only";
import { z } from "zod";
import type { FranjaValida } from "@/dominio/horario";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { intervaloDeDias, sumarDias, type FechaLocal } from "@/dominio/tiempo";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as bloqueos from "@/servidor/db/repositorios/bloqueos";
import * as citas from "@/servidor/db/repositorios/citas";
import * as configuracion from "@/servidor/db/repositorios/configuracion";
import * as horarios from "@/servidor/db/repositorios/horarios";
import * as negocios from "@/servidor/db/repositorios/negocios";

// La agenda del panel (PAN-02; RN-01, RN-03, D-14, D-28; ARCH §6 y §9; Q-52, Q-58). Lee
// de una vez lo que las vistas de día, semana y mes necesitan para un rango de fechas
// locales; agrupar por día y calcular los espacios libres es de `dominio/agenda.ts`.
// Solo lee: funciona con el negocio suspendido (D-14).

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type { CitaDeAgenda } from "@/servidor/db/repositorios/citas";
export type { Bloqueo } from "@/servidor/db/repositorios/bloqueos";

/** Un mes con sus semanas completas: 6 semanas de 7 días (Q-52). */
export const MAXIMO_DIAS_AGENDA = 42;

const esquemaRango = z.object({ desde: z.iso.date(), hasta: z.iso.date() });

export type AgendaPanel = {
  zonaHoraria: string;
  desde: FechaLocal;
  hasta: FechaLocal;
  /** Todas las citas que empiezan en el rango, también las canceladas, por inicio (Q-58). */
  citas: citas.CitaDeAgenda[];
  /** Los bloqueos que se solapan con el rango, solo para leer (Q-58). */
  bloqueos: bloqueos.Bloqueo[];
  /** Las franjas de la sede principal (Q-20) y la granularidad, para los espacios libres (Q-56). */
  franjas: FranjaValida[];
  granularidadMin: 15 | 30 | 60;
};

/**
 * La agenda de un rango de fechas locales, ambas incluidas, de hasta 42 días: las citas
 * del negocio que empiezan en esos días locales (ARCH §9, regla 2), con su id, código,
 * inicio, fin, servicio, cliente (de la instantánea; RN-18.3) y estado; los bloqueos
 * que se solapan con el rango; y las franjas de la sede principal con la granularidad.
 * Un rango de más de 42 días, que termina antes de empezar o con fechas inválidas,
 * devuelve `DATOS_INVALIDOS`.
 */
export async function listarAgenda(
  ctx: Ctx,
  desde: unknown,
  hasta: unknown,
): Promise<Resultado<AgendaPanel, "DATOS_INVALIDOS">> {
  const leido = esquemaRango.safeParse({ desde, hasta });
  if (!leido.success) return fallo("DATOS_INVALIDOS");
  const rango = leido.data;
  if (rango.hasta < rango.desde || sumarDias(rango.desde, MAXIMO_DIAS_AGENDA - 1) < rango.hasta) {
    return fallo("DATOS_INVALIDOS");
  }

  const [negocio, reglas, franjas] = await Promise.all([
    negocios.resumen(ctx.negocioId),
    configuracion.leer(ctx.negocioId),
    horarios.semanaPrincipal(ctx.negocioId),
  ]);
  if (!negocio || !reglas) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto o su configuración.`);
  const instantes = intervaloDeDias(rango.desde, rango.hasta, negocio.zonaHoraria);
  const [citasDelRango, bloqueosDelRango] = await Promise.all([
    citas.delRango(ctx.negocioId, instantes),
    bloqueos.deLaPrincipalEnRango(ctx.negocioId, instantes),
  ]);

  return exito({
    zonaHoraria: negocio.zonaHoraria,
    desde: rango.desde,
    hasta: rango.hasta,
    citas: citasDelRango,
    bloqueos: bloqueosDelRango,
    franjas,
    granularidadMin: reglas.granularidadMinutos,
  });
}
