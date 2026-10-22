import { ANILLO_FOCO } from "@/componentes/estilos";

// Barra de pasos de la reserva (DESIGN §3, §6): un `nav` con su `aria-label` y una lista
// ordenada; el paso actual lleva `aria-current="step"`. Los completados muestran una
// marca y dicen "completado" al lector de pantalla, y se pueden pulsar para volver a
// ellos; los futuros, no. El estado no depende solo del color.

export type Paso = { etiqueta: string };

function Marca() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function BarraPasos({
  pasos,
  actual,
  alIr,
}: {
  pasos: readonly Paso[];
  /** Índice del paso actual, desde 0. */
  actual: number;
  /** Volver a un paso completado. Sin esta función, los pasos no se pulsan. */
  alIr?: (indice: number) => void;
}) {
  return (
    <nav aria-label="Pasos de la reserva" className="-mx-[18px] -mt-[18px] overflow-x-auto border-b border-borde sm:-mx-6 sm:-mt-6">
      <ol className="grid min-w-max auto-cols-[minmax(9rem,1fr)] grid-flow-col sm:min-w-0">
        {pasos.map((paso, indice) => {
          const estado = indice < actual ? "completado" : indice === actual ? "actual" : "futuro";
          const contenido = (
            <>
              <span
                className={`grid size-[38px] shrink-0 place-items-center rounded-[10px] text-base font-bold ${
                  estado === "actual"
                    ? "bg-acento text-sobre-acento"
                    : estado === "completado"
                      ? "bg-exito-fondo text-exito-texto"
                      : "bg-fondo-suave text-texto-muted"
                }`}
              >
                {estado === "completado" ? <Marca /> : indice + 1}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-bold tracking-[0.08em] text-deshabilitado-texto uppercase">
                  Paso {indice + 1}
                </span>
                <span
                  className={`text-[15px] font-bold whitespace-nowrap ${
                    estado === "futuro" ? "text-texto-muted" : estado === "completado" ? "text-exito-texto" : "text-tinta"
                  }`}
                >
                  {paso.etiqueta}
                  {estado === "completado" && <span className="sr-only">, completado</span>}
                </span>
              </span>
            </>
          );
          const clase =
            "flex min-h-[72px] w-full items-center gap-3 border-b-[3px] px-3.5 pt-3 pb-[9px] text-left " +
            (estado === "actual" ? "border-acento bg-fondo" : "border-transparent bg-superficie");
          return (
            <li key={paso.etiqueta} className={indice < pasos.length - 1 ? "flex border-r border-borde" : "flex"}>
              {estado === "completado" && alIr ? (
                <button type="button" onClick={() => alIr(indice)} className={`${clase} cursor-pointer ${ANILLO_FOCO}`}>
                  {contenido}
                </button>
              ) : (
                <span aria-current={estado === "actual" ? "step" : undefined} className={clase}>
                  {contenido}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
