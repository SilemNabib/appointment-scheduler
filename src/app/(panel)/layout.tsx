import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import Link from "next/link";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { MosaicoLogo } from "@/componentes/mosaico-logo";
import { AvisoSuscripcion } from "@/componentes/panel/aviso-suscripcion";
import { Navegacion } from "@/componentes/panel/navegacion";
import { requireMiembro } from "@/servidor/auth/sesion";
import { encabezadoPanel } from "@/servidor/casos-uso/resumen-negocio";

// Panel del negocio (PAN-*), con los tokens de DESIGN §2 y la estructura de §4.3 y §7
// (Q-44 de TASKS-04, Q-57): encabezado con el mosaico del logo y el nombre del negocio,
// navegación lateral fija en escritorio y horizontal con desplazamiento en móvil.
// <ClerkProvider> va aquí y no en el layout raíz (ARCH §7.2). requireMiembro resuelve
// el negocio desde la sesión y, en el primer ingreso, vincula al dueño por su correo
// (ARCH §7.4). Cada página lo repite, porque un layout no se vuelve a renderizar al
// navegar. Por lo mismo, el aviso de la suscripción (PAN-19) se actualiza al recargar,
// no en cada cambio de página.
export default async function PanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const ctx = await requireMiembro();
  const negocio = await encabezadoPanel(ctx);

  return (
    <ClerkProvider localization={esES} afterSignOutUrl="/login">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/panel" className={`flex min-w-0 items-center gap-3 rounded-control ${ANILLO_FOCO}`}>
            <MosaicoLogo nombre={negocio.nombre} logoUrl={negocio.logoUrl} tamano={42} />
            <span className="truncate font-titulos text-lg font-bold">{negocio.nombre}</span>
          </Link>
          {/* Cambiar la contraseña y cerrar sesión (PAN-01). */}
          <UserButton />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 min-[700px]:flex-row min-[700px]:gap-8 min-[700px]:py-6">
        <Navegacion />
        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <AvisoSuscripcion estado={ctx.suscripcion} zonaHoraria={negocio.zonaHoraria} />
          {children}
        </main>
      </div>
    </ClerkProvider>
  );
}
