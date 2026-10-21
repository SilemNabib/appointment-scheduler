import { ANILLO_FOCO } from "@/componentes/formulario";
import { enlaceContacto, valorVisible, type Contacto } from "@/dominio/contactos";

// Tarjeta de contacto (DESIGN §3; PUB-01, PUB-07; D-29): un botón de 48 px por contacto,
// con el enlace de dominio/contactos.ts. WhatsApp va en verde y abre en otra pestaña;
// la llamada y el correo, con borde. El texto dice qué hace cada uno ("Llamar al…"), así
// que el tipo no depende del color ni del icono.

const ICONOS: Record<Contacto["tipo"], string> = {
  whatsapp: "M20 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.1-4.2A8.5 8.5 0 1 1 20 11.5z",
  telefono:
    "M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  correo: "M3 6h18v12H3zM3 7l9 6 9-6",
};

const ACCION: Record<Contacto["tipo"], string> = {
  whatsapp: "WhatsApp",
  telefono: "Llamar al",
  correo: "Escribir a",
};

export function TarjetaContacto({ contactos, className }: { contactos: readonly Contacto[]; className?: string }) {
  if (contactos.length === 0) return null;
  return (
    <ul className={`grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2 ${className ?? ""}`}>
      {contactos.map((c) => {
        const whatsapp = c.tipo === "whatsapp";
        return (
          <li key={`${c.tipo}-${c.valor}`} className="flex">
            <a
              href={enlaceContacto(c)}
              {...(whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={
                "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-boton border px-4 py-2 text-center text-sm font-bold no-underline " +
                (whatsapp ? "border-whatsapp bg-whatsapp text-white" : "border-borde-control bg-superficie text-tinta") +
                ` hover:brightness-95 ${ANILLO_FOCO}`
              }
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                <path d={ICONOS[c.tipo]} />
              </svg>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="break-words">
                  {ACCION[c.tipo]} {valorVisible(c)}
                </span>
                {c.etiqueta && <span className="text-xs font-semibold opacity-85">{c.etiqueta}</span>}
              </span>
              {whatsapp && <span className="sr-only"> (se abre en otra pestaña)</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
