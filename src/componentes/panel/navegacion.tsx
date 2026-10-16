"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ANILLO_FOCO } from "@/componentes/formulario";

// Navegación del panel. En el celular se abre y se cierra con el botón "Menú"; desde
// `md` queda fija a un lado. La página actual se marca con `aria-current`, además del
// estilo (RNF-03). El panel no muestra el concepto de sede (RN-32, D-16).

type Enlace = { href: string; texto: string };

const PRINCIPALES: Enlace[] = [
  { href: "/panel", texto: "Inicio" },
  { href: "/panel/bloqueos", texto: "Bloqueos" },
];

const CONFIGURACION: Enlace[] = [
  { href: "/panel/configuracion/negocio", texto: "Negocio" },
  { href: "/panel/configuracion/servicios", texto: "Servicios" },
  { href: "/panel/configuracion/consultorio", texto: "Consultorio" },
  { href: "/panel/configuracion/horario", texto: "Horario" },
  { href: "/panel/configuracion/reglas", texto: "Reglas de reserva" },
  { href: "/panel/configuracion/recordatorios", texto: "Recordatorios" },
  { href: "/panel/configuracion/politica", texto: "Política de datos" },
];

/** Inicio solo coincide consigo mismo; las demás, también con sus subrutas. */
function esActual(href: string, ruta: string) {
  return href === "/panel" ? ruta === href : ruta === href || ruta.startsWith(`${href}/`);
}

export function Navegacion() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);

  const lista = (enlaces: Enlace[], idTitulo?: string) => (
    <ul aria-labelledby={idTitulo} className="flex flex-col gap-1">
      {enlaces.map(({ href, texto }) => {
        const actual = esActual(href, ruta);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={actual ? "page" : undefined}
              onClick={() => setAbierto(false)}
              className={`block rounded-md px-3 py-2 text-sm ${ANILLO_FOCO} ${
                actual
                  ? "bg-teal-50 font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-100"
                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {texto}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label="Panel" className="md:w-56 md:shrink-0">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls="menu-panel"
        onClick={() => setAbierto((a) => !a)}
        className={`flex w-full items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium md:hidden dark:border-zinc-700 ${ANILLO_FOCO}`}
      >
        Menú
        <span aria-hidden="true">{abierto ? "▴" : "▾"}</span>
      </button>
      <div id="menu-panel" className={`${abierto ? "flex" : "hidden"} mt-2 flex-col gap-4 md:mt-0 md:flex`}>
        {lista(PRINCIPALES)}
        <div className="flex flex-col gap-1">
          <p id="menu-configuracion" className="px-3 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            Configuración
          </p>
          {lista(CONFIGURACION, "menu-configuracion")}
        </div>
      </div>
    </nav>
  );
}
