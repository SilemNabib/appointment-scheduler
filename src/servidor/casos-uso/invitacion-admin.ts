import "server-only";
import { exito, fallo, type Resultado } from "@/dominio/resultado";
import { invitarDueno } from "@/servidor/auth/invitaciones";
import * as miembros from "@/servidor/db/repositorios/miembros";
import { esId } from "./esquemas";

// "Reenviar invitación" en el admin (ADM-02, F-05, F-11; ADR-06; ARCH §7.4 y §19.2; Q-08
// de TASKS-01, Q-73). Solo se llama detrás de `requireSuperadmin`.

export type InvitacionReenviada = {
  /** `false` si Clerk la rechazó: la pantalla lo avisa (Q-08). */
  invitacionEnviada: boolean;
};

/**
 * Vuelve a invitar al dueño del negocio mientras no se haya vinculado (`clerk_user_id` en
 * `NULL`; ARCH §7.4), aunque Clerk tenga otra invitación pendiente para su correo (Q-73).
 * Con el dueño ya vinculado devuelve `ESTADO_INVALIDO` sin llamar a Clerk, y con un negocio
 * que no existe, `NO_ENCONTRADO`. Si Clerk falla, `invitarDueno` registra
 * `invitacion_fallida` sin el correo y el resultado trae `invitacionEnviada: false`. Si sale,
 * registra `invitacion_reenviada` con el negocio y el admin.
 */
export async function reenviarInvitacion(
  entrada: { negocioId: unknown },
  admin: { clerkUserId: string },
): Promise<Resultado<InvitacionReenviada, "NO_ENCONTRADO" | "ESTADO_INVALIDO">> {
  const negocioId = entrada.negocioId;
  if (!esId(negocioId)) return fallo("NO_ENCONTRADO");
  const dueno = await miembros.duenoDelNegocio(negocioId);
  if (!dueno) return fallo("NO_ENCONTRADO");
  if (dueno.vinculado) return fallo("ESTADO_INVALIDO");

  const invitacionEnviada = await invitarDueno(negocioId, dueno.correo, { reenvio: true });
  if (invitacionEnviada) {
    console.log(JSON.stringify({ evento: "invitacion_reenviada", negocioId, admin: admin.clerkUserId }));
  }
  return exito({ invitacionEnviada });
}
