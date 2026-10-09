import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agenda de citas",
  description: "Reserva tu cita en línea.",
};

// Sin <ClerkProvider> aquí: solo va en los layouts de (auth), (panel) y (admin),
// para que la página pública no cargue los scripts de Clerk (ARCH §7.2).
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
