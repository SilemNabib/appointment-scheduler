import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as politicas from "@/servidor/db/repositorios/politicas";

// Política de tratamiento de datos (PAN-17; D-05, RN-17; ARCH §18.3). Publicar crea la
// versión siguiente y no toca las anteriores: la que aceptó cada cliente no cambia. La
// nueva aplica a las reservas siguientes. La Server Action ya llamó a
// `requireEscritura`.

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type { VersionPolitica } from "@/servidor/db/repositorios/politicas";

export const esquemaPolitica = z.object({
  /** Markdown; se muestra sin HTML crudo (ARCH §19.2). */
  contenido: z.string().trim().min(1).max(50_000),
});

/** Todas las versiones, de la vigente (la de mayor versión) a la más vieja. */
export async function listarPoliticas(ctx: Ctx): Promise<politicas.VersionPolitica[]> {
  return politicas.listar(ctx.negocioId);
}

export async function publicarPolitica(
  ctx: Ctx,
  entrada: unknown,
): Promise<Resultado<{ version: number }, "DATOS_INVALIDOS">> {
  const leida = esquemaPolitica.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");

  const publicada = await enTransaccion(async (tx) => {
    if (!(await negocios.bloquear(ctx.negocioId, tx))) {
      throw new Error(`No existe el negocio ${ctx.negocioId} del contexto.`);
    }
    return politicas.publicar(ctx.negocioId, leida.data.contenido, tx);
  });
  return exito({ version: publicada.version });
}
