"use client";

import { useState } from "react";
import { Aviso } from "@/componentes/aviso";
import { ANILLO_FOCO, claseBoton } from "@/componentes/estilos";
import { BotonEnviar, Entrada, Seccion, Selector, useEnvio } from "@/componentes/formulario";
import { mensajeDeError } from "@/componentes/mensajes";
import { HorasDueno, useHorasDueno } from "@/componentes/panel/horas-dueno";
import { valorVisible } from "@/dominio/contactos";
import { formatearDiaLocal, formatearHora } from "@/dominio/formato";
import type { CodigoError } from "@/dominio/resultado";
import { minutosLocales, sumarDias, type FechaLocal } from "@/dominio/tiempo";
import { buscarClientesPanel, crearCitaManualPanel, horasDuenoPanel } from "./acciones";

// Formulario de la cita manual (PAN-04, F-06; D-01, D-11, S-05; Q-53, Q-56). El dueño
// busca un cliente (elegirlo solo llena los datos: el servidor resuelve la identidad, Q-53)
// o escribe uno nuevo, elige el servicio, el día y una de sus horas libres, que salen del
// mismo motor que después valida la cita (D-01). Si la hora se ocupó mientras tanto, lo
// dice, recarga las horas y conserva los datos (F-06, paso 5).

type Servicio = { id: string; nombre: string };
type DatosCliente = { nombre: string; apellido: string; telefono: string; correo: string };
type ClienteEncontrado = { id: string; nombre: string; apellido: string; telefonoE164: string | null; correo: string | null };
type Campo = keyof DatosCliente | "servicioId" | "inicio";

type Estado = { error?: string; campos?: Campo[] };

const VACIO: DatosCliente = { nombre: "", apellido: "", telefono: "", correo: "" };

const ERRORES_CAMPO: Record<Campo, string> = {
  nombre: "Escribe el nombre.",
  apellido: "Escribe el apellido.",
  telefono: "Escribe un celular válido, como 300 123 4567.",
  correo: "Revisa el correo, o déjalo vacío.",
  servicioId: "Elige un servicio.",
  inicio: "Elige una de las horas libres.",
};

const conMayuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("es-CO") + texto.slice(1);

/** La hora local `HH:mm` de un inicio ISO, para compararla con la de la URL. */
function horaLocal(inicio: string, zona: string): string {
  const minutos = Math.floor(minutosLocales(new Date(inicio), zona));
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

export function FormularioCitaManual({
  servicios,
  zonaHoraria,
  hoy,
  fechaInicial,
  horaInicial,
  soloLectura,
}: {
  servicios: readonly Servicio[];
  zonaHoraria: string;
  hoy: FechaLocal;
  fechaInicial: FechaLocal;
  /** La hora `HH:mm` del espacio libre de la agenda, si se llegó desde uno (Q-56). */
  horaInicial: string | null;
  /** Con el negocio suspendido, el formulario se ve deshabilitado (D-14). */
  soloLectura: boolean;
}) {
  const [cliente, setCliente] = useState<DatosCliente>(VACIO);
  const [servicioId, setServicioId] = useState<string>(servicios.length === 1 ? servicios[0].id : "");
  const [fecha, setFecha] = useState<FechaLocal>(fechaInicial);
  /** La hora pedida desde la agenda; se olvida al cambiar el día o el servicio. */
  const [horaPedida, setHoraPedida] = useState<string | null>(horaInicial);
  const [inicio, setInicio] = useState<string | null>(null);
  const [ocupada, setOcupada] = useState(false);
  const { estado: horas, recargar } = useHorasDueno(horasDuenoPanel, { servicioId: servicioId || null, fecha });

  // La búsqueda de clientes (Q-53).
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [encontrados, setEncontrados] = useState<ClienteEncontrado[] | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);

  const libres = horas.tipo === "listo" ? horas.inicios : [];
  const pedida = horaPedida ? (libres.find((i) => horaLocal(i, zonaHoraria) === horaPedida) ?? null) : null;
  /** La hora elegida, si sigue entre las libres; si no, la pedida desde la agenda. */
  const hora = inicio && libres.includes(inicio) ? inicio : pedida;

  const [estado, alEnviar, enviando] = useEnvio<Estado>(async (_previo, datos) => {
    setOcupada(false);
    const resultado = await crearCitaManualPanel(datos);
    // Si salió bien, la Server Action ya llevó al detalle de la cita.
    if (!resultado || resultado.ok) return {};
    if (resultado.error === "HORARIO_NO_DISPONIBLE") {
      setOcupada(true);
      setInicio(null);
      setHoraPedida(null);
      recargar();
      return {};
    }
    if (resultado.error === "DATOS_INVALIDOS" && "campos" in resultado) {
      return { error: "Revisa los datos marcados.", campos: resultado.campos as Campo[] };
    }
    return {
      error: mensajeDeError(resultado.error as CodigoError, {
        NO_ENCONTRADO: "Ese servicio ya no está disponible. Recarga la página.",
        LIMITE_PLAN: "Llegaste al límite de citas de tu plan este mes.",
      }),
    };
  }, {});

  const errorDe = (campo: Campo) => (estado.campos?.includes(campo) ? ERRORES_CAMPO[campo] : undefined);

  async function buscar() {
    if (texto.trim().length < 2) {
      setEncontrados([]);
      return;
    }
    setBuscando(true);
    try {
      const resultado = await buscarClientesPanel(texto);
      setEncontrados(Array.isArray(resultado) ? resultado : []);
    } finally {
      setBuscando(false);
    }
  }

  function elegir(c: ClienteEncontrado) {
    setCliente({
      nombre: c.nombre,
      apellido: c.apellido,
      telefono: c.telefonoE164 ? valorVisible({ tipo: "telefono", valor: c.telefonoE164 }) : "",
      correo: c.correo ?? "",
    });
    setElegido(`${c.nombre} ${c.apellido}`);
  }

  function cambiarDia(nueva: FechaLocal) {
    setFecha(nueva);
    setInicio(null);
    setHoraPedida(null);
    setOcupada(false);
  }

  const servicio = servicios.find((s) => s.id === servicioId);

  return (
    <form onSubmit={alEnviar} className="flex flex-col gap-6">
      {soloLectura && (
        <Aviso tipo="info">Con la suscripción suspendida no se pueden crear citas: el formulario está deshabilitado.</Aviso>
      )}
      {estado.error && <Aviso tipo="error">{estado.error}</Aviso>}

      <fieldset disabled={soloLectura} className="flex min-w-0 flex-col gap-6">
        <Seccion titulo="Cliente" descripcion="Busca un cliente por su celular o su nombre, o escribe los datos de uno nuevo.">
          <div role="search" aria-label="Buscar un cliente" className="flex flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Entrada
                  etiqueta="Buscar cliente"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault(); // Enter busca; no envía la cita
                      void buscar();
                    }
                  }}
                  placeholder="300 123 4567 o Ana Pérez"
                  autoComplete="off"
                  maxLength={100}
                  className="w-full"
                />
              </div>
              <button type="button" onClick={() => void buscar()} disabled={buscando} className={claseBoton("secundario")}>
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </div>
            <div aria-live="polite">
              {encontrados !== null &&
                (encontrados.length === 0 ? (
                  <p className="text-sm text-tinta-suave">No encontramos clientes con esa búsqueda.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {encontrados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => elegir(c)}
                          className={`flex min-h-12 w-full cursor-pointer flex-col items-start justify-center rounded-boton border border-borde-control bg-superficie px-4 py-2 text-left hover:bg-fondo-suave ${ANILLO_FOCO}`}
                        >
                          <span className="font-semibold">
                            {c.nombre} {c.apellido}
                          </span>
                          <span className="text-sm font-normal text-tinta-suave">
                            {[c.telefonoE164 && valorVisible({ tipo: "telefono", valor: c.telefonoE164 }), c.correo]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ))}
              {elegido && <p className="mt-2 text-sm font-semibold text-exito-texto">Se llenaron los datos de {elegido}.</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Entrada
              name="nombre"
              etiqueta="Nombre"
              autoComplete="off"
              maxLength={100}
              required
              value={cliente.nombre}
              onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))}
              error={errorDe("nombre")}
            />
            <Entrada
              name="apellido"
              etiqueta="Apellido"
              autoComplete="off"
              maxLength={100}
              required
              value={cliente.apellido}
              onChange={(e) => setCliente((c) => ({ ...c, apellido: e.target.value }))}
              error={errorDe("apellido")}
            />
            <Entrada
              name="telefono"
              etiqueta="Celular"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={40}
              required
              ayuda="Sin indicativo se asume Colombia (+57)."
              value={cliente.telefono}
              onChange={(e) => setCliente((c) => ({ ...c, telefono: e.target.value }))}
              error={errorDe("telefono")}
            />
            <Entrada
              name="correo"
              etiqueta="Correo (opcional)"
              type="email"
              autoComplete="off"
              maxLength={254}
              ayuda="Sin correo, el cliente no recibe confirmación ni recordatorio."
              value={cliente.correo}
              onChange={(e) => setCliente((c) => ({ ...c, correo: e.target.value }))}
              error={errorDe("correo")}
            />
          </div>
        </Seccion>

        <Seccion titulo="Servicio y hora" descripcion="Solo aparecen las horas libres del servicio, también las de hoy.">
          {servicios.length === 0 ? (
            <Aviso tipo="advertencia">No tienes servicios activos. Crea uno en Configuración, Servicios.</Aviso>
          ) : (
            <Selector
              name="servicioId"
              etiqueta="Servicio"
              value={servicioId}
              onChange={(e) => {
                setServicioId(e.target.value);
                setInicio(null);
                setHoraPedida(null);
                setOcupada(false);
              }}
              error={errorDe("servicioId")}
            >
              {servicios.length > 1 && <option value="">Elige un servicio</option>}
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
          )}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Día</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => cambiarDia(sumarDias(fecha, -1))}
                disabled={fecha <= hoy}
                aria-label="Día anterior"
                className={claseBoton("secundario")}
              >
                Anterior
              </button>
              <p aria-live="polite" className="min-w-0 flex-1 text-center font-semibold">
                {conMayuscula(formatearDiaLocal(fecha, true))}
              </p>
              <button type="button" onClick={() => cambiarDia(sumarDias(fecha, 1))} aria-label="Día siguiente" className={claseBoton("secundario")}>
                Siguiente
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p id="horas-titulo" className="text-sm font-semibold">
              Hora
            </p>
            {ocupada && (
              <Aviso tipo="error">Esa hora ya no está disponible. Elige otra; tus datos se conservan.</Aviso>
            )}
            {horaPedida && horas.tipo === "listo" && !pedida && (
              <Aviso tipo="advertencia">Esa hora no está libre para este servicio. Elige otra de las horas libres.</Aviso>
            )}
            <HorasDueno estado={horas} zonaHoraria={zonaHoraria} elegido={hora} alElegir={(i) => setInicio(i)} />
            {errorDe("inicio") && <p className="text-[13px] font-semibold text-error-texto">{ERRORES_CAMPO.inicio}</p>}
            <input type="hidden" name="inicio" value={hora ?? ""} />
          </div>
        </Seccion>

        <div className="flex flex-col gap-3">
          {servicio && hora && (
            <p className="text-sm text-tinta-suave">
              {servicio.nombre} · {formatearDiaLocal(fecha)} · {formatearHora(new Date(hora), zonaHoraria)}
            </p>
          )}
          <div>
            <BotonEnviar enviando={enviando} textoEnviando="Guardando…">
              Guardar
            </BotonEnviar>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
