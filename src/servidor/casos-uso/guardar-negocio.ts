import "server-only";
import { z } from "zod";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import { enTransaccion } from "@/servidor/db/cliente";
import * as negocios from "@/servidor/db/repositorios/negocios";
import * as sedes from "@/servidor/db/repositorios/sedes";
import { color, textoOpcional } from "./esquemas";

// Datos del negocio y de su marca (PAN-11; RN-32, Q-20). La dirección es la de la sede
// principal, aunque el panel la muestre como del negocio; los teléfonos y correos son
// sus contactos (contactos.ts; D-29, Q-40). El logo va aparte (logo-negocio.ts). El negocio sale del contexto, nunca del cliente
// (ARCH §6); la Server Action ya llamó a `requireEscritura`.

export const esquemaNegocio = z.object({
  nombre: z.string().trim().min(1).max(120),
  colorPrimario: color,
  /** Opcional: vacío o ausente = sin color secundario. */
  colorSecundario: z.union([z.literal("").transform(() => null), color]).nullish().transform((c) => c ?? null),
  // Marca ampliada (D-27): los máximos son los CHECK de `negocio` (Q-38). Vacío o solo
  // espacios = NULL.
  rubro: textoOpcional(60),
  eslogan: textoOpcional(120),
  fraseBanner: textoOpcional(120),
  descripcion: textoOpcional(600),
  direccion: textoOpcional(200),
});

export type EntradaNegocio = z.input<typeof esquemaNegocio>;

export type DatosNegocio = {
  nombre: string;
  logoUrl: string | null;
  colorPrimario: string;
  colorSecundario: string | null;
  rubro: string | null;
  eslogan: string | null;
  fraseBanner: string | null;
  descripcion: string | null;
  direccion: string | null;
};

/** Lo que muestra el formulario de PAN-11. */
export async function leerNegocio(ctx: Pick<ContextoMiembro, "negocioId">): Promise<DatosNegocio> {
  const [marca, sede] = await Promise.all([negocios.marca(ctx.negocioId), sedes.principal(ctx.negocioId)]);
  if (!marca || !sede) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto o su sede principal.`);
  return { ...marca, direccion: sede.direccion };
}

/**
 * Guarda, en una transacción, el nombre, los colores y la marca ampliada del negocio, y
 * la dirección de su sede principal. Cualquier dato inválido devuelve
 * `DATOS_INVALIDOS` sin cambiar nada.
 */
export async function guardarNegocio(
  ctx: Pick<ContextoMiembro, "negocioId">,
  entrada: unknown,
): Promise<Resultado<void, "DATOS_INVALIDOS">> {
  const leida = esquemaNegocio.safeParse(entrada);
  if (!leida.success) return fallo("DATOS_INVALIDOS");
  const { direccion, ...marca } = leida.data;

  await enTransaccion(async (tx) => {
    const negocio = await negocios.actualizarMarca(ctx.negocioId, marca, tx);
    const sede = await sedes.actualizarDireccionPrincipal(ctx.negocioId, { direccion }, tx);
    // El contexto viene de la sesión: si falta algo, es un error del sistema, no del dueño.
    if (!negocio || !sede) throw new Error(`No existe el negocio ${ctx.negocioId} del contexto o su sede principal.`);
  });
  return exito(undefined);
}
