import { formatearFecha, formatearFechaLocal } from "@/dominio/formato";
import { instanteAVencimiento } from "@/dominio/tiempo";
import { Dato, Diseno, Enlace, Parrafo, Titulo } from "./diseno";

// C-07, la suscripción vencida (PRD §5.4; RN-31, D-13, S-16; ARCH §7.6; Q-66): la fecha de
// vencimiento, la fecha límite para renovar (vencimiento más 3 días), las instrucciones de
// pago y el contacto de soporte. Es un correo de la cuenta: sale a nombre del producto,
// sin la marca del negocio, y las respuestas llegan a soporte.

export type DatosCuenta = {
  /** `NOMBRE_PRODUCTO` (Q-66). */
  producto: string;
  /** `CORREO_SOPORTE` (Q-77), que es también el `reply_to`. */
  correoSoporte: string;
  negocio: string;
  zonaHoraria: string;
};

export type DatosGracia = DatosCuenta & {
  /** `datos.vence`: el instante guardado, las 00:00 locales del día siguiente al último pagado (ARCH §7.6). */
  vence: Date;
  /** `datos.suspende_en`: el vencimiento más los 3 días de gracia (D-13). */
  suspendeEn: Date;
};

/** El vencimiento como fecha local inclusiva, igual que en `/admin` (ARCH §7.6): "9 de octubre de 2026". */
export const fechaDeVencimiento = (vence: Date, zona: string) => formatearFechaLocal(instanteAVencimiento(vence, zona));

/** La fecha límite como en el aviso de gracia del panel (PAN-19): "13 de octubre de 2026". */
export const fechaLimite = (suspendeEn: Date, zona: string) => formatearFecha(suspendeEn, zona);

/** "Tu suscripción venció: renueva antes del {fecha}" (Q-65). */
export function asuntoGracia(suspendeEn: Date, zona: string): string {
  return `Tu suscripción venció: renueva antes del ${fechaLimite(suspendeEn, zona)}`;
}

/** Las instrucciones de pago: mientras no haya datos fijos, pedirlos respondiendo el correo (Q-66). */
export function InstruccionesDePago() {
  return (
    <Parrafo>
      Para renovar, responde este correo y te enviaremos los datos para pagar por transferencia o Nequi.
    </Parrafo>
  );
}

export function PieCuenta({ producto, correoSoporte }: Pick<DatosCuenta, "producto" | "correoSoporte">) {
  return (
    <Parrafo suave>
      ¿Dudas? Escríbenos a <Enlace href={`mailto:${correoSoporte}`}>{correoSoporte}</Enlace>. Equipo de {producto}.
    </Parrafo>
  );
}

export function CuentaGracia({ producto, correoSoporte, negocio, zonaHoraria, vence, suspendeEn }: DatosGracia) {
  const limite = fechaLimite(suspendeEn, zonaHoraria);
  return (
    <Diseno
      marca={{ tipo: "producto", nombre: producto }}
      vistaPrevia={`Renueva antes del ${limite} para no perder el servicio.`}
      pie={<PieCuenta producto={producto} correoSoporte={correoSoporte} />}
    >
      <Titulo>Tu suscripción venció</Titulo>
      <Parrafo>
        La suscripción de {negocio} venció. Hasta la fecha límite todo sigue funcionando: tus clientes pueden reservar y tú
        puedes usar el panel con normalidad.
      </Parrafo>
      <Dato etiqueta="Pagada hasta">{fechaDeVencimiento(vence, zonaHoraria)}</Dato>
      <Dato etiqueta="Renueva antes del">{limite}</Dato>
      <Parrafo>
        Si no renuevas antes de esa fecha, el negocio queda suspendido: la página deja de recibir reservas y el panel queda
        en solo lectura. Tus datos se conservan.
      </Parrafo>
      <InstruccionesDePago />
    </Diseno>
  );
}
