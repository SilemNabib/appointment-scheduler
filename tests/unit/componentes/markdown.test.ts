import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "@/componentes/markdown";

// Markdown de la política sin HTML crudo (ARCH §19.2; Q-45).

const html = (texto: string) => renderToStaticMarkup(createElement(Markdown, { texto }));

describe("Markdown", () => {
  test("los títulos, las listas y las negritas salen con formato", () => {
    const salida = html("# Política\n\n## Finalidad\n\n- uno\n- **dos**\n\n1. primero\n");
    expect(salida).toContain("<h1");
    expect(salida).toContain("<h2");
    expect(salida).toMatch(/<ul[^>]*>\s*<li>uno<\/li>/);
    expect(salida).toContain("<strong");
    expect(salida).toContain("<ol");
  });

  test("un <script> en el texto aparece como texto, no como etiqueta", () => {
    const salida = html('Hola <script>alert("x")</script> y <img src=x onerror=alert(1)>');
    expect(salida).not.toContain("<script");
    expect(salida).not.toContain("<img");
    expect(salida).toContain("&lt;script&gt;");
  });

  test("un enlace javascript: no conserva su destino", () => {
    const salida = html("[clic](javascript:alert(1)) y [sitio](https://example.com)");
    expect(salida).not.toContain("javascript:");
    expect(salida).toContain('href="https://example.com"');
  });
});
