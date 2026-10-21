// Páginas públicas de cada negocio: `/{slug}` y `/{slug}/politica/{version}` (ARCH §4,
// §5; Q-49). Sin <ClerkProvider>: la página pública no carga los scripts de Clerk
// (ARCH §7.2, RNF-01), y reserva con los contratos HTTP de ARCH §18.5, no con Server
// Actions.
export default function PublicoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="flex flex-1 flex-col bg-fondo text-tinta">{children}</div>;
}
