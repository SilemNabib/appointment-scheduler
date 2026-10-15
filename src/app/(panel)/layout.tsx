import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import Link from "next/link";
import { requireMiembro } from "@/servidor/auth/sesion";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";

// Panel del negocio (PAN-*). <ClerkProvider> va aquí y no en el layout raíz (ARCH §7.2).
// requireMiembro resuelve el negocio desde la sesión y, en el primer ingreso, vincula
// al dueño por su correo (ARCH §7.4). Cada página lo repite, porque un layout no se
// vuelve a renderizar al navegar.
export default async function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireMiembro();
  const negocio = await resumenNegocio(ctx);

  return (
    <ClerkProvider localization={esES} afterSignOutUrl="/login">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link href="/panel" className="truncate font-semibold">
          {negocio.nombre}
        </Link>
        {/* Cambiar la contraseña y cerrar sesión (PAN-01). */}
        <UserButton />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </ClerkProvider>
  );
}
