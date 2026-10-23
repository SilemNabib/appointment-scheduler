import { Boton, Dato, Diseno, Parrafo, PieNegocio, Titulo, type Marca } from "@/servidor/notificaciones/plantillas/diseno";

// Una plantilla de prueba con todas las piezas de la base (T6.08).

export const URL_BOTON = "https://agenda.example.com/consultorio-ana";

export function PlantillaPrueba({ marca }: { marca: Marca }) {
  return (
    <Diseno
      marca={marca}
      vistaPrevia="Vista previa del correo"
      pie={
        <PieNegocio
          nombre="Consultorio Ana"
          contactos={[
            { tipo: "whatsapp", valor: "+573001234567", etiqueta: null },
            { tipo: "correo", valor: "contacto@ana.com", etiqueta: "Recepción" },
          ]}
        />
      }
    >
      <Titulo>Tu cita está confirmada</Titulo>
      <Parrafo>Te esperamos.</Parrafo>
      <Dato etiqueta="Código" codigo>
        OV-4821
      </Dato>
      <Boton marca={marca} href={URL_BOTON}>
        Ver mi cita
      </Boton>
    </Diseno>
  );
}
