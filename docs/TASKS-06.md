# Agenda de citas (SaaS) — Tareas de la Fase 6

| | |
|---|---|
| **Versión** | 0.1 (borrador) |
| **Fecha** | 2026-10-23 |
| **Fuentes** | [PRD.md](PRD.md) v0.9 · [ARCHITECTURE.md](ARCHITECTURE.md) v0.14 · [DESIGN.md](DESIGN.md) v1.0 · [TASKS-05.md](TASKS-05.md) |

> El PRD manda en el **qué** y ARCHITECTURE en el **cómo**. DESIGN.md describe cómo se ve y se comporta la interfaz; donde difiere del PRD, prevalece el PRD (DESIGN, encabezado). Si una tarea contradice a alguno de los tres, se corrige la tarea. El formato de las tareas, sus marcas y la definición de terminado están en [TASKS-00](TASKS-00.md). Lo que los documentos no definen está en [Preguntas](#preguntas): las nuevas siguen la numeración de TASKS-05 (desde Q-62), y las anteriores se citan con su documento, como "Q-60 (TASKS-05)".

## Fase 6: correos, recordatorios, links de gestión, invitaciones de calendario y enlace de suscripción del dueño

### Alcance

**Entra:**

- El envío de los correos C-01 a C-08 (PRD §5.4): el proveedor (Resend), las plantillas, el procesador de la bandeja de salida con sus reintentos y su revalidación (ARCH §14.2, §14.3) y el envío inmediato después de cada cambio (ARCH §14.4). Las filas ya las encolan las Fases 2, 3 y 5 (Q-28 de TASKS-03, Q-60 de TASKS-05).
- Las invitaciones de calendario en C-01, C-03 y C-04 (RN-35; ARCH §14.6).
- Los links de gestión firmados (ARCH §13) y la página de GES-01 a GES-05, con `reprogramarCita` y la rama del cliente de `cancelarCita` (F-02, F-03; RN-13, RN-14, RN-34), sus avisos C-03, C-04 y C-06 y sus contratos HTTP (ARCH §18.5).
- Las tres tareas del cron, en el orden de ARCH §14.4: `aplicarVencimientos` con C-07 y C-08 (RN-31, S-16), `aplicarAsistenciaPorDefecto` (D-21; F-08, paso 3) y `procesarNotificaciones` (RN-21), según Q-04 de TASKS-01.
- El enlace de calendario del dueño y la pantalla "Mi calendario" (PAN-20; ARCH §14.7; Q-57 de TASKS-05).
- El recálculo de los recordatorios pendientes al cambiar PAN-16 (Q-23 de TASKS-02).
- En `/admin`: las notificaciones fallidas o atrasadas (ADM-05), con el reintento de las fallidas (Q-73), y "Reenviar invitación" (Q-08 de TASKS-01).
- La cuenta de Resend `[manual]`, con su remitente de pruebas hasta la Fase 9 (Q-62); los secretos nuevos del Worker (ARCH §21.3); y el paso a Workers Paid antes del despliegue (Q-74).

**No entra:**

- C-09, C-10 y el resto del módulo de empleados (RN-33, D-17).
- Los límites de frecuencia `RL_GESTION` y `RL_CALENDARIO` (RN-23), que llegan con los demás en la Fase 8 (Q-35 de TASKS-03). La página de gestión ya muestra el mensaje cuando la API responde 429, como la de reservas.
- El dominio propio y su verificación en Resend con SPF, DKIM y DMARC (Fase 9; Q-06 de TASKS-01, Q-62).
- La lista de clientes, `editarCliente` y `suprimirCliente` (Fase 7), y la revocación de los links de una cita (`token_version + 1`, ARCH §13), que ninguna operación del MVP pide todavía.
- La prueba de humo E2E y la CSP del panel (Fase 8; Q-47 de TASKS-04).
- La sincronización de calendarios en doble vía (D-23) y WhatsApp.

**Criterio de salida:** T6.43, el despliegue y la verificación de la fase en el Worker.

### Convenciones de la fase

- Antes de escribir rutas, páginas o Server Actions, se lee la guía correspondiente en `node_modules/next/dist/docs/` (AGENTS.md): rutas dinámicas con varios segmentos, *route handlers*, `after`, `headers()` y `notFound`. Next 16 no es el de los datos de entrenamiento.
- Ningún caso de uso ni prueba llama a Resend: el proveedor de correo llega como parámetro, igual que el azar del código de reserva (ARCH §4), y las pruebas usan uno simulado que guarda lo que habría enviado. Solo las aceptaciones manuales envían correos reales y, hasta la Fase 9, solo a la dirección de la cuenta de Resend (Q-62).
- Las sentencias de ARCH §7.6, §14.3 y §14.4 usan `now()`; aquí reciben `ahora` como parámetro, para el reloj inyectado de ARCH §20 (Q-75).
- La gestión por link no carga Clerk ni usa Server Actions: consulta y actúa con los contratos HTTP de ARCH §18.5, para que el límite de frecuencia de la Fase 8 los cubra sin cambios, como la reserva (TASKS-04). El token viaja en el cuerpo, nunca en la URL de la API (ARCH §18.5).
- La misma función decide qué acciones ofrece la página de gestión y cuáles acepta el servidor (T6.03), igual que el motor decide qué horas se listan y cuáles se reservan (ARCH §10).
- Toda fecha y hora, también en los correos, sale en la zona del negocio con `dominio/formato.ts` (RN-03). En los `.ics`, `DTSTART` y `DTEND` van en UTC (ARCH §14.6).
- Los correos al cliente van al correo con que se reservó la cita (S-15), y solo si existe (S-05). Los avisos al dueño van al correo del miembro `dueno` (Q-28, TASKS-03). Las acciones del dueño nunca generan avisos `dueno_*` (S-06).
- Los registros (Workers Logs) llevan identificadores (`negocioId`, `citaId`, `notificacionId`, `codigo`), nunca nombres, teléfonos, correos ni tokens (ARCH §19.2).
- La fase no tiene migraciones: el modelo ya tiene `notificacion` y `enlace_calendario` (ARCH §18.2).
- El panel y la página de gestión nunca muestran la palabra "sede" (RN-32). Las pantallas nuevas usan los tokens y los componentes de DESIGN, con aceptación manual a 360 px de ancho (RNF-01), como en las fases anteriores.
- La fase se despliega en Workers Paid, que se contrata antes del despliegue (T6.42; Q-74). Cada despliegue anota el tamaño del Worker y el CPU medido.
- Las rutas y los archivos nuevos que ARCH §4 no ubica están en Q-76.

### 6.A Firmas y dominio

Funciones puras o sin estado, con su prueba unitaria en la misma tarea.

* [x] T6.01: Firma de los links de gestión
   * Objetivo: Crear `servidor/firmas.ts`, con la firma HMAC-SHA256 en base64url y su verificación con `crypto.subtle.verify` (tiempo constante), y `servidor/gestion-cita/firma.ts`, que firma `"{citaId}.{token_version}"` con `GESTION_CITA_SECRET`, acepta también `GESTION_CITA_SECRET_ANTERIOR` durante una rotación y arma la URL `{APP_URL}/{slug}/cita/{citaId}/{token}` (ARCH §13). El token no se guarda (ADR-09).
   * Archivos: `src/servidor/firmas.ts`, `src/servidor/gestion-cita/firma.ts`, `tests/unit/servidor/gestion-cita/firma.test.ts`
   * Depende de: T5.32
   * Refs: RN-13, RNF-04, ADR-09, ARCH §13, §19.2, §21.3; Q-76
   * Aceptación:
      * El token de una cita se verifica con su `token_version`; con otra versión, con otro `citaId` o con un carácter cambiado, no (ARCH §13).
      * Un token firmado con el secreto anterior se acepta mientras exista `GESTION_CITA_SECRET_ANTERIOR`, y deja de aceptarse cuando se quita. Sin `GESTION_CITA_SECRET`, firmar lanza un error.
      * El token tiene 43 caracteres base64url (256 bits), sin `=`, `+` ni `/`.

* [x] T6.02: Firma del enlace de calendario
   * Objetivo: Crear `servidor/calendario/firma.ts`, que firma `"cal." + enlaceId` con `CALENDARIO_SECRET` usando `servidor/firmas.ts`, y arma las dos URL del enlace: `https://…/api/calendario/{enlaceId}/{token}`, para "Desde URL" en Google, y `webcal://…`, para Outlook y Apple (ARCH §14.7).
   * Archivos: `src/servidor/calendario/firma.ts`, `tests/unit/servidor/calendario/firma.test.ts`
   * Depende de: T6.01
   * Refs: RN-35, ADR-17, ARCH §14.7, §19.2; Q-76
   * Aceptación:
      * El token de un enlace se verifica con su id y no con otro. Un token de gestión no sirve como token de calendario, aunque se firme el mismo id: los secretos y los prefijos son distintos.
      * La URL `webcal://` es la `https://` con otro esquema.

* [ ] T6.03: Dominio: plazos y acciones del cliente
   * Objetivo: Completar `dominio/plazos.ts` con los plazos del cliente: RN-13 (`ahora ≤ inicio − plazo`, con el borde incluido) y RN-34 (límite `null` = sin límite; 0 = no se permite). Agregar `accionesDelCliente`, que recibe el estado de la cita, su inicio, sus reprogramaciones, las reglas del negocio y el estado efectivo de la suscripción, y decide si se puede cancelar y reprogramar y, si no, por qué (Q-69). La usan la página de gestión y los casos de uso, para que lo que no se ofrece tampoco se pueda hacer.
   * Archivos: `src/dominio/plazos.ts`, `tests/unit/dominio/plazos.test.ts`
   * Depende de: T5.32
   * Refs: GES-02 a GES-05, F-02, F-03, RN-04, RN-13, RN-34, D-14, D-20, ARCH §20 (`dominio/plazos`); Q-69
   * Aceptación:
      * Con un plazo de 24 horas, en `inicio − 24 h` se puede cancelar y reprogramar, y en `inicio − 24 h + 1 ms`, no (RN-13; ARCH §20: "en el instante exacto del borde").
      * Con el límite en 3, después de 3 reprogramaciones solo se puede cancelar; con 0, nunca se reprograma; con `null`, no hay límite (RN-34; ARCH §20).
      * Una cita cancelada, ya empezada, `completada` o `no_asistio` no admite acciones, y con el negocio suspendido tampoco, cada una con su motivo (F-02, pasos 6 y 7; D-14). El resultado no cambia si la suite corre con otra `TZ` (RN-03).

* [ ] T6.04: Dominio: iCalendar
   * Objetivo: Crear `dominio/icalendar.ts`, que arma un `VCALENDAR` (RFC 5545) con uno o varios `VEVENT`: con `METHOD:REQUEST` o `METHOD:CANCEL` para las invitaciones, y sin `METHOD` para el enlace del dueño (ARCH §14.6, §14.7). Cada evento lleva `UID`, `SEQUENCE`, `DTSTAMP`, `DTSTART` y `DTEND` en UTC, `STATUS`, `SUMMARY`, `LOCATION`, `DESCRIPTION` y `ORGANIZER`, según Q-71. Escapa `\`, `;`, `,` y los saltos de línea, pliega las líneas a 75 octetos y usa CRLF.
   * Archivos: `src/dominio/icalendar.ts`, `tests/unit/dominio/icalendar.test.ts`, `tests/unit/dominio/fixtures/invitacion.ics`
   * Depende de: T5.32
   * Refs: RN-03, RN-35, D-23, ADR-17, ARCH §14.6, §14.7, §20 (Calendario); Q-71
   * Aceptación:
      * La invitación de una cita a las 7:00 p. m. del 14 de octubre en Bogotá coincide con el `.ics` de referencia: `DTSTART:20261015T000000Z`, el `UID` de Q-71 y `SEQUENCE` igual a la versión de la cita (ARCH §20: "comparación con un `.ics` de referencia").
      * La cancelación lleva `METHOD:CANCEL`, `STATUS:CANCELLED`, el mismo `UID` y `SEQUENCE` igual a la versión más 1 (ARCH §14.6).
      * Un servicio con tildes, comas y punto y coma, y una descripción de más de 75 octetos, quedan escapados y plegados sin partir ningún carácter UTF-8.

* [ ] T6.05: Dominio: revalidación de un envío
   * Objetivo: Crear `dominio/envios.ts` con la decisión de ARCH §14.3 (paso 1) y de Q-67 como función pura: dados el tipo de la notificación, sus `datos`, el estado y la versión actuales de la cita y el estado efectivo de la suscripción, decide si se envía o se anula, y con qué `ultimo_error`. Distingue los correos de citas (C-01 a C-06) de los de la cuenta (C-07 y C-08), que no cuentan para `max_emails_per_month` (ARCH §14.1).
   * Archivos: `src/dominio/envios.ts`, `tests/unit/dominio/envios.test.ts`
   * Depende de: T5.32
   * Refs: RN-04, RN-20, RN-21, D-14, S-16, ARCH §14.1, §14.3; Q-67, Q-76
   * Aceptación (una prueba por tabla):
      * Con el negocio suspendido, todo correo de citas se anula con `NEGOCIO_SUSPENDIDO`, y C-08 se envía (D-14, S-16).
      * Un recordatorio se anula si la cita ya no está `confirmada` o si su versión no es la de `datos` (ARCH §14.3). Un C-07 se anula si el negocio ya no está en gracia, y un C-08, si ya no está suspendido.
      * Un C-01 de una cita cancelada y un C-04 de una versión anterior se anulan (Q-67); C-03, C-05 y C-06 se envían mientras el negocio no esté suspendido.

### 6.B Correo: proveedor y plantillas

Las plantillas solo presentan: reciben los datos ya leídos y no consultan la base.

* [ ] T6.06: [manual] Cuenta de Resend
   * Objetivo: Crear la cuenta de Resend con el correo del desarrollador y una API key con permiso de envío, y guardar la clave en `.env.local` y `.dev.vars`. Hasta la Fase 9 se envía con el remitente de pruebas de Resend, sin verificar ningún dominio (Q-62).
   * Archivos: `.env.local`, `.dev.vars` (no versionados)
   * Depende de: —
   * Refs: ARCH §2, §3, §14.3, §21.1, §21.3; Q-62
   * Aceptación:
      * El panel de Resend muestra la cuenta y la API key, y `RESEND_API_KEY` está en `.env.local` y en `.dev.vars`.
      * Un `curl` a `https://api.resend.com/emails` con esa clave y el remitente de pruebas entrega un correo a la dirección de la cuenta, y uno dirigido a otra dirección se rechaza (Q-62).

* [ ] T6.07: Proveedor de correo
   * Objetivo: Crear `servidor/notificaciones/proveedor.ts` con el tipo `ProveedorCorreo` (remitente, destinatario, `reply_to`, asunto, HTML, texto, adjuntos y clave de idempotencia) y su implementación con la API REST de Resend por `fetch`, con el encabezado `Idempotency-Key` (Q-64). Devuelve el id del mensaje o un error, sin el cuerpo ni el destinatario. Declarar en los `vars` de `wrangler.jsonc` `CORREO_REMITENTE` y `CORREO_CUENTA`, con el remitente de pruebas de Resend (Q-62); `CORREO_SOPORTE`; y `NOMBRE_PRODUCTO`, con "Agenda de citas" (Q-66).
   * Archivos: `src/servidor/notificaciones/proveedor.ts`, `tests/unit/servidor/notificaciones/proveedor.test.ts`, `wrangler.jsonc`, `cloudflare-env.d.ts`, `.env.example`
   * Depende de: T6.06
   * Refs: RN-20, ARCH §14.3 (pasos 4 y 5), §19.2, §21.3; Q-62, Q-64, Q-66
   * Aceptación (con `fetch` simulado):
      * La solicitud lleva `Authorization: Bearer …`, `Idempotency-Key` igual a la clave de la notificación y el adjunto `.ics` en base64 con su tipo (ARCH §14.3, paso 4).
      * Una respuesta 200 devuelve el id del mensaje; un 4xx, un 5xx o una falla de red devuelven un error. Ningún error ni registro incluye el destinatario (ARCH §19.2).

* [ ] T6.08: Base de las plantillas
   * Objetivo: Instalar React Email con versión exacta (Q-64) y crear lo común a todos los correos: el encabezado con el nombre y el logo del negocio (o el nombre del producto en C-07 y C-08), el botón principal con el acento y el color de texto de `dominio/color.ts` (Q-42 de TASKS-04), el pie con los contactos del negocio y la función que produce el HTML y el texto plano de cada plantilla. Crear `remitente.ts`, que arma el remitente y elige el `reply_to` (ARCH §14.3; Q-63).
   * Archivos: `src/servidor/notificaciones/plantillas/diseno.tsx`, `src/servidor/notificaciones/plantillas/render.ts`, `src/servidor/notificaciones/remitente.ts`, `tests/unit/servidor/notificaciones/plantillas.test.ts`, `package.json`
   * Depende de: T6.07
   * Refs: RNF-02, RNF-03, D-29, ARCH §3, §14.3, §21.4; Q-11 (TASKS-01), Q-42 (TASKS-04), Q-63, Q-64, Q-66
   * Aceptación:
      * Una plantilla de prueba produce HTML con `lang="es"` y su texto plano. Con el acento `#f5d90a`, el texto del botón es `tinta` (RNF-03).
      * El remitente de los correos de citas es `"{nombre del negocio}" <CORREO_REMITENTE>`, con el nombre escapado, y el de la cuenta, `"{NOMBRE_PRODUCTO}" <CORREO_CUENTA>` con `reply_to` igual a `CORREO_SOPORTE`. El `reply_to` de los correos de citas sigue el orden de Q-63 (ARCH §14.3).
      * `opennextjs-cloudflare build` y `wrangler deploy --dry-run` informan el tamaño del Worker con React Email, y queda anotado en el commit (ARCH §21.4; Q-64).

* [ ] T6.09: Plantillas C-01 y C-02
   * Objetivo: Crear la confirmación (C-01) y el recordatorio (C-02) con el contenido mínimo de PRD §5.4 y Q-65: el negocio, el servicio, la fecha y la hora locales, la dirección con "Cómo llegar" (D-30), el código de reserva (D-28; Q-37 de TASKS-04), el link de gestión y el enlace a la política. Sin empleado: en el MVP todo servicio se atiende por capacidad (D-17).
   * Archivos: `src/servidor/notificaciones/plantillas/confirmacion.tsx`, `src/servidor/notificaciones/plantillas/recordatorio.tsx`, `tests/unit/servidor/notificaciones/plantillas-cliente.test.ts`
   * Depende de: T6.08
   * Refs: C-01, C-02, RN-03, RN-13, RN-17, RN-24, RNF-02, D-28, D-30, ARCH §13, §14.1; Q-37 (TASKS-04), Q-65
   * Aceptación:
      * Una cita a las 7:00 p. m. del 14 de octubre en Bogotá (`2026-10-15T00:00:00Z`) se lee como el 14 de octubre a las 7:00 p. m. en el HTML y en el texto, aunque la suite corra con otra `TZ` (RN-03, RNF-02).
      * El correo lleva el código, el link de gestión y la política de Q-65, y no lleva el teléfono ni el correo del cliente (RN-24).

* [ ] T6.10: Plantillas C-03 y C-04
   * Objetivo: Crear la cancelación (C-03), con el servicio, la fecha cancelada y el enlace para reservar de nuevo, y la reprogramación (C-04), con la hora anterior de `datos` (Q-60 de TASKS-05), la hora nueva y el link de gestión (PRD §5.4).
   * Archivos: `src/servidor/notificaciones/plantillas/cancelacion.tsx`, `src/servidor/notificaciones/plantillas/reprogramacion.tsx`, `tests/unit/servidor/notificaciones/plantillas-cliente.test.ts`
   * Depende de: T6.09
   * Refs: C-03, C-04, RN-03, RN-14, ARCH §14.1; Q-60 (TASKS-05), Q-65
   * Aceptación:
      * C-04 muestra la hora anterior y la nueva, cada una en hora de Colombia, también cuando caen en días distintos (RN-03).
      * C-03 enlaza a `{APP_URL}/{slug}` y no lleva link de gestión.

* [ ] T6.11: Plantillas C-05 y C-06
   * Objetivo: Crear los avisos al dueño: la cita nueva (C-05), con el cliente, su contacto, el servicio, la fecha y el enlace al detalle en el panel, y el cambio de cita (C-06), con lo que cambió según sus `datos` (Q-68) y el mismo enlace. No llevan invitación de calendario (RN-35).
   * Archivos: `src/servidor/notificaciones/plantillas/dueno-cita-nueva.tsx`, `src/servidor/notificaciones/plantillas/dueno-cambio.tsx`, `tests/unit/servidor/notificaciones/plantillas-dueno.test.ts`
   * Depende de: T6.08
   * Refs: C-05, C-06, RN-22, RN-35, ARCH §14.1; Q-65, Q-68
   * Aceptación:
      * C-05 lleva el código de la cita y enlaza a `{APP_URL}/panel/citas/{citaId}`.
      * El C-06 de una reprogramación muestra la hora anterior y la nueva; el de una cancelación dice que el cliente la canceló (Q-68).

* [ ] T6.12: Plantillas C-07 y C-08
   * Objetivo: Crear los correos de la cuenta (S-16): la suscripción vencida (C-07), con la fecha de vencimiento, la fecha límite para renovar (vencimiento más 3 días), las instrucciones de pago de Q-66 y el contacto de soporte; y la suspensión (C-08), con lo que dejó de funcionar (D-14), que los datos se conservan, las instrucciones de pago y el soporte.
   * Archivos: `src/servidor/notificaciones/plantillas/cuenta-gracia.tsx`, `src/servidor/notificaciones/plantillas/cuenta-suspension.tsx`, `tests/unit/servidor/notificaciones/plantillas-cuenta.test.ts`
   * Depende de: T6.08
   * Refs: C-07, C-08, RN-31, D-13, D-14, S-16, ARCH §7.6, §14.3; Q-66
   * Aceptación:
      * C-07 muestra el vencimiento como fecha local inclusiva, igual que `/admin` (ARCH §7.6), y la fecha límite igual que el aviso de gracia del panel (PAN-19).
      * C-08 enumera lo que dejó de funcionar según D-14 y dice que los datos se conservan. Ninguno de los dos lleva la marca de un negocio: salen a nombre del producto (S-16).

### 6.C Procesador de la bandeja de salida

* [ ] T6.13: Repositorio: reclamar y marcar
   * Objetivo: Ampliar `repositorios/notificaciones.ts` con lo que necesita el procesador (ARCH §14.3): reclamar un lote de hasta 25 con `FOR UPDATE SKIP LOCKED` (las pendientes vencidas y los arriendos vencidos; con `citaId`, solo las de esa cita); marcar `enviada` con `proveedor_mensaje_id` y `enviada_en`; devolver a `pendiente` con una espera de `2^intentos` minutos; marcar `fallida` en el 5.º intento; anular con su `ultimo_error`; y contar las enviadas del mes local para `max_emails_per_month`, sin las de la cuenta (ARCH §16.3).
   * Archivos: `src/servidor/db/repositorios/notificaciones.ts`, `tests/integracion/repositorios/notificaciones.test.ts`
   * Depende de: T5.32
   * Refs: RN-20, RN-21, ARCH §6, §9 (regla 5), §14.2, §14.3, §16.3; Q-75
   * Aceptación:
      * Dos reclamos simultáneos sobre las mismas filas no devuelven ninguna fila dos veces (RN-20; ARCH §14.3). Una fila `enviando` con el arriendo vencido se vuelve a reclamar, y una con el arriendo vigente, no (ARCH §14.2).
      * Una notificación que falla por 5.ª vez queda `fallida`; antes, vuelve a `pendiente` con `programada_para = ahora + 2^intentos minutos` (ARCH §14.3, paso 5).
      * El conteo usa el mes calendario local del negocio y no cuenta C-07, C-08 ni las notificaciones de otros negocios (ARCH §9, §16.3).

* [ ] T6.14: Mensaje de cada notificación
   * Objetivo: Crear `servidor/notificaciones/mensajes.ts`, que, para una notificación reclamada, lee los datos actuales que necesita su plantilla (la instantánea, el código, la versión y el `token_version` de la cita; la marca, el slug y la zona del negocio; la dirección y los contactos de la sede de la cita) y arma el mensaje: la plantilla, el asunto (Q-65), el remitente y el `reply_to` (T6.08), el link de gestión (T6.01) y, en C-01, C-03 y C-04, el adjunto `invitacion.ics` de T6.04 (ARCH §14.6). C-02 no lo lleva.
   * Archivos: `src/servidor/notificaciones/mensajes.ts`, `src/servidor/db/repositorios/notificaciones.ts`, `tests/integracion/notificaciones/mensajes.test.ts`
   * Depende de: T6.01, T6.04, T6.09–T6.13
   * Refs: C-01 a C-08, RN-03, RN-35, S-15, ARCH §6, §13, §14.3 (paso 3), §14.6; Q-63, Q-65, Q-71
   * Aceptación:
      * El C-01 de una cita lleva el link de gestión con su `token_version` actual y una invitación `REQUEST` con `SEQUENCE` igual a su versión; el C-03, una `CANCEL` con la versión más 1; y el C-02, ninguna (ARCH §14.6).
      * Una cita movida antes de que salga su C-01 sale con su hora actual (ARCH §14.3, paso 3: "con los datos actuales").
      * Las lecturas filtran por el `negocio_id` de la notificación (ARCH §6).

* [ ] T6.15: Caso de uso `procesarNotificaciones`
   * Objetivo: Implementar `procesarNotificaciones({ citaId? }, ahora, proveedor)` (ARCH §14.3): reclama un lote (T6.13); por cada notificación, la revalida (T6.05), comprueba `max_emails_per_month` con la función de acceso en los correos de citas (`fallida` con `LIMITE_PLAN`; RN-25), arma el mensaje (T6.14), lo envía con su clave de idempotencia (T6.07) y lo marca. Sigue con más lotes mientras haya vencidas, hasta el tope de Q-75, y registra cada resultado sin datos personales.
   * Archivos: `src/servidor/notificaciones/procesar.ts`, `tests/integracion/notificaciones/procesar.test.ts`
   * Depende de: T6.05, T6.14
   * Refs: RN-04, RN-20, RN-21, RN-25, D-14, ARCH §14.2, §14.3, §16.3, §19.2; Q-67, Q-75
   * Aceptación (con el proveedor simulado):
      * Una reserva nueva deja C-01 y C-05 `enviada`, con el id del proveedor, y su recordatorio sigue `pendiente` hasta su hora (ARCH §14.1).
      * Si el proveedor falla, la notificación vuelve a `pendiente` con su espera, y el reintento envía la misma clave de idempotencia (ARCH §14.3, pasos 4 y 5).
      * Con `max_emails_per_month` alcanzado por una excepción, un C-01 queda `fallida` con `LIMITE_PLAN` y un C-08 sale igual (ARCH §14.1, §16.3).

* [ ] T6.16: Envío inmediato después de un cambio
   * Objetivo: Crear `servidor/notificaciones/despacho.ts`, que después del `COMMIT` pide procesar las notificaciones de una cita sin que la respuesta espere al correo, con `after()` de Next o con `getCloudflareContext().ctx.waitUntil` (ARCH §14.4; se elige según la guía de Next y lo que OpenNext soporte en Workers), y llamarlo desde la ruta de reservas y las Server Actions de la cita manual, mover y cancelar. Si el envío inmediato falla, la notificación sigue pendiente y la recoge el cron (ARCH §14.4).
   * Archivos: `src/servidor/notificaciones/despacho.ts`, `src/app/api/publico/[slug]/reservas/route.ts`, `src/app/(panel)/panel/citas/nueva/acciones.ts`, `src/app/(panel)/panel/citas/[id]/acciones.ts`, `tests/unit/servidor/notificaciones/despacho.test.ts`
   * Depende de: T6.15
   * Refs: C-01, C-03, C-04, C-05, RN-20, ADR-08, ARCH §11.1, §14.4
   * Aceptación:
      * Con `npm run preview`, una reserva responde sin esperar al proveedor y su C-01 queda `enviada` en segundos (ARCH §14.4).
      * Una operación que falla, como `HORARIO_NO_DISPONIBLE`, no despacha nada, y un error del despacho no cambia la respuesta de la operación (prueba unitaria).

### 6.D Gestión de la cita por link (GES-01 a GES-05)

* [ ] T6.17: Caso de uso `verCitaPorLink`
   * Objetivo: Implementar `verCitaPorLink({ slug, citaId, token }, ahora)` (Q-69): verifica el token (T6.01) con el `token_version` de la cita y que el slug sea el de su negocio, y devuelve lo que muestra GES-01: el código, el servicio, la fecha y la hora, la dirección, el estado, las acciones de T6.03 con su motivo, las reprogramaciones que le quedan y los contactos de la sede (D-29). Solo lee, así que funciona con el negocio suspendido (GES-05).
   * Archivos: `src/servidor/casos-uso/gestion-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/gestion-cita.test.ts`
   * Depende de: T6.01, T6.03
   * Refs: GES-01, GES-04, GES-05, RN-01, RN-13, RN-24, RN-34, D-14, D-29, ARCH §6, §13; Q-69
   * Aceptación:
      * Un token alterado, un `citaId` que no es un uuid y el link de una cita de A con el slug de B devuelven `NO_ENCONTRADO`, igual que una cita inexistente (RN-13; ARCH §6, defensa 3).
      * Con el negocio suspendido, devuelve la cita y los contactos, sin acciones (GES-05, D-14).
      * No devuelve los datos de contacto del cliente (RN-24).

* [ ] T6.18: Cancelar desde el link
   * Objetivo: Agregar a `cancelarCita` la rama del cliente (ARCH §18.4): con el token verificado y el negocio no suspendido, aplica T6.03 a la cita leída en la transacción, la cancela con `WHERE estado = 'confirmada'` y `cancelada_por = 'cliente'`, anula su recordatorio, registra el evento `cancelada` del cliente y encola C-03 y C-06 (`dueno_cambio:{citaId}:{eventoId}`, con los `datos` de Q-68). `registrarEvento` pasa a devolver el id del evento.
   * Archivos: `src/servidor/casos-uso/cancelar-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `src/servidor/db/repositorios/notificaciones.ts`, `tests/integracion/casos-uso/cancelar-cita.test.ts`
   * Depende de: T6.17
   * Refs: GES-02, F-02, C-03, C-06, RN-04, RN-10, RN-13, RN-22, D-14, S-08, ARCH §14.1, §18.4; Q-68, Q-69
   * Aceptación:
      * Dentro del plazo, la cita queda `cancelada` por el cliente, su cupo se libera y quedan encolados C-03 y un solo C-06 (RN-10, RN-22).
      * Fuera del plazo devuelve `FUERA_DE_PLAZO`; con el negocio suspendido, `NEGOCIO_SUSPENDIDO`; y cancelada otra vez, `ESTADO_INVALIDO`. En los tres casos no cambia nada (RN-13, D-14, S-08).
      * Pasan sin cambios las pruebas de la rama del dueño (T5.09).

* [ ] T6.19: Caso de uso `reprogramarCita`
   * Objetivo: Implementar `reprogramarCita({ slug, citaId, token, inicio }, ahora)` (ARCH §18.4) con el cambio de hora del núcleo (`cambiarHora`, T5.08) y actor `cliente`, con el negocio no suspendido: después del bloqueo, aplica T6.03 a la cita releída (plazo de RN-13 y límite de RN-34), evalúa la nueva hora con la anticipación del cliente y sin contar la propia cita, y suma 1 a `reprogramaciones_cliente` en la misma transacción (ARCH §18.3). Encola C-04 (`reprogramacion:{citaId}:v{version}`), C-06 y el recordatorio de la versión nueva.
   * Archivos: `src/servidor/casos-uso/reprogramar-cita.ts`, `src/servidor/casos-uso/agendar.ts`, `tests/integracion/casos-uso/reprogramar-cita.test.ts`
   * Depende de: T6.18
   * Refs: GES-03, F-03, C-04, C-06, RN-09, RN-11, RN-13, RN-14, RN-22, RN-34, D-14, D-20, S-07, ARCH §11.2, §11.3, §14.1, §18.3, §18.4; Q-68, Q-69
   * Aceptación:
      * Después de reprogramar, la cita conserva su id, su código y su servicio, y `version` y `reprogramaciones_cliente` suben en 1 (RN-14, RN-34).
      * Con el límite alcanzado devuelve `LIMITE_REPROGRAMACIONES`; fuera del plazo, `FUERA_DE_PLAZO`; y con una hora dentro de la anticipación mínima, `HORARIO_NO_DISPONIBLE`. En todos, no cambia nada (RN-09, RN-13, RN-34).
      * Pasan sin cambios las pruebas de `moverCita` (T5.08, T5.27–T5.29).

* [ ] T6.20: Horas libres para reprogramar
   * Objetivo: Implementar `consultarDisponibilidadGestion({ slug, citaId, token, desde, hasta }, ahora)` (Q-69): con el token verificado, devuelve las horas libres del servicio y la sede de la cita con las reglas de la consulta pública (actor `cliente`; hasta 31 días, recortados a hoy y a la anticipación máxima, Q-32 de TASKS-03) y sin contar la propia cita (F-03, paso 2). Si la cita no admite reprogramar (T6.03), devuelve ese error.
   * Archivos: `src/servidor/casos-uso/gestion-cita.ts`, `src/servidor/casos-uso/disponibilidad.ts`, `tests/integracion/casos-uso/gestion-cita.test.ts`
   * Depende de: T6.17
   * Refs: GES-03, F-03, RN-09, RN-14, ARCH §10, §18.5; Q-32 (TASKS-03), Q-69
   * Aceptación:
      * La hora de la propia cita y las que se solapan con ella aparecen libres (RN-14).
      * Con capacidad 1, una hora ocupada por otra cita no aparece, y la respuesta tiene el formato de `GET …/disponibilidad` (ARCH §18.5).

* [ ] T6.21: Rutas HTTP de la gestión
   * Objetivo: Crear `POST /api/publico/{slug}/citas/{citaId}/disponibilidad`, `…/reprogramar` y `…/cancelar` como adaptadores delgados, con el token en el cuerpo (ARCH §18.5), solo `application/json` (ARCH §19.2) y `Cache-Control: private, no-store`. Después de un cambio, despachan sus notificaciones (T6.16). `LIMITE_REPROGRAMACIONES` responde con el texto de RN-34 y el límite del negocio.
   * Archivos: `src/app/api/publico/[slug]/citas/[citaId]/disponibilidad/route.ts`, `src/app/api/publico/[slug]/citas/[citaId]/reprogramar/route.ts`, `src/app/api/publico/[slug]/citas/[citaId]/cancelar/route.ts`, `src/servidor/http/respuestas.ts`, `tests/integracion/app/api/publico/gestion.test.ts`
   * Depende de: T6.16, T6.19, T6.20
   * Refs: GES-02, GES-03, RN-13, RN-34, ARCH §13, §18.5, §19.2; Q-33 (TASKS-03), Q-69
   * Aceptación:
      * Cancelar y reprogramar responden 200 con el cuerpo de Q-69; un token inválido, 404 `NO_ENCONTRADO`; y fuera del plazo, 409 `FUERA_DE_PLAZO` (ARCH §18.5).
      * Con el límite en 3, la cuarta reprogramación responde 409 con "Ya reprogramaste esta cita 3 veces. Para otro cambio, comunícate con el negocio" (RN-34).
      * Un cuerpo que no es JSON responde 422 `DATOS_INVALIDOS` (Q-33, TASKS-03), y ninguna respuesta repite el token (ARCH §19.2).

* [ ] T6.22: Página de gestión: detalle y estados
   * Objetivo: Crear `/{slug}/cita/{citaId}/{token}` (ARCH §4, §5) con `verCitaPorLink`: el encabezado del negocio (T4.18), el código en monoespaciada, el badge de estado, el servicio, la fecha y la hora en hora de Colombia, la dirección con "Cómo llegar" y los mensajes de Q-70 para la cita cancelada, pasada, fuera del plazo o sin reprogramaciones y para el negocio suspendido, con la tarjeta de contactos (GES-04, GES-05). Responde 404 con `NO_ENCONTRADO`. Agrega en `next.config.ts` los encabezados de ARCH §13 para esta ruta, después de los generales para que los reemplacen. Deja el lugar de las acciones de T6.23.
   * Archivos: `src/app/(publico)/[slug]/cita/[citaId]/[token]/page.tsx`, `src/componentes/publico/gestion-cita.tsx`, `next.config.ts`
   * Depende de: T6.17
   * Refs: GES-01, GES-04, GES-05, RN-03, RN-13, RNF-01, RNF-04, D-14, D-28, D-29, D-30, ARCH §7.2, §13, DESIGN §3, §4.2; Q-47 (TASKS-04), Q-70
   * Aceptación (manual, con `npm run preview`):
      * El link de un C-01 abre el detalle de su cita, en hora de Colombia también con el dispositivo en otra zona horaria (RN-03). Un carácter cambiado en el token responde 404.
      * `curl -I` muestra `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, un `Cache-Control` con `private` y `no-store`, y la CSP de las páginas públicas (ARCH §13; Q-47, TASKS-04). La página no carga scripts de Clerk (ARCH §7.2).
      * Con el negocio suspendido, se ven la cita y los contactos, sin acciones (GES-05).

* [ ] T6.23: Página de gestión: cancelar y reprogramar
   * Objetivo: Agregar las acciones a la página (DESIGN §4.2):
      * "Cancelar cita", con la confirmación en dos pasos ("¿Cancelar la cita?" y "Sí, cancelar mi cita") y, después, "Esta cita fue cancelada y su cupo quedó libre.";
      * "Reprogramar", con el calendario y las horas libres de la Fase 4 sobre T6.20, "Confirmar cambio" y "Te quedan X de Y reprogramaciones" (Q-70);
      * cada respuesta, como en la reserva (T4.27): 409 `HORARIO_NO_DISPONIBLE` recarga las horas; `FUERA_DE_PLAZO`, `LIMITE_REPROGRAMACIONES` y `NEGOCIO_SUSPENDIDO` recargan el estado; 429 muestra "Hiciste muchas solicitudes seguidas. Intenta en un minuto." (Q-43 de TASKS-04); y una falla de conexión, un aviso para reintentar.

      El botón muestra "Procesando…" y no admite un segundo envío. El foco va al aviso del resultado.
   * Archivos: `src/componentes/publico/gestion-acciones.tsx`, `src/componentes/publico/api.ts`, `tests/unit/componentes/publico/api.test.ts`
   * Depende de: T6.21, T6.22
   * Refs: GES-02, GES-03, GES-04, F-02, F-03, RN-11, RN-13, RN-34, RNF-03, DESIGN §3, §4.2, §5; Q-43 (TASKS-04), Q-70
   * Aceptación:
      * Con `fetch` simulado, las respuestas 200, 404, 409 (de cada código), 422 y 429 de las tres rutas dan el resultado correspondiente, y una falla de red da el error de conexión, sin lanzar excepciones.
      * Manual, en local: el cliente reprograma desde el link de su correo; la página muestra la hora nueva, el contador baja, la hora anterior vuelve a ofrecerse en `/{slug}` y llegan C-04 y C-06 (F-03).
      * Manual: con dos pestañas sobre la misma hora, la segunda ve el aviso de hora ocupada con las horas recargadas (RN-11). Con el límite en 0, no aparece "Reprogramar" (RN-34). El cliente cancela en dos pasos y la página queda sin acciones (F-02).

### 6.E Tareas del cron

* [ ] T6.24: Caso de uso `aplicarVencimientos`
   * Objetivo: Implementar `aplicarVencimientos(ahora)` con las dos sentencias de ARCH §7.6, en una transacción con `app.actor = 'sistema'`: encola C-07 a los negocios en gracia, una vez por vencimiento, y suspende los que terminaron la gracia, con su C-08 en la misma sentencia (RN-31, S-16).
   * Archivos: `src/servidor/casos-uso/vencimientos.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/vencimientos.test.ts`
   * Depende de: T5.32
   * Refs: RN-30, RN-31, D-13, S-16, ADR-14, ARCH §7.6, §14.1, §18.3; Q-75
   * Aceptación:
      * Un negocio en `activa` con la gracia terminada queda `suspendida`, con una fila en `auditoria_admin` cuyo autor es `sistema` y un C-08 pendiente (RN-30, RN-31).
      * Correrlo tres veces durante la gracia deja un solo C-07; después de un pago y un nuevo vencimiento, sale otro (ARCH §7.6).
      * Un negocio al día, uno ya suspendido y uno en prueba con el fin de la prueba en el futuro no cambian.

* [ ] T6.25: Caso de uso `aplicarAsistenciaPorDefecto`
   * Objetivo: Implementar `aplicarAsistenciaPorDefecto(ahora)` con la sentencia de ARCH §14.4: marca con el valor por defecto del negocio las citas `confirmada` cuyo `fin` ya pasó, salvo con `manual` o con el negocio suspendido, y deja el evento del sistema con `{ "automatica": true }` (D-21; Q-55 de TASKS-05).
   * Archivos: `src/servidor/casos-uso/asistencia-por-defecto.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/asistencia-por-defecto.test.ts`
   * Depende de: T5.32
   * Refs: RN-16, D-14, D-21, F-08, ARCH §14.4, §18.3; Q-55 (TASKS-05), Q-75
   * Aceptación:
      * Una cita terminada y no marcada queda `completada` o `no_asistio`, según el negocio, con el evento del sistema; una que todavía no termina, no cambia (D-21).
      * Con `manual`, o con el negocio suspendido, la cita sigue `confirmada` (D-21, D-14). El historial del panel la muestra como "Marcada automáticamente" (T5.13).

* [ ] T6.26: Ruta del cron con sus tareas
   * Objetivo: Hacer que `POST /api/interno/cron` corra, en orden, `aplicarVencimientos`, `aplicarAsistenciaPorDefecto` y `procesarNotificaciones` con el proveedor de Resend (ARCH §14.4). Cada tarea corre aunque falle la anterior; la ruta registra el resultado de cada una sin datos personales y responde 204, o 500 si alguna falló (Q-75).
   * Archivos: `src/app/api/interno/cron/route.ts`, `src/servidor/casos-uso/cron.ts`, `tests/integracion/casos-uso/cron.test.ts`
   * Depende de: T6.15, T6.24, T6.25
   * Refs: RN-16, RN-21, RN-31, ARCH §14.4, §14.5, §19.2, §21.4; Q-75
   * Aceptación:
      * Con un negocio cuya gracia terminó, una sola corrida lo suspende y envía su C-08 (ARCH §14.4: `aplicarVencimientos` va primero).
      * Si `aplicarVencimientos` falla, las otras dos tareas corren igual y la ruta responde 500 (prueba con la tarea simulada).
      * Con `wrangler dev --test-scheduled`, `GET /__scheduled` corre las tres tareas y el registro muestra la respuesta de la ruta (T1.54).

### 6.F Panel: recordatorios y "Mi calendario"

* [ ] T6.27: Recálculo de los recordatorios
   * Objetivo: Hacer que `guardarRecordatorio` recalcule, en la misma transacción, los recordatorios de las citas futuras `confirmada` con correo (ARCH §14.1; Q-23 de TASKS-02): con otro número de horas, mueve `programada_para` de los pendientes; con "ninguno", los anula; y de "ninguno" a un valor, los crea para la versión actual de cada cita. Si el nuevo momento ya pasó, la cita queda sin recordatorio (S-12). Como la clave es única, un recordatorio anulado de la misma versión se reactiva en lugar de insertar otro.
   * Archivos: `src/servidor/casos-uso/configuracion.ts`, `src/servidor/db/repositorios/notificaciones.ts`, `tests/integracion/casos-uso/configuracion.test.ts`
   * Depende de: T6.13
   * Refs: PAN-16, RN-20, RN-21, S-05, S-12, ARCH §14.1; Q-23 (TASKS-02)
   * Aceptación:
      * Pasar de 24 a 2 horas deja los recordatorios pendientes en `inicio − 2 h`; los ya enviados y los de citas pasadas o canceladas no cambian (RN-21).
      * De 24 horas a "ninguno" y de vuelta a 24, cada cita futura con correo tiene un solo recordatorio pendiente, con su clave de siempre (RN-20). Una cita sin correo no tiene ninguno (S-05).
      * Una cita que empieza en 5 horas no recibe recordatorio al pasar a 24 horas (S-12; Q-23, TASKS-02).

* [ ] T6.28: Casos de uso del enlace de calendario
   * Objetivo: Crear el repositorio de `enlace_calendario` e implementar `leerEnlaceCalendario(ctx)`, que devuelve las URL del enlace vigente del negocio (T6.02) o ninguna, y `generarEnlaceCalendario(ctx)` (ARCH §18.4), que empieza con `requireEscritura` y, en una transacción, revoca el vigente y crea otro con `creado_por` igual al `clerk_user_id` del dueño (ARCH §14.7). En el MVP hay un enlace por negocio, sin sede ni recurso.
   * Archivos: `src/servidor/casos-uso/enlace-calendario.ts`, `src/servidor/db/repositorios/enlaces-calendario.ts`, `tests/integracion/casos-uso/enlace-calendario.test.ts`
   * Depende de: T6.02
   * Refs: PAN-20, RN-35, D-14, ARCH §6, §14.7, §17.3, §18.3, §18.4; Q-72
   * Aceptación:
      * Generar dos veces deja un solo enlace vigente y el primero con `revocado_en`. El índice `enlace_calendario_vigente_uq` impide dos vigentes (ARCH §18.3).
      * Con el negocio suspendido, generar devuelve `NEGOCIO_SUSPENDIDO` y leer sigue funcionando (D-14).

* [ ] T6.29: Caso de uso `servirCalendario` y su ruta
   * Objetivo: Implementar `servirCalendario(enlaceId, token, ahora)` y `GET /api/calendario/{enlaceId}/{token}` (ARCH §14.7). Con un enlace existente, no revocado y con firma válida, responde `text/calendar` sin `METHOD`, con un `VEVENT` por cita no cancelada del negocio desde hace 30 días hasta dentro de 365, con los `UID` y `SEQUENCE` de las invitaciones (T6.04) y el contenido de Q-71, sin teléfonos ni correos. Lleva `Cache-Control: private, max-age=300` y `X-Robots-Tag: noindex`, y actualiza `ultimo_acceso_en` como máximo una vez por hora. En otro caso, responde 404.
   * Archivos: `src/servidor/casos-uso/enlace-calendario.ts`, `src/app/api/calendario/[enlaceId]/[token]/route.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/app/api/calendario.test.ts`
   * Depende de: T6.04, T6.28
   * Refs: PAN-20, RN-01, RN-24, RN-35, D-14, ADR-17, ARCH §5, §14.6, §14.7, §19.1; Q-71
   * Aceptación:
      * El calendario incluye una cita reservada en la página pública y una creada en el panel, y no incluye las canceladas ni las de otro negocio (RN-35, RN-01).
      * La respuesta no contiene ningún teléfono ni correo de cliente (RN-24). Con el negocio suspendido, se sirve igual (D-14).
      * Un enlace revocado, un token alterado o un id inexistente responden 404 (RN-35).

* [ ] T6.30: Pantalla "Mi calendario"
   * Objetivo: Crear `/panel/calendario` (PAN-20) y agregar "Mi calendario" a la navegación (Q-57 de TASKS-05): crear el enlace si no existe; mostrarlo con "Copiar"; las instrucciones para Google Calendar ("Desde URL", con la URL `https://`) y para Outlook (con `webcal://`); el aviso de que cada calendario decide cada cuánto se actualiza y de que el panel sigue siendo la referencia del día (RN-35); y "Regenerar enlace" con la confirmación en dos pasos, que avisa que el anterior deja de funcionar (Q-72).
   * Archivos: `src/app/(panel)/panel/calendario/page.tsx`, `src/app/(panel)/panel/calendario/acciones.ts`, `src/app/(panel)/panel/calendario/enlace.tsx`, `src/componentes/panel/navegacion.tsx`
   * Depende de: T6.29
   * Refs: PAN-20, RN-35, D-14, RNF-03, DESIGN §3, §4.3; Q-57 (TASKS-05), Q-72
   * Aceptación (manual, en el Worker, porque Google necesita una URL pública y la pantalla, sesión; ARCH §23):
      * El dueño crea su enlace y lo agrega a Google Calendar con "Desde URL"; tras la actualización de Google, ve sus citas (RN-35).
      * Al regenerar, la URL anterior responde 404 y la nueva funciona (RN-35).
      * Con el negocio suspendido, el enlace se ve y los botones aparecen deshabilitados (D-14).

### 6.G Administración

* [ ] T6.31: Notificaciones fallidas o atrasadas (ADM-05)
   * Objetivo: Implementar `listarNotificacionesConProblemas(ahora)` y la página `/admin/notificaciones`, detrás de `requireSuperadmin`, con las notificaciones `fallida` y las `pendiente` con más de 15 minutos de atraso (ARCH §21.4), con las columnas de Q-73 y un enlace desde `/admin`. Si la segunda lista está vacía, el cron está corriendo.
   * Archivos: `src/servidor/casos-uso/notificaciones-admin.ts`, `src/servidor/db/repositorios/notificaciones.ts`, `src/app/(admin)/admin/notificaciones/page.tsx`, `src/app/(admin)/admin/page.tsx`, `tests/integracion/casos-uso/notificaciones-admin.test.ts`
   * Depende de: T6.13
   * Refs: ADM-05, RN-20, ADR-07, ARCH §19.2, §21.4, §23; Q-73
   * Aceptación:
      * Una notificación `fallida` y una `pendiente` vencida hace 20 minutos aparecen; una vencida hace 10 minutos, una enviada y una anulada, no (ARCH §21.4).
      * La lista no muestra destinatarios (ARCH §19.2) y, sin la sesión del admin, `/admin/notificaciones` responde 404 (ADR-07).

* [ ] T6.32: Reintentar una notificación fallida
   * Objetivo: Implementar `reintentarNotificacion(entrada, admin)` y el botón "Reintentar" en cada notificación `fallida` de `/admin/notificaciones` (Q-73). Detrás de `requireSuperadmin`, con `UPDATE … WHERE estado = 'fallida'`, la devuelve a `pendiente` con `intentos = 0`, `programada_para = ahora` y sin `ultimo_error`, y registra `notificacion_reintentada` con su id y el del admin. Sale en la siguiente corrida del cron, revalidada como cualquier otra (T6.05) y con la misma clave de idempotencia. Al implementarla se verifica en la documentación de Resend que un envío que falló se puede repetir con la misma `Idempotency-Key`.
   * Archivos: `src/servidor/casos-uso/notificaciones-admin.ts`, `src/servidor/db/repositorios/notificaciones.ts`, `src/app/(admin)/admin/notificaciones/page.tsx`, `src/app/(admin)/admin/notificaciones/acciones.ts`, `tests/integracion/casos-uso/notificaciones-admin.test.ts`
   * Depende de: T6.31
   * Refs: ADM-05, RN-20, D-14, ADR-07, ARCH §14.2, §14.3, §19.2; Q-73
   * Aceptación:
      * Una notificación `fallida` reintentada queda `pendiente` para ahora, con 0 intentos, y la corrida siguiente la envía con su clave de siempre (RN-20). Una `pendiente`, `enviada` o `cancelada` devuelve `ESTADO_INVALIDO` sin cambiar, y un id inexistente, `NO_ENCONTRADO`.
      * Un correo de citas reintentado con el negocio suspendido se anula al reclamarse, como cualquier otro (D-14; ARCH §14.3).
      * Sin la sesión del admin, la Server Action termina en 404 y no cambia nada (ADR-07).

* [ ] T6.33: Reenviar la invitación del dueño
   * Objetivo: Implementar `reenviarInvitacion(entrada, admin)` y el botón "Reenviar invitación" en `/admin/negocios/{id}`, que aparece mientras el dueño no se haya vinculado (`clerk_user_id` en `NULL`; ARCH §7.4) y vuelve a invitarlo con Clerk según Q-73. Si Clerk falla, la pantalla lo avisa y el registro anota `invitacion_fallida` con el `negocioId`, sin el correo (Q-08 de TASKS-01).
   * Archivos: `src/servidor/casos-uso/invitacion-admin.ts`, `src/servidor/auth/invitaciones.ts`, `src/app/(admin)/admin/negocios/[id]/page.tsx`, `src/app/(admin)/admin/negocios/[id]/acciones.ts`, `src/app/(admin)/admin/negocios/[id]/formularios.tsx`, `tests/integracion/casos-uso/invitacion-admin.test.ts`
   * Depende de: T5.32
   * Refs: ADM-02, F-05, F-11, ADR-06, ARCH §7.4, §19.2; Q-08 (TASKS-01), Q-73
   * Aceptación:
      * Con `clerkClient` simulado: con el dueño pendiente, la invitación se crea una sola vez, con su correo y la `redirectUrl` de `/registro` (T1.46); con el dueño ya vinculado, devuelve `ESTADO_INVALIDO` sin llamar a Clerk.
      * Manual, en local: el dueño de un negocio de prueba recibe la invitación nueva y entra al panel con ella (F-05).

### 6.H Pruebas y cierre

Pruebas de integración contra la rama efímera de Neon, con los casos de ARCH §20 y los criterios de aceptación de las RN que esta fase hace posibles. Usan el proveedor simulado y el reloj inyectado, y cada caso cita su origen.

* [ ] T6.34: Pruebas de la gestión por link
   * Objetivo: Probar con las rutas HTTP de la gestión los criterios de RN-13, RN-14 y RN-34 y los flujos F-02 y F-03.
   * Archivos: `tests/integracion/app/api/publico/gestion-reglas.test.ts`
   * Depende de: T6.21
   * Refs: RN-13, RN-14, RN-34, D-20, F-02, F-03
   * Aceptación (una prueba por caso; todas pasan):
      * Con un plazo de 24 horas, el link permite actuar hasta exactamente 24 horas antes del inicio. Un segundo después, el servidor rechaza cancelar y reprogramar. Un link alterado devuelve "no encontrado" (RN-13).
      * Después de reprogramar, la cita conserva su identificador y no aparece ninguna cita nueva; la validación no la cuenta en su propio cupo anterior (RN-14).
      * Con el límite en 3, la cuarta reprogramación se rechaza con "Ya reprogramaste esta cita 3 veces. Para otro cambio, comunícate con el negocio", y cancelar sigue disponible dentro del plazo (RN-34).
      * Si el dueño mueve la cita, el cliente conserva los intentos que le quedan. Con el límite en 0, el link no ofrece "Reprogramar" (RN-34, D-20).
      * Cancelar desde el link libera el cupo, anula el recordatorio y encola C-03 y C-06 (F-02, paso 4).

* [ ] T6.35: Pruebas de las notificaciones
   * Objetivo: Probar con el procesador los criterios de RN-20, RN-21 y RN-22 y los casos de ARCH §20 (Notificaciones).
   * Archivos: `tests/integracion/notificaciones/notificaciones-reglas.test.ts`
   * Depende de: T6.26, T6.27, T6.32, T6.34
   * Refs: RN-20, RN-21, RN-22, S-05, S-06, S-12, ARCH §20 (Notificaciones); Q-73
   * Aceptación (una prueba por caso; todas pasan):
      * Ejecutar dos veces seguidas, y dos veces en paralelo, el proceso de envío no duplica ningún correo (RN-20; ARCH §20).
      * Una notificación reintentada desde `/admin` (T6.32) sale con la misma clave de idempotencia, así que un correo que el proveedor ya había aceptado no se duplica (RN-20).
      * Con un recordatorio de 24 horas y el cron cada 5 minutos, el correo sale entre 0 y 5 minutos después de `inicio − 24 h`. Si la cita se cancela antes, no sale; si se reprograma, sale según la nueva hora (RN-21).
      * Cada reserva, cancelación y reprogramación hecha por el cliente genera exactamente un correo al dueño, y las acciones del dueño, ninguno (RN-22, S-06).
      * Una cita sin correo no envía nada al cliente (S-05), y una creada después del momento de su recordatorio no lo recibe (S-12).

* [ ] T6.36: Pruebas de la suscripción en el cron
   * Objetivo: Probar con el cron los criterios de RN-04 y RN-31 y los casos de ARCH §20 (Suscripción) que dependen del envío.
   * Archivos: `tests/integracion/casos-uso/suscripcion-cron.test.ts`
   * Depende de: T6.26
   * Refs: RN-04, RN-29, RN-30, RN-31, D-14, S-16, F-12, ARCH §20 (Suscripción)
   * Aceptación (una prueba por caso; todas pasan):
      * Con vencimiento el 10-oct a las 00:00 hora del negocio, el 12-oct a las 23:59 todo funciona; el 13-oct a las 00:00 el negocio está suspendido aunque el cron no haya corrido, y después de su corrida el cambio queda auditado con el autor "sistema". Lo mismo con un negocio en prueba (RN-31).
      * Aunque el cron corra muchas veces, el dueño recibe un solo C-07 durante la gracia y un solo C-08 al quedar suspendido (RN-31, S-16).
      * Un C-07 pendiente se anula si el negocio paga antes de que salga, y `registrarPago` reactiva sin esperar al cron (ARCH §20).
      * Con el negocio suspendido, los recordatorios pendientes no salen y el servidor rechaza cancelar y reprogramar por link con `NEGOCIO_SUSPENDIDO` (RN-04). Al reactivarlo, los recordatorios cuya hora pasó durante la suspensión no se envían (F-12, paso 4).

* [ ] T6.37: Pruebas de la asistencia por defecto
   * Objetivo: Probar con el cron los criterios de RN-16 (D-21) y los casos de ARCH §20 (Asistencia por defecto).
   * Archivos: `tests/integracion/casos-uso/asistencia-por-defecto-reglas.test.ts`
   * Depende de: T6.26
   * Refs: RN-16, D-14, D-21, S-09, ARCH §20 (Asistencia por defecto)
   * Aceptación (una prueba por caso; todas pasan):
      * Con el valor por defecto "asistió", una cita de 9:00 a 9:30 que el dueño no marcó queda `completada` a más tardar a las 9:35, con el autor "sistema" (RN-16).
      * Con "siempre decido yo", sigue `confirmada` hasta que el dueño la marque (RN-16).
      * Con el negocio suspendido no cambia; en la primera corrida después de reactivarlo, sí (D-21, D-14). Después, el dueño la corrige a `no_asistio` (S-09).

* [ ] T6.38: Pruebas de los calendarios
   * Objetivo: Probar los criterios de RN-35 y los casos de ARCH §20 (Calendario) con los correos que recibe el proveedor simulado y con el enlace del dueño.
   * Archivos: `tests/integracion/notificaciones/calendario-reglas.test.ts`
   * Depende de: T6.29, T6.34
   * Refs: RN-24, RN-35, ARCH §14.6, §14.7, §20 (Calendario)
   * Aceptación (una prueba por caso; todas pasan):
      * Al reservar, C-01 lleva la invitación; al reprogramar, C-04 lleva el mismo `UID` con un `SEQUENCE` mayor; y al cancelar, C-03 lleva `CANCEL` con ese `UID`. C-02, C-05 y C-06 no llevan invitación (RN-35).
      * El enlace del dueño muestra las citas creadas por los clientes y por él, sin teléfonos ni correos, y una cita cancelada desaparece en la siguiente consulta (RN-35).
      * Al regenerar el enlace, el anterior responde "no encontrado" (RN-35).

* [ ] T6.39: Pruebas de concurrencia de la reprogramación
   * Objetivo: Probar RN-11 en la reprogramación por link: el caso de ARCH §20 que quedó pendiente en las Fases 3 y 5 (T3.22, T5.29).
   * Archivos: `tests/integracion/casos-uso/reprogramar-cita-concurrencia.test.ts`
   * Depende de: T6.19
   * Refs: RN-11, RN-34, ADR-04, ARCH §11.3, §18.3, §20 (Concurrencia)
   * Aceptación (una prueba por caso; todas pasan):
      * Una reprogramación y una reserva lanzadas a la vez por el último cupo de un recurso de capacidad 1: entra solo una (ARCH §20: "lo mismo al reprogramar contra una reserva").
      * Con el límite en 1, dos reprogramaciones simultáneas de la misma cita: entra una y la otra recibe `LIMITE_REPROGRAMACIONES` (ARCH §18.3: "compara con el límite y suma 1 dentro de la transacción").

* [ ] T6.40: Pruebas multi-negocio y de solo lectura
   * Objetivo: Probar las rutas y las Server Actions de esta fase con identificadores de otro negocio y con el negocio suspendido.
   * Archivos: `tests/integracion/app/api/publico/multi-negocio.test.ts`, `tests/integracion/app/panel/multi-negocio.test.ts`, `tests/integracion/app/panel/solo-lectura.test.ts`
   * Depende de: T6.30, T6.34
   * Refs: RN-01, RN-04, D-14, ARCH §6, §20 (Multi-negocio, Suscripción)
   * Aceptación (una prueba por caso; todas pasan):
      * El link de una cita de B con el slug de A, y el token de una cita con el id de otra, devuelven `NO_ENCONTRADO` en las tres rutas de gestión, y la cita de B no cambia (RN-01).
      * El enlace de calendario de A no trae citas de B, y su token no sirve con el id del enlace de B (RN-01).
      * Con el negocio suspendido, generar el enlace de calendario devuelve `NEGOCIO_SUSPENDIDO` y no cambia nada, y el enlace, la página de gestión y "Mi calendario" se siguen leyendo (D-14; ARCH §20: "se puede consultar").

* [ ] T6.41: Revisión de accesibilidad, móvil y correos
   * Objetivo: Recorrer la página de gestión y "Mi calendario" en móvil y con el teclado, abrir los correos en Gmail y en Outlook, y corregir lo que falle. Los arreglos van en el commit de esta tarea.
   * Archivos: los que haya que corregir en `src/componentes/publico/`, `src/app/(publico)/`, `src/app/(panel)/panel/calendario/` y `src/servidor/notificaciones/plantillas/`
   * Depende de: T6.23, T6.30
   * Refs: RNF-01, RNF-02, RNF-03, RN-03, DESIGN §6, §7; riesgo de Clerk en `http://localhost` (ARCH §23)
   * Aceptación (manual; "Mi calendario" en el Worker, porque necesita sesión):
      * A 360 px no hay desplazamiento horizontal en la página de gestión ni en "Mi calendario", y las áreas táctiles miden al menos 44 px (RNF-01; DESIGN §6).
      * Una reprogramación y una cancelación se hacen solo con el teclado, con el foco visible en cada control. Lighthouse no informa errores de etiquetas, contraste ni nombres de botones en la página de gestión (RNF-03).
      * Cada correo, de C-01 a C-08, se lee bien en Gmail y en Outlook desde el celular, con las horas en formato de 12 horas (RNF-02), y su texto plano trae la misma información.

* [ ] T6.42: [manual] Plan y secretos del Worker
   * Objetivo: Pasar la cuenta de Cloudflare a Workers Paid (Q-74) y cargar en el Worker los secretos de la fase: `RESEND_API_KEY`, y `GESTION_CITA_SECRET` y `CALENDARIO_SECRET` con 32 bytes al azar cada uno.
   * Archivos: —
   * Depende de: T6.06
   * Refs: RNF-04, RNF-08, ARCH §21.3, §21.4, §23; Q-36 (TASKS-03), Q-74
   * Aceptación:
      * `npx wrangler secret list` muestra los tres secretos nuevos, además de los de T1.55.
      * El Dashboard de Cloudflare muestra la cuenta en Workers Paid (Q-74).

* [ ] T6.43: Despliegue y verificación de la fase
   * Objetivo: Desplegar la fase en Workers Paid y recorrer en `*.workers.dev`, con correos reales, el ciclo de una cita, el cron y el enlace del dueño. Como el remitente de pruebas solo entrega a la dirección de la cuenta de Resend (Q-62), el negocio de prueba tiene esa dirección como dueño (si el de las fases anteriores no la tiene, se da de alta otro con ella) y el cliente reserva con esa misma dirección.
   * Archivos: — (el commit anota el tamaño del Worker y el CPU medido)
   * Depende de: T6.31–T6.33, T6.35–T6.42
   * Refs: RNF-07, RNF-09, RN-21, RN-35, ARCH §14.6, §20 (Calendario), §21.4, §23; Q-36 (TASKS-03), Q-62, Q-71, Q-74
   * Aceptación:
      * `npm run deploy` termina sin errores y sin migraciones pendientes, y el tamaño del Worker queda anotado en el commit.
      * Una reserva en la página pública trae C-01 con su código y su invitación, que Gmail y Outlook agregan a la hora correcta, y el dueño recibe C-05. Desde el link, el cliente reprograma (C-04 mueve el mismo evento y el dueño recibe C-06) y después cancela (C-03 quita el evento). Un recordatorio configurado a pocas horas llega a tiempo (RN-21, RN-35; ARCH §14.6: "esto se verifica el día que se implemente"; Q-71).
      * El enlace del dueño se agrega en Google Calendar y en Outlook y muestra las citas de la página y del panel (ARCH §20: "prueba manual de importación en Google Calendar y Outlook antes de salir a producción").
      * El admin suspende el negocio: llega C-08, la gestión queda sin acciones y Workers Logs muestra el cron con respuesta 204. Después registra el pago. `/admin/notificaciones` no muestra pendientes atrasadas (ARCH §21.4).
      * El CPU de una corrida del cron con envíos, del render de la página de gestión y de `reprogramarCita`, medido con `wrangler tail`, queda anotado frente a los 30 s de CPU de Workers Paid (Q-74).

---

## Preguntas

Puntos que el PRD, ARCHITECTURE y DESIGN no definían. Todas quedaron resueltas el 2026-10-23 con el supuesto que se había propuesto, salvo Q-73, que suma el reintento de las notificaciones fallidas (T6.32). Las que cambian contratos, operaciones, variables o el plan del Worker (Q-62 a Q-64, Q-66 a Q-69 y Q-71 a Q-75) quedaron en ARCH §3, §7.6, §14, §18.4, §18.5, §21 y §23 (v0.14), como se hizo con Q-19 (TASKS-02). Siguen vigentes, y aplican a esta fase, Q-06, Q-08 y Q-11 de [TASKS-01](TASKS-01.md#preguntas); Q-20, Q-23 y Q-24 de [TASKS-02](TASKS-02.md#preguntas); Q-28, Q-32, Q-35 y Q-36 de [TASKS-03](TASKS-03.md#preguntas); Q-40, Q-41, Q-43, Q-44 y Q-47 de [TASKS-04](TASKS-04.md#preguntas); y Q-55, Q-57 y Q-60 de [TASKS-05](TASKS-05.md#preguntas).

| ID | Pregunta | Decisión | Afecta a |
|---|---|---|---|
| Q-62 | Resend solo envía a cualquier destinatario desde un dominio verificado, y el dominio propio llega en la Fase 9 (Q-06, TASKS-01). Sin él, solo entrega desde su remitente de pruebas a la dirección de la propia cuenta. ¿Con qué remitente se trabaja en esta fase? | **Resuelta (2026-10-23):** la cuenta de Resend se crea con el correo del desarrollador, y hasta la Fase 9 `CORREO_REMITENTE` y `CORREO_CUENTA` usan el remitente de pruebas de Resend, con los nombres de ARCH §14.3. En esta fase no se verifica ningún dominio. En las pruebas manuales, el cliente y el dueño de prueba usan la dirección de la cuenta: Resend rechaza cualquier otra, y esa notificación queda `fallida`. La verificación de `tuapp.com` con SPF, DKIM y DMARC queda en la Fase 9, junto con el dominio. | T6.06, T6.07, T6.42, T6.43 |
| Q-63 | ¿A qué dirección van las respuestas de los correos de citas? Q-11 (TASKS-01) dijo `negocio.correo_contacto` o, si falta, el correo del dueño, y Q-40 (TASKS-04) dejó revisarlo con la lista de contactos. `correo_contacto` no tiene pantalla. | **Resuelta (2026-10-23):** el primero que exista, en este orden: `negocio.correo_contacto`, el primer contacto `correo` de la sede principal por su orden (D-29) y el correo del miembro `dueno`. `correo_contacto` sigue sin pantalla. | T6.08, T6.14 |
| Q-64 | ARCH §3 deja React Email como "propuesto" y no dice si se usa el SDK de Resend. Cada dependencia suma al tamaño y al arranque del Worker (ARCH §21.4). | **Resuelta (2026-10-23):** `@react-email/components` y `@react-email/render` con versión exacta, que producen el HTML y el texto plano, y la API REST de Resend con `fetch`, sin el SDK, con el encabezado `Idempotency-Key`. T6.08 mide el tamaño: si React Email suma más de unos 1000 KiB sin comprimir, las plantillas se escriben con componentes propios y `renderToStaticMarkup` de `react-dom/server`, que ya está en el Worker. | T6.07, T6.08 |
| Q-65 | PRD §5.4 da el contenido mínimo de cada correo, pero no su asunto, ni si llevan el código de reserva, ni qué versión de la política se enlaza en una cita manual, que no tiene consentimiento. | **Resuelta (2026-10-23):** **Código:** en C-01 a C-06 (D-28). **Política:** en C-01 y C-02, la versión que aceptó el cliente; en una cita manual, la vigente. **Contactos del negocio:** al pie de C-01 a C-04. **Asuntos:** C-01 "Tu cita en {negocio} está confirmada"; C-02 "Recordatorio: tu cita en {negocio} es el {fecha}"; C-03 "Tu cita en {negocio} fue cancelada"; C-04 "Tu cita en {negocio} cambió de hora"; C-05 "Nueva cita: {servicio}, {fecha y hora}"; C-06 "Cambio en la cita {código}"; C-07 "Tu suscripción venció: renueva antes del {fecha}"; y C-08 "Tu suscripción está suspendida". Las fechas, en la zona del negocio. | T6.09–T6.14 |
| Q-66 | C-07 y C-08 salen a nombre "del producto", con instrucciones de pago fijas (ARCH §14.3), pero no están definidos ni el nombre del producto ni los datos de pago. | **Resuelta (2026-10-23):** una variable del Worker, `NOMBRE_PRODUCTO` (por ahora, "Agenda de citas"), que se suma a ARCH §21.3. Mientras no haya datos de pago, la plantilla pide responder el correo para recibirlos, y la respuesta llega a `CORREO_SOPORTE`. Cuando se definan la cuenta y el Nequi, se reemplaza ese texto. | T6.07, T6.08, T6.12 |
| Q-67 | ARCH §14.3 revalida al enviar los recordatorios, los correos de la cuenta y la suspensión, pero no los demás correos de citas. Por ejemplo, un C-04 que sale después de otro movimiento mostraría como nueva una hora que ya no es la de la cita. | **Resuelta (2026-10-23):** C-01 se anula si la cita ya está cancelada. C-04 se anula si la cita ya no está `confirmada` o si su versión es mayor que la de `datos`, porque el C-04 o el C-03 siguiente lo reemplaza. C-03, C-05 y C-06 siempre salen, salvo con el negocio suspendido. Todos se arman con los datos actuales de la cita, salvo la hora anterior de C-04 y lo que cambió en C-06, que salen de `datos`. El `ultimo_error` de una anulación dice su motivo (por ejemplo, `VERSION_ANTERIOR`). | T6.05, T6.15 |
| Q-68 | ARCH §14.1 da la clave de C-06 (`dueno_cambio:{citaId}:{eventoId}`), pero no sus `datos`. | **Resuelta (2026-10-23):** `{ "cambio": "cancelada" }` o `{ "cambio": "reprogramada", "inicio_anterior", "inicio_nuevo" }`, en ISO UTC y sin datos personales, con el id del evento que registra el cambio en la misma transacción. | T6.11, T6.18, T6.19 |
| Q-69 | ARCH §18.4 define `reprogramarCita` y `cancelarCita` del cliente, pero no la lectura de la cita por el link ni la consulta de horas para reprogramar (ARCH §18.5 solo da su ruta), ni qué responden las acciones. Tampoco dice cuándo una cita "ya pasó" (F-02, paso 6), ni si el cliente usa el control optimista de `version`. | **Resuelta (2026-10-23):** **Operaciones:** `verCitaPorLink` y `consultarDisponibilidadGestion`, públicas y de solo lectura, que se suman a ARCH §18.4. La consulta responde igual que `GET …/disponibilidad`; cancelar y reprogramar responden 200 con `{ citaId, estado, inicio, fin, reprogramacionesRestantes }` (`null` sin límite). **Acciones:** se puede cancelar y reprogramar una cita `confirmada` mientras `ahora ≤ inicio − plazo`; reprogramar exige además que le queden reprogramaciones. Una cita "ya pasó" si empezó (`ahora ≥ inicio`) o si está `completada` o `no_asistio`. **Versión:** el cliente no la envía: la reprogramación usa la cita leída después del bloqueo, y el plazo y el límite se comprueban con ella. | T6.03, T6.17–T6.21 |
| Q-70 | DESIGN §4.2 trae los textos de la gestión, un contador de reprogramaciones y el historial de cambios; dice que el texto de GES-05 está por revisar; y PRD GES-01 no pide el historial. | **Resuelta (2026-10-23):** prevalece el PRD, sin historial. Textos: fuera del plazo, "Ya no puedes cancelar ni reprogramar por aquí. Para cambios, comunícate con el negocio." (DESIGN §4.2 y F-02, paso 5); sin reprogramaciones, "Ya reprogramaste esta cita {n} veces. Para otro cambio, comunícate con el negocio." (RN-34); cita pasada, "Esta cita ya pasó."; cancelada, "Esta cita fue cancelada." (o, justo después de cancelarla, "Esta cita fue cancelada y su cupo quedó libre."); negocio suspendido, "Por ahora no puedes hacer cambios por aquí. Para cambios, comunícate con el negocio.", sin mencionar la suscripción. Todos van con la tarjeta de contactos. "Te quedan {x} de {y} reprogramaciones" aparece solo si hay límite. | T6.22, T6.23 |
| Q-71 | ARCH §14.6 fija `UID = {citaId}@tuapp.com`, pero el dominio cambia en la Fase 9, y no dice si las invitaciones llevan `ATTENDEE`, con qué tipo va el adjunto ni qué muestra cada evento del enlace del dueño. | **Resuelta (2026-10-23):** **UID:** `{citaId}@` más un sufijo fijo en código que no depende de `APP_URL`, para que el cambio de dominio no duplique eventos. **ORGANIZER:** `CORREO_REMITENTE` con el nombre del negocio. **ATTENDEE:** el correo del propio destinatario con `RSVP=FALSE`, solo si T6.43 muestra que Gmail u Outlook lo necesitan para mostrar sus botones. **Adjunto:** `invitacion.ics`, de tipo `text/calendar; method=REQUEST` (o `CANCEL`) con `charset=utf-8`. **Enlace del dueño:** `X-WR-CALNAME` con el nombre del negocio, y cada evento con `SUMMARY` `{servicio} — {nombre y apellido del cliente}`, `LOCATION` con la dirección y `DESCRIPTION` con el código y el enlace a la cita en el panel. | T6.04, T6.14, T6.29, T6.43 |
| Q-72 | PAN-20 pide el enlace y "Regenerar", pero no qué ve el dueño antes de tener uno ni dónde va la pantalla. | **Resuelta (2026-10-23):** `/panel/calendario`, con "Mi calendario" después de "Bloqueos" en la navegación. Sin enlace, la pantalla explica para qué sirve y ofrece "Crear mi enlace", porque leer no escribe. Después, el enlace se muestra siempre (el token se deriva; ARCH §14.7), con "Regenerar enlace" en dos pasos ("¿Regenerar el enlace?" y "Sí, regenerar"), que avisa que el anterior deja de funcionar. Con el negocio suspendido, el enlace se ve y se sigue sirviendo, pero no se crea ni se regenera (D-14). | T6.28, T6.30 |
| Q-73 | ADM-05 no dice qué columnas muestra ni si permite reintentar. "Reenviar invitación" (Q-08, TASKS-01) no define qué pasa si Clerk ya tiene una invitación pendiente para ese correo. | **Resuelta (2026-10-23):** **ADM-05**, en `/admin/notificaciones`: el negocio (slug), el correo del PRD (C-xx), el código de la cita, `programada_para`, los intentos, `ultimo_error` y el estado, sin el destinatario (ARCH §19.2). **Reintentar** (cambia la propuesta, que lo dejaba fuera del MVP): cada notificación `fallida` tiene un botón "Reintentar", que la devuelve a `pendiente` para ahora, con 0 intentos; sale en la siguiente corrida del cron, revalidada y con su clave de idempotencia de siempre (T6.32). Amplía la vista que pide ADM-05. **Reenviar:** solo con el dueño sin vincular; al implementarlo se verifica en la documentación de Clerk si basta `ignoreExisting` o si hay que revocar la invitación pendiente antes de crear otra. Con el dueño ya vinculado, `ESTADO_INVALIDO`. | T6.31–T6.33 |
| Q-74 | Q-36 (TASKS-03) dejó Workers Paid para la Fase 9, "o antes si aparece un error 1102". T5.32 vio uno en `/panel/citas/nueva`, y esta fase suma el render de los correos y un cron con más trabajo, que en el plan gratuito también tiene 10 ms de CPU. | **Resuelta (2026-10-23):** la cuenta pasa a Workers Paid (≈ USD 5/mes, 30 s de CPU) antes del despliegue de esta fase (T6.42), como prevé la mitigación de ARCH §23. Revisa Q-36 (TASKS-03), que dejaba la decisión para la Fase 9. T6.43 sigue midiendo el CPU. | T6.42, T6.43 |
| Q-75 | Las sentencias de ARCH §7.6, §14.3 y §14.4 usan `now()`, pero ARCH §20 pide el reloj inyectado en los casos de uso. Tampoco se fija qué hace la ruta del cron si una tarea falla, ni cuánto procesa por corrida. | **Resuelta (2026-10-23):** **Reloj:** las sentencias reciben `ahora` como parámetro, con la misma lógica. **Cron:** cada tarea corre aunque falle la anterior, en el orden de ARCH §14.4; la ruta registra cada resultado y responde 500 si alguna falló. **Lote:** `procesarNotificaciones` reclama de a 25 (ARCH §14.3) y sigue mientras haya vencidas, hasta 4 lotes por corrida; lo que quede sale en la siguiente. | T6.13, T6.15, T6.24–T6.26 |
| Q-76 | ARCH §4 ubica `notificaciones/` y `gestion-cita/`, pero no los archivos ni todas las rutas nuevas. | **Resuelta (2026-10-23):** Rutas: `/{slug}/cita/{citaId}/{token}` (ARCH §4), `/api/publico/{slug}/citas/{citaId}/{disponibilidad, reprogramar, cancelar}` (ARCH §18.5), `/api/calendario/{enlaceId}/{token}` (ARCH §5), `/panel/calendario` y `/admin/notificaciones`. Archivos: `src/dominio/{icalendar, envios}.ts`; `src/servidor/firmas.ts`, `src/servidor/gestion-cita/firma.ts` y `src/servidor/calendario/firma.ts`; `src/servidor/notificaciones/{proveedor, remitente, mensajes, procesar, despacho}.ts` y `src/servidor/notificaciones/plantillas/`; `src/servidor/casos-uso/{gestion-cita, reprogramar-cita, vencimientos, asistencia-por-defecto, cron, enlace-calendario, notificaciones-admin, invitacion-admin}.ts`; `src/servidor/db/repositorios/enlaces-calendario.ts`; y los componentes de la gestión en `src/componentes/publico/`. | Casi todas las tareas |
