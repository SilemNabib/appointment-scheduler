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
