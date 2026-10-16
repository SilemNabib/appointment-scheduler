import { Aviso } from "@/componentes/aviso";
import { formatearFecha } from "@/dominio/formato";
import type { EstadoEfectivo } from "@/dominio/suscripcion";

// Aviso del estado de la suscripción en todo el panel (PAN-19; RN-04, RN-31, D-14;
// ARCH §7.6). Al día no muestra nada. En gracia avisa hasta cuándo se puede renovar:
// `suspendeEn` (el vencimiento más los 3 días de gracia), como fecha en la zona del
// negocio. Suspendido, avisa que el panel está en solo lectura.

export function AvisoSuscripcion({ estado, zonaHoraria }: { estado: EstadoEfectivo; zonaHoraria: string }) {
  if (estado.estado === "en_gracia") {
    return (
      <Aviso tipo="advertencia">
        Tu suscripción venció. Renueva antes del {formatearFecha(estado.suspendeEn, zonaHoraria)} para no perder el
        servicio.
      </Aviso>
    );
  }
  if (estado.estado === "suspendida") {
    return (
      <Aviso tipo="error" titulo="Tu suscripción está suspendida">
        El panel está en solo lectura: puedes consultar tu información, pero no guardar cambios, y tus clientes no
        pueden reservar. Renueva tu suscripción para volver a usar todas las funciones.
      </Aviso>
    );
  }
  return null;
}
