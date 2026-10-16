import "server-only";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as horarios from "@/servidor/db/repositorios/horarios";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as servicios from "@/servidor/db/repositorios/servicios";

// Estado de la configuración, para el inicio del panel (F-05, paso 3; PAN-18; Q-22).
// Solo los servicios y el horario tienen un criterio de "hecho": mientras falte alguno,
// la página pública muestra "Aún no hay horarios disponibles" (F-05, paso 4). Ambos
// se cuentan en la sede principal, sin mencionarla (RN-32).

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type EstadoConfiguracion = {
  serviciosActivos: number;
  franjas: number;
  /** Al menos un servicio activo y una franja: la página pública puede ofrecer horas. */
  completa: boolean;
  /** `{APP_URL}/{slug}`: la página pública, que llega en la Fase 4. */
  enlacePublico: string;
};

/** URL absoluta de la página pública, con la base `APP_URL` de la app (ARCH §21.3). */
function enlacePublico(slug: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  return new URL(`/${slug}`, base).toString();
}

export async function estadoConfiguracion(ctx: Ctx): Promise<EstadoConfiguracion> {
  const [serviciosActivos, franjas, negocio] = await Promise.all([
    servicios.contarOfrecidosEnLaPrincipal(ctx.negocioId),
    horarios.contarFranjasPrincipal(ctx.negocioId),
    negocios.resumen(ctx.negocioId),
  ]);
  if (!negocio) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
  return {
    serviciosActivos,
    franjas,
    completa: serviciosActivos > 0 && franjas > 0,
    enlacePublico: enlacePublico(negocio.slug),
  };
}
