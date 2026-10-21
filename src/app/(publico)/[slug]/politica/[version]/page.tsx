import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type CSSProperties } from "react";
import { Markdown } from "@/componentes/markdown";
import { Tarjeta } from "@/componentes/tarjeta";
import { coloresMarca } from "@/dominio/color";
import { formatearFecha } from "@/dominio/formato";
import { leerPoliticaPublica } from "@/servidor/casos-uso/pagina-publica";

// Una versión de la política de tratamiento de datos (PUB-05, RN-17, D-05; Q-45). La
// casilla de PUB-05 enlaza a la versión que se cargó con la página, para que el cliente
// lea exactamente la que acepta. El Markdown se muestra sin HTML crudo (ARCH §19.2).

type Props = { params: Promise<{ slug: string; version: string }> };

const leer = cache((slug: string, version: string) => leerPoliticaPublica(slug, version));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, version } = await params;
  const politica = await leer(slug, version);
  if (!politica.ok) notFound();
  return { title: `Política de datos (versión ${politica.valor.version}) · ${politica.valor.marca.nombre}` };
}

export default async function PaginaPolitica({ params }: Props) {
  const { slug, version } = await params;
  const politica = await leer(slug, version);
  if (!politica.ok) notFound();
  const { marca, contenido, publicadaEn } = politica.valor;

  const colores = coloresMarca(marca.colorPrimario, marca.colorSecundario);
  const variables = { "--acento": colores.acento, "--acento-texto": colores.acentoTexto } as CSSProperties;

  return (
    <main style={variables} className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-6 pb-16">
      <Link
        href={`/${marca.slug}`}
        className="flex min-h-11 items-center self-start text-sm font-semibold text-acento-texto underline underline-offset-[3px]"
      >
        Volver a {marca.nombre}
      </Link>
      <Tarjeta como="article" aria-label={`Política de tratamiento de datos de ${marca.nombre}`}>
        <p className="m-0 text-xs font-bold tracking-[0.08em] text-texto-muted uppercase">
          Versión {politica.valor.version} · publicada el {formatearFecha(publicadaEn, marca.zonaHoraria)}
        </p>
        <div className="text-[15px] leading-relaxed text-tinta-suave [&_h1]:text-tinta [&_h2]:text-tinta [&_h3]:text-tinta">
          <Markdown texto={contenido} />
        </div>
      </Tarjeta>
    </main>
  );
}
