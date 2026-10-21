import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type CSSProperties } from "react";
import { EstadoPagina } from "@/componentes/publico/estado-pagina";
import { coloresMarca } from "@/dominio/color";
import { leerPaginaPublica } from "@/servidor/casos-uso/pagina-publica";

// Página pública de reservas `/{slug}` (PUB-01 a PUB-08; F-01, F-05; ARCH §4, §5). El
// negocio sale del slug (ARCH §6); un slug que no existe responde 404. Los colores de
// marca van como variables CSS con sus decisiones de contraste (Q-42). Sin Clerk
// (ARCH §7.2).

type Props = { params: Promise<{ slug: string }> };

/** Una lectura por solicitud: la comparten `generateMetadata` y la página. */
const leer = cache((slug: string) => leerPaginaPublica(slug, new Date()));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pagina = await leer(slug);
  if (!pagina.ok) notFound();
  const { marca } = pagina.valor;
  return {
    title: marca.nombre,
    description: marca.eslogan ?? marca.rubro ?? `Reserva tu cita en ${marca.nombre}.`,
  };
}

export default async function PaginaNegocio({ params }: Props) {
  const { slug } = await params;
  const pagina = await leer(slug);
  if (!pagina.ok) notFound();
  const { marca, sede } = pagina.valor;

  const colores = coloresMarca(marca.colorPrimario, marca.colorSecundario);
  const variables = {
    "--acento": colores.acento,
    "--sobre-acento": colores.sobreAcento,
    "--acento-texto": colores.acentoTexto,
    "--destaque": colores.destaque,
  } as CSSProperties;

  return (
    <div style={variables} className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-6 pb-16">
        {/* El encabezado completo de PUB-01 llega en T4.18. */}
        <h1 className="text-[clamp(28px,3.4vw,42px)] leading-tight font-bold">{marca.nombre}</h1>

        {pagina.valor.estado === "abierta" ? (
          // El flujo de reserva (módulo 4.E) va aquí.
          <section aria-label="Reserva" />
        ) : (
          <EstadoPagina estado={pagina.valor.estado} nombre={marca.nombre} contactos={sede.contactos} />
        )}
      </main>
    </div>
  );
}
