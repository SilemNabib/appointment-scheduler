import { SignOutButton } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin acceso" };

// A esta página llega un usuario con sesión válida que no es miembro de ningún negocio
// (requireMiembro, ARCH §7.5). Por ejemplo, el admin del SaaS al abrir /panel, o
// alguien que ingresó con un correo distinto al de su invitación.
export default function SinAcceso() {
  return (
    <section className="flex max-w-md flex-col items-center gap-4 text-center">
      <h1 className="text-xl font-semibold">Tu cuenta no tiene acceso a ningún negocio</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Si te invitaron a administrar un negocio, ingresa con el correo al que llegó la invitación. Si crees que se
        trata de un error, comunícate con quien te dio de alta.
      </p>
      <SignOutButton redirectUrl="/login">
        <button
          type="button"
          className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          Cerrar sesión
        </button>
      </SignOutButton>
    </section>
  );
}
