import { ClerkProvider, UserButton } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import Link from "next/link";
import { requireSuperadmin } from "@/servidor/auth/sesion";

// Administración interna del SaaS (ADM-*). <ClerkProvider> va aquí y no en el layout
// raíz (ARCH §7.2). requireSuperadmin responde 404 a quien no es admin (ADR-07); cada
// página lo repite, porque un layout no se vuelve a renderizar al navegar.
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireSuperadmin();
  return (
    <ClerkProvider localization={esES}>
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link href="/admin" className="font-semibold">
          Agenda de citas · Admin
        </Link>
        <UserButton />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </ClerkProvider>
  );
}
