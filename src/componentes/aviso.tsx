import type { ReactNode } from "react";

// Aviso de error, advertencia, éxito o información (RNF-03; Q-26). El error usa
// `role="alert"`, que el lector de pantalla anuncia de inmediato; los demás,
// `role="status"`, que espera a que termine lo que está leyendo. El texto debe decir
// de qué se trata: el color solo no basta (RNF-03).

export type TipoAviso = "error" | "advertencia" | "exito" | "info";

const ESTILOS: Record<TipoAviso, string> = {
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  advertencia: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  exito:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
};

export function Aviso({
  tipo,
  titulo,
  children,
  className,
}: {
  tipo: TipoAviso;
  titulo?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tipo === "error" ? "alert" : "status"}
      className={`flex flex-col gap-1 rounded-md border p-3 text-sm ${ESTILOS[tipo]} ${className ?? ""}`}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <div>{children}</div>}
    </div>
  );
}
