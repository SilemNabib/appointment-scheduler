import ReactMarkdown, { type Components } from "react-markdown";

// Markdown sin HTML crudo (ARCH §19.2; Q-45): `react-markdown` no interpreta HTML por
// defecto, así que un `<script>` en el texto se muestra como texto. Se renderiza en el
// servidor: no agrega JavaScript a la página. Los enlaces abren en otra pestaña y solo
// se aceptan `http`, `https` y `mailto` (lo que deja pasar la función por defecto de
// react-markdown, que descarta `javascript:`).

const COMPONENTES: Components = {
  h1: ({ children }) => <h1 className="mt-2 mb-4 text-[28px] leading-tight font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-8 mb-3 text-xl leading-tight font-bold">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-6 mb-2 text-lg font-bold">{children}</h3>,
  p: ({ children }) => <p className="my-3 text-pretty">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 rounded-boton border border-aviso-borde bg-aviso-fondo px-4 py-1 text-aviso-texto">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-acento-texto underline underline-offset-[3px]">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="rounded bg-fondo-suave px-1 font-codigo text-sm">{children}</code>,
};

export function Markdown({ texto }: { texto: string }) {
  return <ReactMarkdown components={COMPONENTES}>{texto}</ReactMarkdown>;
}
