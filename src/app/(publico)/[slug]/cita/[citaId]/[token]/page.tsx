import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, type CSSProperties } from "react";
import { Encabezado } from "@/componentes/publico/encabezado";
import { DetalleGestion } from "@/componentes/publico/gestion-cita";
import { coloresMarca } from "@/dominio/color";
import { verCitaPorLink } from "@/servidor/casos-uso/gestion-cita";

// Gestión de la cita por el link del correo, `/{slug}/cita/{citaId}/{token}` (GES-01 a
// GES-05; F-02, F-03; ARCH §4, §5 y §13; Q-70). Sin login y sin Clerk (ARCH §7.2): el
// link firmado es la credencial. Un link que no corresponde responde 404, como una cita
// inexistente (RN-13). Los encabezados de ARCH §13 (`no-referrer`, `noindex` y
// `Cache-Control` privado) los pone `next.config.ts`.

type Props = { params: Promise<{ slug: string; citaId: string; token: string }> };

/** Una lectura por solicitud: la comparten `generateMetadata` y la página. */
const leer = cache((slug: string, citaId: string, token: string) => verCitaPorLink({ slug, citaId, token }, new Date()));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, citaId, token } = await params;
  const resultado = await leer(slug, citaId, token);
  if (!resultado.ok) notFound();
  return { title: `Tu cita en ${resultado.valor.marca.nombre}`, robots: { index: false, follow: false } };
}

export default async function PaginaGestion({ params }: Props) {
  const { slug, citaId, token } = await params;
  const resultado = await leer(slug, citaId, token);
  if (!resultado.ok) notFound();
  const datos = resultado.valor;

  const colores = coloresMarca(datos.marca.colorPrimario, datos.marca.colorSecundario);
  const variables = {
    "--acento": colores.acento,
    "--sobre-acento": colores.sobreAcento,
    "--acento-texto": colores.acentoTexto,
    "--destaque": colores.destaque,
  } as CSSProperties;

  return (
    <div style={variables} className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pt-6 pb-16">
        <Encabezado marca={datos.marca} sede={datos.sede} />
        {/* Las acciones de cancelar y reprogramar llegan en T6.23. */}
        <DetalleGestion datos={datos} />
      </main>
    </div>
  );
}
