import { Bricolage_Grotesque, Figtree } from "next/font/google";

// Fuentes de DESIGN §2.2 (Q-44, Q-49). `next/font` las descarga al compilar y las sirve
// el propio Worker desde /_next/static/media: el navegador no pide nada a Google. Las
// dos son variables, así que no hace falta listar los pesos. Solo latín: el español no
// necesita más.

/** Títulos y cifras: Bricolage Grotesque, 700. */
export const fuenteTitulos = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--fuente-titulos",
  display: "swap",
});

/** Cuerpo: Figtree, 400 y 600. */
export const fuenteCuerpo = Figtree({
  subsets: ["latin"],
  variable: "--fuente-cuerpo",
  display: "swap",
});
