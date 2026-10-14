import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";

// <ClerkProvider> va aquí y no en el layout raíz, para que la página pública
// no cargue el JavaScript de Clerk (ARCH §7.2, RNF-01).
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider localization={esES}>
      <main className="flex flex-1 items-center justify-center px-4 py-8">{children}</main>
    </ClerkProvider>
  );
}
