import type { ReactNode } from "react";

// Aviso de error, advertencia, éxito o información (RNF-03; DESIGN §2.1 y §3). El error
// usa `role="alert"`, que el lector de pantalla anuncia de inmediato; los demás,
// `role="status"`, que espera a que termine lo que está leyendo. El texto debe decir de
// qué se trata: el color solo no basta (RNF-03).

export type TipoAviso = "error" | "advertencia" | "exito" | "info";

const ESTILOS: Record<TipoAviso, string> = {
  error: "border-error-borde bg-error-fondo text-error-texto",
  advertencia: "border-aviso-borde bg-aviso-fondo text-aviso-texto",
  exito: "border-exito-borde bg-exito-fondo text-exito-texto",
  info: "border-borde bg-fondo-suave text-tinta-suave",
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
      className={`flex animate-entrada flex-col gap-1 rounded-boton border px-4 py-3.5 text-[15px] ${ESTILOS[tipo]} ${className ?? ""}`}
    >
      {titulo && <p className="font-semibold">{titulo}</p>}
      {children && <div>{children}</div>}
    </div>
  );
}
