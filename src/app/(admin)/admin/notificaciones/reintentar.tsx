"use client";

import { useState, useTransition } from "react";
import { ANILLO_FOCO } from "@/componentes/estilos";
import { reintentarNotificacionAdmin } from "./acciones";

// El botón "Reintentar" de una notificación fallida (ADM-05; Q-73). Sale en la siguiente
// corrida del cron.

export function BotonReintentar({ notificacionId }: { notificacionId: string }) {
  const [enviando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const resultado = await reintentarNotificacionAdmin(notificacionId);
            setError(
              resultado.ok
                ? null
                : resultado.error === "ESTADO_INVALIDO"
                  ? "Ya no está fallida."
                  : "No se encontró.",
            );
          })
        }
        className={`rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-900 ${ANILLO_FOCO}`}
      >
        {enviando ? "Reintentando…" : "Reintentar"}
      </button>
      {error && <span className="text-xs text-red-700 dark:text-red-400">{error}</span>}
    </span>
  );
}
