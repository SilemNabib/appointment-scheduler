import { Section, Text } from "@react-email/components";
import { InstruccionesDePago, PieCuenta, type DatosCuenta } from "./cuenta-gracia";
import { Diseno, Parrafo, Titulo } from "./diseno";

// C-08, la suscripción suspendida (PRD §5.4; RN-04, RN-31, D-14, S-16; Q-66): lo que dejó
// de funcionar según D-14, que los datos se conservan, las instrucciones de pago y el
// contacto de soporte. Sale igual si la suspensión fue automática o la hizo el admin.
// Como C-07, sale a nombre del producto, sin la marca del negocio.

export type DatosSuspension = DatosCuenta;

export function asuntoSuspension(): string {
  return "Tu suscripción está suspendida";
}

/** Lo que dejó de funcionar (D-14), en el orden en que lo nota el dueño. */
export const SIN_FUNCIONAR = [
  "Tu página no recibe reservas.",
  "Tus clientes no pueden cancelar ni cambiar sus citas desde el enlace del correo: verán tu contacto.",
  "No se envían confirmaciones, recordatorios ni avisos de citas.",
  "El panel queda en solo lectura: puedes consultar tu agenda, pero no crear, mover ni cancelar citas, ni cambiar la configuración. Sí puedes corregir o suprimir los datos de un cliente.",
] as const;

export function CuentaSuspension({ producto, correoSoporte, negocio }: DatosSuspension) {
  return (
    <Diseno
      marca={{ tipo: "producto", nombre: producto }}
      vistaPrevia="Renueva tu suscripción para volver a usar todas las funciones."
      pie={<PieCuenta producto={producto} correoSoporte={correoSoporte} />}
    >
      <Titulo>Tu suscripción está suspendida</Titulo>
      <Parrafo>Desde ahora, en {negocio}:</Parrafo>
      <Section>
        {SIN_FUNCIONAR.map((linea) => (
          <Text key={linea} style={{ color: "#3a3f45", fontSize: 15, lineHeight: "22px", margin: "6px 0" }}>
            • {linea}
          </Text>
        ))}
      </Section>
      <Parrafo>
        Tus datos se conservan: citas, clientes, servicios y configuración. Al renovar, todo vuelve a funcionar en el
        momento.
      </Parrafo>
      <InstruccionesDePago />
    </Diseno>
  );
}
