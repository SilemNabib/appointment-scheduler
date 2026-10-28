import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

// Invitación de Clerk al dueño de un negocio (ADM-02, F-05, F-11; ADR-06, ARCH §7.4).
// El registro de la instancia es Restringido: solo se entra con invitación. Al
// aceptarla, el dueño define su contraseña en /registro, y su primer ingreso lo
// vincula con su negocio por el correo (requireMiembro).

/** URL absoluta de /registro, con la base `APP_URL` de la app (ARCH §21.3). */
function urlDeRegistro(): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  return new URL("/registro", base).toString();
}

/**
 * Envía la invitación y dice si salió. Si Clerk la rechaza, registra `invitacion_fallida`
 * con el `negocioId`, sin el correo (ARCH §19.2), y devuelve `false`: quien llama lo avisa
 * (Q-08).
 *
 * Con `reenvio`, la crea aunque Clerk ya tenga otra pendiente para ese correo
 * (`ignoreExisting`; sin él, Clerk la rechaza). La anterior no se revoca (Q-73): es para el
 * mismo correo y la misma `redirectUrl`, y el primer ingreso vincula por el correo, no por
 * la invitación, así que el dueño entra con cualquiera de las dos.
 */
export async function invitarDueno(
  negocioId: string,
  correo: string,
  { reenvio = false }: { reenvio?: boolean } = {},
): Promise<boolean> {
  try {
    const clerk = await clerkClient();
    await clerk.invitations.createInvitation({
      emailAddress: correo,
      redirectUrl: urlDeRegistro(),
      ...(reenvio && { ignoreExisting: true }),
    });
    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        evento: "invitacion_fallida",
        negocioId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return false;
  }
}
