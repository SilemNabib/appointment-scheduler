// Resumen de la reserva (DESIGN §3): panel oscuro al lado del flujo, con el servicio, el
// día y la hora. Vacío, dice "Elige día y hora". Es una región con nombre para que el
// lector de pantalla la encuentre; el texto se actualiza solo, sin anunciarse.

export type FilaResumen = { etiqueta: string; valor: string | null };

export function Resumen({ filas }: { filas: readonly FilaResumen[] }) {
  return (
    <aside
      aria-labelledby="resumen-reserva"
      className="flex min-w-0 flex-[1_1_300px] flex-col gap-[18px] self-start rounded-tarjeta bg-tinta p-6 text-fondo"
    >
      <h2 id="resumen-reserva" className="m-0 text-xl font-bold">
        Tu reserva
      </h2>
      <dl className="m-0 flex flex-col gap-3.5">
        {filas.map((f) => (
          <div key={f.etiqueta} className="flex flex-col gap-0.5 border-b border-[#2e3237] pb-3.5">
            <dt className="text-xs font-bold tracking-[0.06em] text-[#a9aea6] uppercase">{f.etiqueta}</dt>
            <dd className={`m-0 text-base font-semibold ${f.valor ? "text-fondo" : "text-[#a9aea6]"}`}>{f.valor ?? "Elige día y hora"}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
