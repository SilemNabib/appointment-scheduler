import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

// Invitación de Clerk al dueño de un negocio nuevo (ADM-02, F-11; ADR-06, ARCH §7.4).
// El registro de la instancia es Restringido: solo se entra con invitación. Al
// aceptarla, el dueño define su contraseña en /registro, y su primer ingreso lo
// vincula con su negocio por el correo (requireMiembro).

/** URL absoluta de /registro, con la base `APP_URL` de la app (ARCH §21.3). */
function urlDeRegistro(): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("Falta APP_URL (ver .env.example).");
  return new URL("/registro", base).toString();
}

/** Envía la invitación. Lanza si Clerk la rechaza; quien llama decide qué hacer (Q-08). */
export async function invitarDueno(correo: string): Promise<void> {
  const clerk = await clerkClient();
  await clerk.invitations.createInvitation({ emailAddress: correo, redirectUrl: urlDeRegistro() });
}
