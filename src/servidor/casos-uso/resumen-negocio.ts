import "server-only";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as negocios from "@/servidor/db/repositorios/negocios";

// Nombre, slug y zona horaria del negocio del miembro, para el encabezado y los avisos
// del panel (PAN-01, PAN-19). El negocio sale del contexto de la sesión, nunca de un
// parámetro del cliente (ARCH §6).

export async function resumenNegocio(ctx: Pick<ContextoMiembro, "negocioId">): Promise<negocios.ResumenNegocio> {
  const resumen = await negocios.resumen(ctx.negocioId);
  if (!resumen) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
  return resumen;
}

/** Lo que muestra el encabezado del panel: el resumen y el logo, para su mosaico (DESIGN §3). */
export type EncabezadoPanel = negocios.ResumenNegocio & { logoUrl: string | null };

/** El resumen del negocio con su logo, para el encabezado del panel (DESIGN §4.3; Q-57). */
export async function encabezadoPanel(ctx: Pick<ContextoMiembro, "negocioId">): Promise<EncabezadoPanel> {
  const [resumen, marca] = await Promise.all([negocios.resumen(ctx.negocioId), negocios.marca(ctx.negocioId)]);
  if (!resumen || !marca) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
  return { ...resumen, logoUrl: marca.logoUrl };
}
