"use client";

import { useActionState, useEffect, useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { AreaTexto, BotonEnviar, Entrada, Opcion, Seccion, useEnvio } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import { TAMANO_MAXIMO_IMAGEN } from "@/dominio/imagen";
import type { DatosNegocio } from "@/servidor/casos-uso/guardar-negocio";
import { guardarDatosNegocio, quitarLogoNegocio, subirLogoNegocio } from "./acciones";

// Formularios de PAN-11. Validan en el servidor (Q-02); los atributos de HTML solo
// ayudan a escribir bien. Con el negocio suspendido quedan deshabilitados (D-14).

type Estado = { error?: string; exito?: string };

const ERROR_LOGO = "El logo debe ser una imagen PNG, JPEG o WebP de hasta 512 KB.";

function Mensajes({ estado }: { estado: Estado }) {
  if (estado.error) return <Aviso tipo="error">{estado.error}</Aviso>;
  if (estado.exito) return <Aviso tipo="exito">{estado.exito}</Aviso>;
  return null;
}

export function FormularioLogo({ logoUrl, soloLectura }: { logoUrl: string | null; soloLectura: boolean }) {
  // Vista previa del archivo elegido, antes de subirlo.
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  useEffect(() => () => void (vistaPrevia && URL.revokeObjectURL(vistaPrevia)), [vistaPrevia]);

  const [estado, enviar] = useActionState<Estado, FormData>(async (_previo, formulario) => {
    // Al terminar, React vacía el formulario (también el archivo elegido): la vista
    // previa se va con él, y queda el logo guardado.
    setVistaPrevia(null);
    if (formulario.get("operacion") === "quitar") {
      const resultado = await quitarLogoNegocio();
      return resultado.ok ? { exito: "Quitaste el logo." } : { error: mensajeDeError(resultado.error) };
    }
    const archivo = formulario.get("logo");
    if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige una imagen para el logo." };
    // También lo valida el servidor; aquí evita enviar un archivo que se va a rechazar.
    if (archivo.size > TAMANO_MAXIMO_IMAGEN) return { error: ERROR_LOGO };
    const resultado = await subirLogoNegocio(formulario);
    if (!resultado.ok) return { error: mensajeDeError(resultado.error, { DATOS_INVALIDOS: ERROR_LOGO }) };
    return { exito: "Guardaste el logo." };
  }, {});

  const imagen = vistaPrevia ?? logoUrl;

  return (
    <Seccion titulo="Logo" descripcion="PNG, JPEG o WebP, de hasta 512 KB. Se ve mejor si es cuadrado.">
      <form action={enviar} className="flex flex-col gap-4">
        <Mensajes estado={estado} />
        <div className="flex items-center gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-control border border-borde bg-superficie">
            {imagen ? (
              // `<img>` y no `next/image`: la vista previa es un blob local, y el logo ya se
              // sirve desde /api/media con su caché (Q-21).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagen}
                alt={vistaPrevia ? "Vista previa del logo, sin guardar" : "Logo actual"}
                className="size-full object-contain"
              />
            ) : (
              <span className="text-xs text-texto-muted">Sin logo</span>
            )}
          </div>
          {vistaPrevia && <p className="text-sm text-texto-muted">Vista previa: todavía no se guarda.</p>}
        </div>
        <fieldset disabled={soloLectura} className="flex flex-col gap-4">
          <Entrada
            id="logo"
            name="logo"
            type="file"
            etiqueta="Imagen del logo"
            accept="image/png,image/jpeg,image/webp"
            onChange={(evento) => {
              const archivo = evento.target.files?.[0];
              setVistaPrevia(archivo ? URL.createObjectURL(archivo) : null);
            }}
          />
          <div className="flex flex-wrap gap-3">
            <BotonEnviar name="operacion" value="subir" textoEnviando="Subiendo…">
              Guardar logo
            </BotonEnviar>
            {logoUrl && (
              <BotonEnviar name="operacion" value="quitar" textoEnviando="Quitando…" variante="secundario">
                Quitar logo
              </BotonEnviar>
            )}
          </div>
        </fieldset>
      </form>
    </Seccion>
  );
}

export function FormularioNegocio({ datos, soloLectura }: { datos: DatosNegocio; soloLectura: boolean }) {
  // `useEnvio` y no `<form action>`: la casilla del color secundario es controlada, y el
  // reinicio automático del formulario la dejaría distinta del campo que habilita.
  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, formulario) => {
    const resultado = await guardarDatosNegocio(formulario);
    if (resultado.ok) return { exito: "Guardaste los datos del negocio." };
    return {
      error: mensajeDeError(resultado.error, {
        DATOS_INVALIDOS:
          "Revisa los datos: el nombre no puede quedar vacío, los colores deben ser válidos y cada texto debe caber en su máximo.",
      }),
    };
  }, {});

  // Sin color secundario, su campo queda deshabilitado y no se envía: se guarda vacío.
  const [conSecundario, setConSecundario] = useState(datos.colorSecundario !== null);

  return (
    <Seccion titulo="Datos del negocio">
      <form onSubmit={alEnviar} className="flex flex-col gap-4">
        <Mensajes estado={estado} />
        <fieldset disabled={soloLectura} className="flex flex-col gap-4">
          <Entrada
            id="nombre"
            name="nombre"
            etiqueta="Nombre"
            required
            maxLength={120}
            defaultValue={datos.nombre}
          />
          <Entrada
            id="rubro"
            name="rubro"
            etiqueta="Rubro"
            ayuda="Una línea corta que va junto al nombre, como “Óptica y optometría”. Opcional."
            maxLength={60}
            defaultValue={datos.rubro ?? ""}
          />
          <Entrada
            id="fraseBanner"
            name="fraseBanner"
            etiqueta="Frase principal"
            ayuda="El título grande de tu página de reservas. Si la dejas vacía, se usa el nombre."
            maxLength={120}
            defaultValue={datos.fraseBanner ?? ""}
          />
          <Entrada
            id="eslogan"
            name="eslogan"
            etiqueta="Eslogan"
            ayuda="Va debajo del título. Opcional."
            maxLength={120}
            defaultValue={datos.eslogan ?? ""}
          />
          <AreaTexto
            id="descripcion"
            name="descripcion"
            etiqueta="Descripción"
            ayuda="Cuéntales a tus clientes qué hacen y qué los distingue. Hasta 600 caracteres. Opcional."
            maxLength={600}
            rows={4}
            defaultValue={datos.descripcion ?? ""}
          />
          <div className="flex flex-wrap items-start gap-6">
            <Entrada
              id="colorPrimario"
              name="colorPrimario"
              type="color"
              etiqueta="Color principal"
              defaultValue={datos.colorPrimario}
              className="h-10 w-20 p-1"
            />
            <div className="flex flex-col gap-2">
              <Entrada
                id="colorSecundario"
                name="colorSecundario"
                type="color"
                etiqueta="Color secundario"
                disabled={!conSecundario}
                defaultValue={datos.colorSecundario ?? "#ffffff"}
                className="h-10 w-20 p-1"
              />
              <Opcion
                type="checkbox"
                etiqueta="Usar color secundario"
                checked={conSecundario}
                onChange={(evento) => setConSecundario(evento.target.checked)}
              />
            </div>
          </div>
          <Entrada
            id="direccion"
            name="direccion"
            etiqueta="Dirección"
            ayuda="La ven tus clientes al reservar. Opcional."
            maxLength={200}
            defaultValue={datos.direccion ?? ""}
          />
          <div>
            <BotonEnviar textoEnviando="Guardando…" enviando={enviando}>
              Guardar cambios
            </BotonEnviar>
          </div>
        </fieldset>
      </form>
    </Seccion>
  );
}
