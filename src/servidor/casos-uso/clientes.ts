import "server-only";
import { normalizarTelefono } from "@/dominio/identidad-cliente";
import type { ContextoMiembro } from "@/servidor/auth/sesion";
import * as clientes from "@/servidor/db/repositorios/clientes";

// Clientes del negocio en el panel (PAN-04, F-06; RN-01, RN-18, S-14; ARCH §12 y §18.4).
// Esta fase trae la búsqueda de la cita manual (Q-53); la lista de PAN-09, `editarCliente`
// y `suprimirCliente` llegan en la Fase 7 y la reutilizan. El negocio sale del contexto,
// nunca del cliente (ARCH §6). Solo lee: funciona con el negocio suspendido (D-14).

type Ctx = Pick<ContextoMiembro, "negocioId">;

export type { ClienteEncontrado } from "@/servidor/db/repositorios/clientes";

/** Caracteres desde los que se busca (Q-53). */
export const MINIMO_BUSQUEDA = 2;
/** Clientes que devuelve una búsqueda (Q-53). */
export const MAXIMO_RESULTADOS = 10;
/** Lo que se toma del texto: un nombre completo no pasa de aquí. */
const MAXIMO_TEXTO = 100;

/**
 * Hasta 10 clientes del negocio para elegir en la cita manual (Q-53), sin los
 * anonimizados (S-14). Si el texto se normaliza como teléfono (RN-18.1), busca ese
 * `telefono_e164` exacto: "300 123 4567" encuentra a `+573001234567`. Si no, por nombre
 * o apellido que contengan el texto, sin distinguir mayúsculas y sin quitar tildes. Un
 * texto de menos de 2 caracteres devuelve una lista vacía, sin consultar la base.
 */
export async function buscarClientes(ctx: Ctx, texto: unknown): Promise<clientes.ClienteEncontrado[]> {
  if (typeof texto !== "string") return [];
  const recortado = texto.trim().slice(0, MAXIMO_TEXTO);
  if (recortado.length < MINIMO_BUSQUEDA) return [];
  const telefonoE164 = normalizarTelefono(recortado);
  return clientes.buscar(ctx.negocioId, telefonoE164 ? { telefonoE164 } : { texto: recortado }, MAXIMO_RESULTADOS);
}
