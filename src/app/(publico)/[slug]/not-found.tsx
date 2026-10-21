import { Tarjeta } from "@/componentes/tarjeta";

// Un slug que no existe (ARCH §5): 404, sin decir si el negocio existió.
export default function NegocioNoEncontrado() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12">
      <Tarjeta como="section" aria-labelledby="no-encontrado" className="items-start sm:p-8">
        <h1 id="no-encontrado" className="text-[28px] leading-tight font-bold">
          No encontramos esta página
        </h1>
        <p className="m-0 text-texto-muted">
          Revisa que la dirección esté bien escrita. Si te la compartió un negocio, pídele el enlace de nuevo.
        </p>
      </Tarjeta>
    </main>
  );
}
