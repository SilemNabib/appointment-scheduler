import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import Link from "next/link";
import { AvisoSuscripcion } from "@/componentes/panel/aviso-suscripcion";
import { Navegacion } from "@/componentes/panel/navegacion";
import { requireMiembro } from "@/servidor/auth/sesion";
import { resumenNegocio } from "@/servidor/casos-uso/resumen-negocio";

// Panel del negocio (PAN-*). <ClerkProvider> va aquí y no en el layout raíz (ARCH §7.2).
// requireMiembro resuelve el negocio desde la sesión y, en el primer ingreso, vincula
// al dueño por su correo (ARCH §7.4). Cada página lo repite, porque un layout no se
// vuelve a renderizar al navegar. Por lo mismo, el aviso de la suscripción (PAN-19)
// se actualiza al recargar, no en cada cambio de página.
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
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:gap-8 md:py-6">
        <Navegacion />
        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <AvisoSuscripcion estado={ctx.suscripcion} zonaHoraria={negocio.zonaHoraria} />
          {children}
        </main>
      </div>
    </ClerkProvider>
  );
}
