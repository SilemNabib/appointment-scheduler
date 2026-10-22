import type { LineaHistorial } from "@/dominio/historial-cita";

// Historial de cambios de la cita (PAN-03; RN-03, RNF-02): una línea por evento, con qué
// pasó, quién lo hizo y cuándo, ya en la zona del negocio (`dominio/historial-cita.ts`).
// Es una lista ordenada: el orden es el de los eventos.

export function HistorialCita({ lineas }: { lineas: readonly LineaHistorial[] }) {
  if (lineas.length === 0) return <p className="text-sm text-texto-muted">Sin cambios registrados.</p>;
  return (
    <ol className="flex flex-col">
      {lineas.map((linea, i) => (
        <li key={i} className="flex gap-3 border-l-2 border-borde pb-4 pl-4 last:pb-0">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="font-semibold">{linea.texto}</p>
            {linea.detalle && <p className="text-sm text-tinta-suave">{linea.detalle}</p>}
            <p className="text-[13px] text-texto-muted">{linea.cuando}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
