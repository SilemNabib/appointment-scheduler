"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ANILLO_FOCO } from "@/componentes/estilos";

// Navegación del panel (DESIGN §4.3 y §7; Q-57). Desde 700 px queda fija a un lado; en
// el celular es una fila horizontal que se desplaza dentro de su propio contenedor, sin
// desplazar la página (RNF-01), y la página actual se lleva a la vista. La página actual
// se marca con `aria-current`, además del estilo (RNF-03). El panel no muestra el
// concepto de sede (RN-32) ni "Profesionales" (D-24). Clientes llega en la Fase 7; "Mi
// calendario" va después de "Bloqueos" (Q-72).

/** `tambien`: otras rutas que cuentan como esta página, como las citas para la agenda. */
type Enlace = { href: string; texto: string; tambien?: string[] };

const PRINCIPALES: Enlace[] = [
  { href: "/panel", texto: "Inicio" },
  { href: "/panel/agenda", texto: "Agenda", tambien: ["/panel/citas"] },
  { href: "/panel/bloqueos", texto: "Bloqueos" },
  { href: "/panel/calendario", texto: "Mi calendario" },
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

/** Inicio solo coincide consigo mismo; las demás, también con sus subrutas y las de `tambien`. */
function esActual({ href, tambien = [] }: Enlace, ruta: string) {
  if (href === "/panel") return ruta === href;
  return [href, ...tambien].some((base) => ruta === base || ruta.startsWith(`${base}/`));
}

const CLASE_ENLACE =
  "flex min-h-11 scroll-mx-4 items-center rounded-boton px-3.5 text-sm font-semibold whitespace-nowrap no-underline " +
  "text-tinta-suave hover:bg-fondo-suave aria-[current=page]:bg-tinta aria-[current=page]:text-white " +
  ANILLO_FOCO;

export function Navegacion() {
  const ruta = usePathname();
  const actual = useRef<HTMLAnchorElement>(null);

  // En el celular, la página actual puede quedar fuera de la fila: se desplaza la fila
  // hasta ella, sin mover la página en vertical.
  useEffect(() => {
    actual.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [ruta]);

  const lista = (enlaces: Enlace[], idTitulo?: string) => (
    <ul aria-labelledby={idTitulo} className="flex gap-1 min-[700px]:flex-col">
      {enlaces.map((enlace) => {
        const { href, texto } = enlace;
        const esta = esActual(enlace, ruta);
        return (
          <li key={href} className="shrink-0">
            <Link href={href} ref={esta ? actual : undefined} aria-current={esta ? "page" : undefined} className={CLASE_ENLACE}>
              {texto}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav aria-label="Panel" className="-mx-4 min-w-0 min-[700px]:mx-0 min-[700px]:w-56 min-[700px]:shrink-0">
      <div className="overflow-x-auto pb-1 min-[700px]:sticky min-[700px]:top-6 min-[700px]:overflow-visible min-[700px]:pb-0">
        {/* El relleno va en la fila y no en el contenedor: así también queda al final del desplazamiento. */}
        <div className="flex w-max items-center gap-1 px-4 min-[700px]:w-auto min-[700px]:flex-col min-[700px]:items-stretch min-[700px]:gap-5 min-[700px]:px-0">
          {lista(PRINCIPALES)}
          <div className="flex items-center gap-1 min-[700px]:flex-col min-[700px]:items-stretch min-[700px]:gap-1.5">
            <p
              id="menu-configuracion"
              className="shrink-0 border-l border-borde px-3 text-xs font-bold tracking-[0.08em] text-texto-muted uppercase min-[700px]:border-l-0"
            >
              Configuración
            </p>
            {lista(CONFIGURACION, "menu-configuracion")}
          </div>
        </div>
      </div>
    </nav>
  );
}
