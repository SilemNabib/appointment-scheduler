# Agenda de citas (SaaS) — Tareas de la Fase 5

| | |
|---|---|
| **Versión** | 0.1 (borrador) |
| **Fecha** | 2026-10-22 |
| **Fuentes** | [PRD.md](PRD.md) v0.9 · [ARCHITECTURE.md](ARCHITECTURE.md) v0.13 · [DESIGN.md](DESIGN.md) v1.0 · [TASKS-04.md](TASKS-04.md) |

> El PRD manda en el **qué** y ARCHITECTURE en el **cómo**. DESIGN.md describe cómo se ve y se comporta la interfaz; donde difiere del PRD, prevalece el PRD (DESIGN, encabezado). Si una tarea contradice a alguno de los tres, se corrige la tarea. El formato de las tareas, sus marcas y la definición de terminado están en [TASKS-00](TASKS-00.md). Lo que los documentos no definen está en [Preguntas](#preguntas): las nuevas siguen la numeración de TASKS-04 (desde Q-52), y las anteriores se citan con su documento, como "Q-44 (TASKS-04)".

## Fase 5: panel, calendario y citas manuales

### Alcance

**Entra:**

- La agenda del panel (PAN-02) en vistas de día y de semana, y la de mes como recortable (Q-52), con el código de reserva de cada cita (Q-37, TASKS-04) y la búsqueda por código (Q-59).
- El detalle de la cita con su contacto y su historial de cambios (PAN-03).
- Las operaciones del dueño sobre las citas, con sus pantallas: crear una cita manual (PAN-04, F-06), moverla (PAN-05, F-07), cancelarla (PAN-06, F-07) y marcar la asistencia (PAN-07; F-08, pasos 1, 2, 4 y 5).
- La máquina de estados de la cita y la regla de asistencia de RN-16 en el dominio (ARCH §4, §20).
- Un núcleo de agendamiento compartido por la reserva pública, la cita manual y el movimiento (ARCH §11), listo para la reprogramación por link de la Fase 6.
- Las notificaciones de esos cambios en la bandeja de salida, sin envío: C-01, C-02, C-03 y C-04 (Q-60).
- Una búsqueda mínima de clientes para la cita manual (Q-53).
- La navegación del panel y la revisión de cada pantalla por su PAN-xx según DESIGN §4.3 (Q-44 de TASKS-04, Q-57).

**No entra:**

- El envío de los correos, el procesador de la bandeja de salida y las invitaciones de calendario (Fase 6).
- `aplicarAsistenciaPorDefecto` (D-21; Fase 6, Q-04 de TASKS-01). Esta fase solo muestra "Marcada automáticamente" en el historial cuando el evento lo indique (F-08, paso 4).
- `reprogramarCita` y `cancelarCita` por link, con los plazos de RN-13 y RN-34 (Fase 6). El enlace de calendario del dueño (PAN-20, Fase 6).
- La lista de clientes, `editarCliente` y `suprimirCliente` (PAN-09; Fase 7, Q-27 de TASKS-03).
- Arrastrar citas en el calendario (F-07: "si da el tiempo"), que queda para el colchón (Q-52).
- El filtro por sede y el calendario por empleado (D-16, D-17).
- La CSP del panel (Fase 8; Q-47 de TASKS-04) y el estilo de `/admin`, que DESIGN no cubre.

**Criterio de salida:** T5.32, el despliegue y la verificación de la fase en el Worker.

### Convenciones de la fase

- Antes de escribir páginas, Server Actions o navegación, se lee la guía correspondiente en `node_modules/next/dist/docs/` (AGENTS.md): `searchParams` y `params` de las páginas, Server Actions con `useActionState`, `revalidatePath`, `redirect` y `notFound`. Next 16 no es el de los datos de entrenamiento.
- Las Server Actions son adaptadores delgados (ARCH §4): empiezan con `requireEscritura()` si modifican y con `requireMiembro()` si solo leen; van envueltas en `accion()` y pasan el contexto al caso de uso. El `negocioId` sale siempre de la sesión. Los ids de cita, servicio o cliente que llegan del navegador solo se usan junto con ese `negocioId` en el `WHERE` (ARCH §6).
- El panel no usa la API pública: llama a los casos de uso con Server Actions y recibe los mismos códigos de error (ARCH §18.5, última línea).
- Para el dueño se usa el mismo motor que para el cliente, con `actor: 'dueno'`: sin anticipación mínima ni máxima, solo desde `ahora`, y sin sobrecupo (D-01, D-11; ARCH §10).
- La cita manual se crea en la sede principal y su consultorio (Q-20, TASKS-02). Mover, cancelar y marcar usan la sede y el recurso de la propia cita. El panel nunca muestra la palabra "sede" (RN-32).
- Toda fecha y hora se muestra en la zona del negocio con `dominio/formato.ts` (RN-03; ARCH §9, regla 3), y "hoy" es la fecha local del negocio.
- Las notificaciones solo se encolan; el envío llega en la Fase 6. Las acciones del dueño nunca generan avisos `dueno_*` (S-06).
- Las pantallas usan los tokens y los componentes de DESIGN, solo con el tema claro y sin variantes `dark:` (Q-44, TASKS-04). Su aceptación es manual a 360 px de ancho (RNF-01), como en las fases anteriores.
- La fase no tiene migraciones: el modelo ya tiene todo lo que usa (ARCH §18.2).
- La fase se despliega en el plan gratuito de Workers (Q-36, TASKS-03). Cada despliegue anota el tamaño del Worker y el CPU medido.
- Las rutas y los archivos nuevos que ARCH §4 no ubica están en Q-61.

### 5.A Dominio y núcleo de agendamiento

* [x] T5.01: Dominio: estados de la cita
   * Objetivo: Crear `dominio/estados-cita.ts` con las transiciones de PRD §7: qué estados se pueden cancelar, mover y marcar, y qué tipo de evento deja cada cambio (`cancelada`, `reprogramada`, `completada`, `no_asistio` o `estado_corregido`; ARCH §18.2). `cancelada` no pasa a ningún otro estado (S-08), y ningún flujo del MVP llega a `pendiente_pago` (RN-12).
   * Archivos: `src/dominio/estados-cita.ts`, `tests/unit/dominio/estados-cita.test.ts`
   * Depende de: T4.31
   * Refs: RN-12, RN-14, RN-16, S-08, S-09, PRD §7, ARCH §4, §18.3, §20 (`dominio/estados-cita`); Q-55
   * Aceptación:
      * Una prueba por tabla recorre todas las transiciones válidas e inválidas de PRD §7: `confirmada` pasa a `cancelada`, `completada`, `no_asistio` y a sí misma con otra hora; `completada` y `no_asistio` se corrigen entre sí (S-09); desde `cancelada`, ninguna (S-08) (ARCH §20).
      * Cada transición válida indica su tipo de evento: de `confirmada` a `completada` da `completada`, y de `completada` a `no_asistio`, `estado_corregido` (Q-55).

* [x] T5.02: Dominio: asistencia después del inicio
   * Objetivo: Crear `dominio/plazos.ts` con la regla de RN-16: la asistencia se puede marcar desde el instante del inicio (`ahora ≥ inicio`). Los plazos del cliente (RN-13 y RN-34) se agregan en la Fase 6.
   * Archivos: `src/dominio/plazos.ts`, `tests/unit/dominio/plazos.test.ts`
   * Depende de: T4.31
   * Refs: RN-16, PAN-07, F-08, ARCH §4, §18.3, §20 (`dominio/plazos`)
   * Aceptación:
      * `inicio − 1 ms` no permite marcar, e `inicio` sí (ARCH §20: "en el instante exacto del borde").
      * El resultado no cambia si la suite corre con una `TZ` distinta de Bogotá (RN-03).

* [x] T5.03: Núcleo de agendamiento compartido
   * Objetivo: Llevar la transacción de `reservarCita` (T3.19, T4.05) a `casos-uso/agendar.ts`, para que la usen también la cita manual y el movimiento: toma el bloqueo del recurso, arma el contexto con `leerAgenda` después del bloqueo, lo evalúa con el actor que recibe, resuelve el cliente, elige el código de reserva y crea la cita. `citas.crearPublica` pasa a ser `citas.crear`, que recibe el origen (`publico` o `panel`), el actor del evento `creada` (`cliente`, o `dueno` con su `actor_id`) y el consentimiento, solo en el origen público (ARCH §18.2). La reserva pública no cambia de comportamiento.
   * Archivos: `src/servidor/casos-uso/agendar.ts`, `src/servidor/casos-uso/reservar-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/reservar-cita.test.ts`
   * Depende de: T4.31
   * Refs: RN-09, RN-11, RN-15, D-11, D-28, ADR-04, ARCH §11, §11.4, §12, §18.4; Q-55, Q-61
   * Aceptación:
      * Pasan sin cambios las pruebas de la reserva de las Fases 3 y 4, incluidas las de concurrencia (T3.22), de bloqueo y reserva simultáneos (T3.23) y del código de reserva (T4.05, T4.29).
      * `reservar-cita.ts` ya no toma bloqueos ni inserta citas por su cuenta: llama al núcleo con actor `cliente` (revisión del código).

* [x] T5.04: Notificaciones de los cambios de una cita
   * Objetivo: Ampliar `repositorios/notificaciones.ts` con los tipos `cancelacion` (C-03) y `reprogramacion` (C-04), y con `anularRecordatorios(negocioId, citaId, tx)`, que pasa a `cancelada` los recordatorios `pendiente` de la cita (ARCH §14.1). Llevar al núcleo de T5.03 el armado del recordatorio con su versión (`recordatorio:{citaId}:v{version}`; S-12), para que lo usen la reserva, la cita manual y el movimiento.
   * Archivos: `src/servidor/db/repositorios/notificaciones.ts`, `src/servidor/casos-uso/agendar.ts`, `tests/integracion/repositorios/notificaciones.test.ts`
   * Depende de: T5.03
   * Refs: C-02, C-03, C-04, RN-20, RN-21, S-12, ARCH §6, §14.1, §14.2; Q-60
   * Aceptación:
      * `anularRecordatorios` cancela solo los recordatorios pendientes de esa cita en ese negocio. Los ya enviados, los de otras citas y los de otros negocios no cambian (ARCH §6).
      * El recordatorio de la versión 2 de una cita tiene la clave `recordatorio:{citaId}:v2` y `{ "version": 2 }` en `datos`. Si su momento ya pasó, no se crea (S-12).

### 5.B Operaciones del dueño sobre las citas

* [x] T5.05: Caso de uso `buscarClientes`
   * Objetivo: Implementar `buscarClientes(ctx, texto)` para la cita manual (PAN-04, F-06), con las reglas de Q-53: si el texto se normaliza como teléfono, busca por `telefono_e164`; si no, por nombre o apellido. Devuelve hasta 10 clientes del negocio, con nombre, apellido, teléfono y correo, sin los anonimizados. Solo lee. La lista de PAN-09 lo reutiliza en la Fase 7.
   * Archivos: `src/servidor/casos-uso/clientes.ts`, `src/servidor/db/repositorios/clientes.ts`, `tests/integracion/casos-uso/buscar-clientes.test.ts`
   * Depende de: T4.31
   * Refs: PAN-04, F-06, RN-01, RN-18, S-14, ARCH §6, §12; Q-53, Q-61
   * Aceptación:
      * "300 123 4567" encuentra al cliente `+573001234567`, y "pér" y "PÉR" encuentran a "Ana Pérez" (RN-18).
      * No devuelve clientes de otro negocio (RN-01) ni anonimizados (S-14). Un texto de menos de 2 caracteres devuelve una lista vacía.

* [x] T5.06: Caso de uso `consultarHorasDueno`
   * Objetivo: Implementar `consultarHorasDueno(ctx, { servicioId, fecha, citaExcluida }, ahora)`, que devuelve las horas libres de un servicio activo en un día local para el dueño (Q-56). Usa la sede principal, la misma `leerAgenda` de la consulta pública e `iniciosDisponibles` con actor `dueno`: sin anticipación y solo desde `ahora` (D-11). Con `citaExcluida`, la cita que se mueve no ocupa su propio cupo (RN-14). Solo lee.
   * Archivos: `src/servidor/casos-uso/horas-dueno.ts`, `tests/integracion/casos-uso/horas-dueno.test.ts`
   * Depende de: T5.03
   * Refs: PAN-04, PAN-05, F-06, F-07, RN-05, RN-09, RN-14, RN-15, D-11, ARCH §10, §18.4; Q-56
   * Aceptación:
      * Con 120 minutos de anticipación mínima, aparece una hora de dentro de 30 minutos que la consulta pública no ofrece. Nunca aparece una hora fuera del horario, bloqueada, sin cupo ni anterior a `ahora` (D-11, RN-15).
      * Un día después de la anticipación máxima tiene horas para el dueño (D-11). Un servicio inactivo o de otro negocio devuelve `NO_ENCONTRADO` (RN-05, RN-01).
      * Con `citaExcluida`, vuelven a aparecer la hora de esa cita y las que se solapan con ella (RN-14).

* [x] T5.07: Caso de uso `crearCitaManual`
   * Objetivo: Implementar `crearCitaManual(ctx, entrada, ahora)` (ARCH §18.4), que empieza con `requireEscritura`:
      1. valida con Zod el servicio, el inicio, el nombre, el apellido, un teléfono normalizable y el correo opcional (S-05; Q-53). Si algo falla, devuelve `DATOS_INVALIDOS` con los campos que fallaron, como Q-46 (TASKS-04);
      2. comprueba que el servicio esté activo en la sede principal y exige cupo de `max_appointments_per_month` (Q-54);
      3. con el núcleo de T5.03 y actor `dueno`, crea la cita `confirmada` con origen `panel`, sin consentimiento y con su código de reserva (D-28), y el evento `creada` con el dueño como actor;
      4. encola C-01 y C-02 solo si hay correo, y nunca C-05 (S-06).
   * Archivos: `src/servidor/casos-uso/cita-manual.ts`, `tests/integracion/casos-uso/cita-manual.test.ts`
   * Depende de: T5.04, T5.05
   * Refs: PAN-04, F-06, RN-11, RN-15, RN-18, RN-25, D-01, D-11, D-28, S-05, S-06, ARCH §11, §12, §18.4; Q-53, Q-54
   * Aceptación:
      * Una cita manual dentro de la anticipación mínima queda `confirmada`, con origen `panel`, un código con el prefijo del negocio y el evento `creada` con actor `dueno` y su `actor_id` (RN-15, D-11).
      * Una hora fuera del horario, bloqueada, desalineada o sin cupo devuelve `HORARIO_NO_DISPONIBLE` con sus motivos y no deja ninguna fila (D-01, RN-15).
      * Sin correo, no encola nada al cliente (S-05); con correo, encola C-01 y C-02; nunca C-05 (S-06). El mismo teléfono escrito en otro formato usa el cliente existente (RN-18).

* [x] T5.08: Caso de uso `moverCita`
   * Objetivo: Implementar `moverCita(ctx, { citaId, inicio, version }, ahora)` (ARCH §18.4), que empieza con `requireEscritura`. En una transacción:
      1. toma el bloqueo del recurso de la cita y la lee después del bloqueo;
      2. comprueba que esté `confirmada` (T5.01) y en la `version` esperada (`CONFLICTO_VERSION`; Q-55);
      3. evalúa la nueva hora con actor `dueno`, excluyendo la propia cita (RN-14, D-11);
      4. actualiza `inicio`, `fin` y `ocupado_hasta` de la misma fila y suma 1 a `version`, sin tocar `reprogramaciones_cliente` (D-20);
      5. anula el recordatorio y crea el de la nueva versión (T5.04), registra el evento `reprogramada` y encola C-04 si hay correo, sin C-06 (S-06; Q-60).

      Esta parte del núcleo queda lista para `reprogramarCita` (Fase 6).
   * Archivos: `src/servidor/casos-uso/agendar.ts`, `src/servidor/casos-uso/mover-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/mover-cita.test.ts`
   * Depende de: T5.01, T5.04
   * Refs: PAN-05, F-07, RN-11, RN-14, RN-15, RN-34, D-11, D-20, S-06, S-07, ARCH §11.2, §11.3, §14.1, §18.4; Q-55, Q-60
   * Aceptación:
      * Después de mover, la cita conserva su id, su código y su servicio, y no aparece otra cita. `version` sube en 1 y `reprogramaciones_cliente` no cambia (RN-14, RN-34, D-20).
      * Con capacidad 1, mover 15 minutos más tarde una cita de 30 minutos se acepta: la cita no ocupa su propio cupo (RN-14).
      * Una `version` vieja devuelve `CONFLICTO_VERSION`, una cita `cancelada` devuelve `ESTADO_INVALIDO`, y una hora no disponible, `HORARIO_NO_DISPONIBLE`. En los tres casos no cambia nada.

* [x] T5.09: Caso de uso `cancelarCita` (dueño)
   * Objetivo: Implementar la rama del dueño de `cancelarCita` (ARCH §18.4), que empieza con `requireEscritura`, no toma el bloqueo del recurso y no tiene plazo (RN-15). Con `UPDATE … WHERE estado = 'confirmada'` deja la cita `cancelada`, con `cancelada_en` y `cancelada_por = 'dueno'`; anula el recordatorio, registra el evento `cancelada` y encola C-03 si hay correo, sin C-06 (S-06). La rama del cliente, con el token y el plazo de RN-13, llega en la Fase 6.
   * Archivos: `src/servidor/casos-uso/cancelar-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/cancelar-cita.test.ts`
   * Depende de: T5.01, T5.04
   * Refs: PAN-06, F-07, RN-10, RN-15, S-06, S-08, ARCH §14.1, §18.4; Q-55, Q-60
   * Aceptación:
      * El dueño cancela una cita que empieza en una hora (RN-15): queda `cancelada` con `cancelada_por = 'dueno'`, su recordatorio pendiente pasa a `cancelada` y C-03 queda encolado con la clave `cancelacion:{citaId}`.
      * Cancelarla otra vez devuelve `ESTADO_INVALIDO` y no crea otro evento ni otra notificación (ARCH §18.4: dobles clics).

* [x] T5.10: Caso de uso `marcarAsistencia`
   * Objetivo: Implementar `marcarAsistencia(ctx, { citaId, estado, estadoEsperado }, ahora)` (ARCH §18.4), que empieza con `requireEscritura`. Con T5.02 rechaza el cambio antes del inicio (`ANTES_DEL_INICIO`), y con T5.01 acepta pasar de `confirmada` a `completada` o `no_asistio` y corregir entre esas dos (S-09). El cambio va con `WHERE estado = estadoEsperado` (Q-55) y deja su evento, sin correo (F-08, paso 5).
   * Archivos: `src/servidor/casos-uso/marcar-asistencia.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/marcar-asistencia.test.ts`
   * Depende de: T5.01, T5.02
   * Refs: PAN-07, F-08, RN-16, D-06, S-08, S-09, ARCH §18.4; Q-55
   * Aceptación:
      * Antes del inicio devuelve `ANTES_DEL_INICIO`; en el instante del inicio, marca (RN-16).
      * Pasar de `completada` a `no_asistio` deja el evento `estado_corregido`, y una cita `cancelada` devuelve `ESTADO_INVALIDO` (S-08, S-09). Un `estadoEsperado` que ya no es el actual devuelve `ESTADO_INVALIDO` y no cambia nada.
      * No encola ninguna notificación (F-08, paso 5).

### 5.C Lectura de la agenda

* [x] T5.11: Dominio: agenda
   * Objetivo: Crear `dominio/agenda.ts` con lo que necesitan las vistas (Q-52, Q-58): la semana de una fecha local (de lunes a domingo) y el paso a la anterior y a la siguiente; la agrupación de las citas por día local; y los espacios libres del día (Q-56), que son los inicios alineados a la granularidad dentro de las franjas que no se solapan con citas activas ni con bloqueos. Los espacios solo ayudan a abrir "Nueva cita": la hora la confirma T5.06.
   * Archivos: `src/dominio/agenda.ts`, `tests/unit/dominio/agenda.test.ts`
   * Depende de: T4.31
   * Refs: PAN-02, F-06, RN-03, RN-10, S-02, S-04, ARCH §9; Q-52, Q-56, Q-58
   * Aceptación:
      * La semana del 2026-10-22 (jueves) va del 2026-10-19 al 2026-10-25, y la siguiente empieza el 2026-10-26.
      * Una cita a las 7:00 p. m. del 14 de octubre en Bogotá (`2026-10-15T00:00:00Z`) se agrupa en el 2026-10-14 (RN-03; ARCH §9).
      * Con una franja de 8:00 a 10:00, granularidad de 30 minutos y una cita de 8:30 a 9:00, los espacios son 8:00, 9:00 y 9:30 (S-04). Una cita cancelada no quita espacios (RN-10).

* [x] T5.12: Caso de uso `listarAgenda`
   * Objetivo: Implementar `listarAgenda(ctx, desde, hasta)` para un rango de fechas locales de hasta 42 días (un mes con sus semanas completas). Devuelve las citas del negocio en el rango (ARCH §9, regla 2), con su id, código, inicio, fin, servicio, nombre del cliente (de la instantánea) y estado; los bloqueos que se solapan con el rango; y las franjas de la sede principal con la granularidad. Solo lee, así que funciona con el negocio suspendido (D-14).
   * Archivos: `src/servidor/casos-uso/agenda-panel.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/agenda-panel.test.ts`
   * Depende de: T5.11
   * Refs: PAN-02, RN-01, RN-03, RN-18, D-14, D-28, ARCH §6, §9; Q-52, Q-58
   * Aceptación:
      * Una cita a las 7:00 p. m. del 14 de octubre aparece al pedir el 14 y no al pedir el 15 (RN-03; ARCH §9, regla 2).
      * Trae las citas canceladas con su estado (Q-58) y nunca citas de otro negocio (RN-01). Un rango de más de 42 días, o que termina antes de empezar, devuelve `DATOS_INVALIDOS`.

* [x] T5.13: Dominio: historial de la cita
   * Objetivo: Crear `dominio/historial-cita.ts`, que convierte los eventos de una cita en las líneas del historial de PAN-03: qué pasó, quién lo hizo (el cliente, "tú" o el sistema) y cuándo, en la zona del negocio. En `reprogramada` muestra la hora anterior y la nueva, y un evento del sistema con `{ "automatica": true }` dice "Marcada automáticamente" (F-08, paso 4).
   * Archivos: `src/dominio/historial-cita.ts`, `tests/unit/dominio/historial-cita.test.ts`
   * Depende de: T5.01
   * Refs: PAN-03, F-08, RN-03, RNF-02, ARCH §18.2 (`evento_cita`); Q-55
   * Aceptación:
      * Un evento `reprogramada` del dueño con `inicio_anterior` e `inicio_nuevo` da una línea con las dos horas en hora de Colombia y formato de 12 horas (RN-03, RNF-02).
      * Un evento `completada` del sistema con `{ "automatica": true }` dice que se marcó automáticamente (F-08). Un evento de un tipo que no conoce no rompe el historial.

* [x] T5.14: Caso de uso `detalleCita`
   * Objetivo: Implementar `detalleCita(ctx, citaId, ahora)` (PAN-03): la cita con su código, servicio, hora, estado y `version`; el nombre, el teléfono y el correo con que se reservó (RN-18.3); el historial (T5.13); y las acciones que permite en ese momento: mover y cancelar si está `confirmada`, marcar la asistencia desde el inicio (T5.01, T5.02), y ninguna con el negocio suspendido (D-14). Solo lee.
   * Archivos: `src/servidor/casos-uso/detalle-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/detalle-cita.test.ts`
   * Depende de: T5.10, T5.13
   * Refs: PAN-03, PAN-05 a PAN-07, RN-01, RN-16, RN-18, D-14, S-08, ARCH §6; Q-55, Q-61
   * Aceptación:
      * Una cita de otro negocio o un id que no es un uuid devuelven `NO_ENCONTRADO` (RN-01; ARCH §6, defensa 3).
      * Antes del inicio, las acciones no incluyen la asistencia; desde el inicio, sí (RN-16). Una cita cancelada no tiene acciones (S-08). Con el negocio suspendido, el detalle se lee y no tiene acciones (D-14).

* [x] T5.15: Búsqueda por código de reserva
   * Objetivo: Agregar `normalizarCodigo` a `dominio/codigo-reserva.ts` (recorta, pasa a mayúsculas y agrega el guion si falta) e implementar `buscarCitaPorCodigo(ctx, texto)`, que devuelve el id de la cita del negocio con ese código (D-28; Q-59). Solo lee.
   * Archivos: `src/dominio/codigo-reserva.ts`, `tests/unit/dominio/codigo-reserva.test.ts`, `src/servidor/casos-uso/detalle-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `tests/integracion/casos-uso/detalle-cita.test.ts`
   * Depende de: T5.14
   * Refs: D-28, RN-01, ARCH §6, §11.4; Q-41 (TASKS-04), Q-59
   * Aceptación:
      * " ov-4821 " y "OV4821" se normalizan como `OV-4821`, y un texto que no puede ser un código (Q-41, TASKS-04) se rechaza sin consultar la base.
      * El código de una cita de otro negocio devuelve `NO_ENCONTRADO` (RN-01).

### 5.D Panel: navegación y agenda (PAN-02 a PAN-07)

* [x] T5.16: Layout y navegación del panel
   * Objetivo: Llevar el layout del panel y su navegación a DESIGN §4.3 y §7 con los tokens (Q-44, TASKS-04; Q-57): encabezado con el mosaico del logo y el nombre del negocio; navegación lateral fija en escritorio y horizontal con desplazamiento en móvil; y las entradas Inicio, Bloqueos y Configuración. El aviso de suscripción (PAN-19) usa el aviso de DESIGN §3. Se quitan los colores de la Fase 1 y las variantes `dark:` de estos archivos.
   * Archivos: `src/app/(panel)/layout.tsx`, `src/componentes/panel/navegacion.tsx`, `src/componentes/panel/aviso-suscripcion.tsx`, `tests/unit/componentes/aviso-suscripcion.test.ts`
   * Depende de: T4.31
   * Refs: PAN-01, PAN-19, RN-32, RNF-01, RNF-03, D-14, D-24, DESIGN §2, §3, §4.3, §6, §7; Q-44 (TASKS-04), Q-57
   * Aceptación (manual, en local):
      * A 360 px la navegación se desplaza en horizontal sin desplazar la página, y la página actual lleva `aria-current` además del estilo (RNF-03).
      * No aparecen "Profesionales" ni la palabra "sede" (D-24, RN-32). El cierre de sesión y el cambio de contraseña siguen en `<UserButton/>` (PAN-01).
      * En gracia y suspendido, el aviso muestra su texto y su fecha como antes, y su prueba unitaria pasa (PAN-19).

* [x] T5.17: Detalle de la cita
   * Objetivo: Crear `/panel/citas/{id}` con `detalleCita` (PAN-03): el código en monoespaciada (DESIGN §2.2), el badge de estado, el servicio, la fecha y la hora, el cliente con sus enlaces de contacto (WhatsApp, teléfono y correo de T4.06) y el historial. Responde 404 con `NO_ENCONTRADO`. Deja el lugar de las acciones de T5.21 y T5.22.
   * Archivos: `src/app/(panel)/panel/citas/[id]/page.tsx`, `src/componentes/panel/historial-cita.tsx`
   * Depende de: T5.14, T5.16
   * Refs: PAN-03, RN-01, RN-03, RNF-02, RNF-03, D-28, DESIGN §3, §4.3; Q-61
   * Aceptación (manual, en local):
      * Una cita reservada en la página pública muestra su código, su hora en hora de Colombia y la línea "Reservada por el cliente" en el historial.
      * El id de una cita de otro negocio responde 404 (RN-01). El enlace de WhatsApp abre `https://wa.me/…` con el teléfono de la cita.

* [x] T5.18: Vista de día
   * Objetivo: Crear `/panel/agenda` con la vista de día (PAN-02; Q-52, Q-58) y agregar "Agenda" a la navegación:
      * la fecha en la URL, con "Anterior", "Hoy" y "Siguiente";
      * las citas del día por hora, con su código, servicio, cliente y badge de estado, y cada una con enlace a su detalle;
      * los bloqueos del día, solo para leer;
      * los espacios libres de T5.11, cada uno con enlace a "Nueva cita" con su fecha y hora (F-06);
      * el estado vacío "No tienes citas hoy." (DESIGN §5), el botón "Nueva cita" y el campo "Buscar por código" (T5.15), que abre el detalle.
   * Archivos: `src/app/(panel)/panel/agenda/page.tsx`, `src/app/(panel)/panel/agenda/acciones.ts`, `src/componentes/panel/agenda-dia.tsx`, `src/componentes/panel/navegacion.tsx`
   * Depende de: T5.12, T5.15, T5.17
   * Refs: PAN-02, F-06, RN-03, RNF-02, RNF-03, D-28, DESIGN §3, §4.3, §5; Q-52, Q-56, Q-58, Q-59
   * Aceptación (manual, en local):
      * Una reserva hecha en la página pública aparece en su día y su hora de Colombia, también con el dispositivo en otra zona horaria (RN-03).
      * Un día con un bloqueo de día completo muestra el bloqueo y no ofrece espacios. Una cita cancelada se distingue por su badge, no solo por el color (RNF-03).
      * Buscar el código de una cita abre su detalle, y un código que no existe muestra "No encontramos una cita con ese código.".

* [x] T5.19: Vista de semana
   * Objetivo: Agregar a `/panel/agenda` la vista de semana (PAN-02; Q-52), de lunes a domingo, con "Anterior", "Esta semana" y "Siguiente". En escritorio muestra una columna por día; en móvil, una lista por día. Cada cita lleva a su detalle y cada día a su vista de día.
   * Archivos: `src/app/(panel)/panel/agenda/page.tsx`, `src/componentes/panel/agenda-semana.tsx`
   * Depende de: T5.18
   * Refs: PAN-02, RN-03, RNF-01, DESIGN §4.3, §7; Q-52, Q-58
   * Aceptación (manual, en local):
      * Con citas en dos días de la semana, cada una aparece en su día y a su hora. Al recargar se conservan la vista y la semana (Q-58).
      * A 360 px no hay desplazamiento horizontal de la página (RNF-01).

* [x] T5.20: Nueva cita
   * Objetivo: Crear `/panel/citas/nueva` (PAN-04, F-06), con la fecha y la hora opcionales en la URL (T5.18):
      * el cliente: buscar por teléfono o nombre (T5.05) y elegir uno, lo que llena los datos, o escribir uno nuevo, con el correo opcional y la ayuda "Sin correo, el cliente no recibe confirmación ni recordatorio" (S-05);
      * el servicio, entre los activos;
      * el día, con "Anterior" y "Siguiente", y las horas libres de ese servicio (T5.06), en un selector de hora (DESIGN §3);
      * "Guardar" con `crearCitaManual`. Con `HORARIO_NO_DISPONIBLE` muestra "Esa hora ya no está disponible" y recarga las horas sin perder los datos (F-06, paso 5); con éxito, lleva al detalle de la cita.
   * Archivos: `src/app/(panel)/panel/citas/nueva/page.tsx`, `src/app/(panel)/panel/citas/nueva/formulario.tsx`, `src/app/(panel)/panel/citas/nueva/acciones.ts`, `src/componentes/panel/horas-dueno.tsx`
   * Depende de: T5.07, T5.18
   * Refs: PAN-04, F-06, RN-15, D-01, D-11, S-05, RNF-03, DESIGN §3, §4.3; Q-53, Q-54, Q-56
   * Aceptación (manual, en local):
      * El dueño busca un cliente existente por teléfono, elige un servicio y una hora dentro de la anticipación mínima, guarda y llega al detalle con el código de la cita (F-06, D-11).
      * Con dos pestañas sobre la misma hora, la segunda en guardar ve "Esa hora ya no está disponible", con las horas actualizadas y sus datos intactos (F-06, paso 5; D-01).
      * Desde un espacio libre de la vista de día, el formulario abre en esa fecha y, si el servicio tiene libre esa hora, con ella elegida. Con el negocio suspendido, el formulario aparece deshabilitado (D-14).

* [x] T5.21: Mover la cita
   * Objetivo: Agregar al detalle la acción "Mover" (PAN-05, F-07): el día y las horas libres del mismo servicio sin contar la propia cita (T5.06 con `citaExcluida`), y "Confirmar cambio" con `moverCita` y la `version` que se mostró. Con `CONFLICTO_VERSION` avisa que la cita cambió y recarga el detalle; con `HORARIO_NO_DISPONIBLE`, recarga las horas.
   * Archivos: `src/app/(panel)/panel/citas/[id]/page.tsx`, `src/app/(panel)/panel/citas/[id]/mover.tsx`, `src/app/(panel)/panel/citas/[id]/acciones.ts`
   * Depende de: T5.08, T5.20
   * Refs: PAN-05, F-07, RN-14, RN-15, D-11, S-07, DESIGN §4.3; Q-55, Q-56
   * Aceptación (manual, en local):
      * El dueño mueve una cita a otra hora del mismo día y a otro día. El historial muestra la hora anterior y la nueva, y la hora anterior vuelve a ofrecerse en la página pública (RN-14).
      * Con el detalle abierto en dos pestañas, mover en una y después en la otra muestra el aviso de que la cita cambió, sin mover nada (Q-55).

* [ ] T5.22: Cancelar y marcar la asistencia
   * Objetivo: Agregar al detalle las acciones de PAN-06 y PAN-07: "Cancelar cita" con la confirmación en dos pasos de DESIGN §3 ("¿Cancelar la cita?" y "Sí, cancelar"), y, desde el inicio, "Asistió" y "No asistió", con la corrección entre las dos (S-09). Después de cada acción, el foco va al aviso del resultado.
   * Archivos: `src/app/(panel)/panel/citas/[id]/page.tsx`, `src/app/(panel)/panel/citas/[id]/acciones-estado.tsx`, `src/app/(panel)/panel/citas/[id]/acciones.ts`
   * Depende de: T5.09, T5.10, T5.17
   * Refs: PAN-06, PAN-07, F-07, F-08, RN-10, RN-15, RN-16, S-09, RNF-03, DESIGN §3, §6; Q-55
   * Aceptación (manual, en local):
      * Antes del inicio no aparecen "Asistió" ni "No asistió"; después, sí, y el dueño puede corregir lo que marcó (RN-16, S-09).
      * Al cancelar, la hora vuelve a ofrecerse en la página pública (RN-10) y el detalle muestra "Cancelada" sin acciones (S-08).

* [ ] T5.23: Vista de mes (recortable)
   * Objetivo: Agregar a `/panel/agenda` la vista de mes (PAN-02), con las semanas de `dominio/calendario.ts` (T4.21) y, en cada día, el número de citas activas, con enlace a su vista de día (Q-58). Es lo primero que se recorta si el plazo aprieta (PRD §4.3; Q-52).
   * Archivos: `src/app/(panel)/panel/agenda/page.tsx`, `src/componentes/panel/agenda-mes.tsx`
   * Depende de: T5.19
   * Refs: PAN-02, RN-10, RNF-03, PRD §4.3, DESIGN §3; Q-52, Q-58
   * Aceptación (manual, en local):
      * Octubre de 2026 empieza en jueves y muestra cada día con su número de citas activas; las canceladas no cuentan (RN-10).
      * Cada día abre su vista de día, y el número no depende solo del color (RNF-03).

### 5.E Panel: revisión del resto de las pantallas (DESIGN §4.3)

* [ ] T5.24: Inicio del panel
   * Objetivo: Revisar `/panel` según DESIGN §4.3 (F-05, PAN-18): "Prepara tu negocio" con la lista de verificación y los badges "Listo" y "Falta" (DESIGN §3), el enlace a la página pública con "Ver página", y una tarjeta "Hoy" con las citas del día (T5.12) y el enlace a la agenda. Sin citas, "No tienes citas hoy." (DESIGN §5).
   * Archivos: `src/app/(panel)/panel/page.tsx`
   * Depende de: T5.18
   * Refs: F-05, PAN-02, PAN-18, RN-32, DESIGN §3, §4.3, §5; Q-22 (TASKS-02), Q-44 (TASKS-04)
   * Aceptación (manual, en local):
      * Sin servicios activos o sin horario, la lista marca "Falta" y el aviso de PAN-18 sigue apareciendo; con ambos, "Listo" (Q-22, TASKS-02).
      * La tarjeta "Hoy" lista las citas de hoy en hora de Colombia, y cada una abre su detalle.

* [ ] T5.25: Pantallas de configuración y de bloqueos
   * Objetivo: Revisar cada pantalla por su PAN-xx con los tokens y los componentes de DESIGN (Q-44, TASKS-04): Negocio (PAN-11), Servicios (PAN-12, sin eliminar ni profesional; con el buffer de D-02), Consultorio (PAN-13), Horario (PAN-14), Reglas de reserva (PAN-15), Recordatorios (PAN-16), Política de datos (PAN-17) y Bloqueos (PAN-08). En Bloqueos, la lista vacía dice "No hay bloqueos próximos." (DESIGN §5) y, ante `BLOQUEO_CON_CITAS`, cada cita enlaza a su detalle para moverla o cancelarla primero (F-09). No cambia ningún comportamiento.
   * Archivos: los `page.tsx` y `formulario.tsx` de `src/app/(panel)/panel/configuracion/` y de `src/app/(panel)/panel/bloqueos/`
   * Depende de: T5.17, T5.24
   * Refs: PAN-08, PAN-11 a PAN-17, F-09, D-02, D-15, D-24, RN-32, RNF-03, DESIGN §3, §4.3, §5; Q-44 (TASKS-04)
   * Aceptación:
      * `rg "dark:|teal-|zinc-|emerald-|amber-" "src/app/(panel)" src/componentes/panel` no encuentra nada (Q-44, TASKS-04).
      * Pasan sin cambios las pruebas de solo lectura y multi-negocio del panel (T2.40, T2.41, T4.29).
      * Manual: un bloqueo nuevo sobre una cita confirmada lista esa cita con un enlace a su detalle (F-09).

### 5.F Pruebas y cierre

Pruebas de integración contra la rama efímera de Neon, con los casos de ARCH §20 y los criterios de aceptación de las RN que esta fase hace posibles. Cada caso cita su origen.

* [ ] T5.26: Pruebas de los estados y la asistencia
   * Objetivo: Probar con las operaciones del dueño los criterios de las RN sobre los estados de la cita.
   * Archivos: `tests/integracion/casos-uso/estados-cita-reglas.test.ts`
   * Depende de: T5.09, T5.10
   * Refs: RN-12, RN-16, S-08, S-09, PRD §7
   * Aceptación (una prueba por caso; todas pasan):
      * Toda cita creada en el panel queda `confirmada`, y ninguna operación del dueño lleva a `pendiente_pago` (RN-12).
      * Antes del inicio, marcar la asistencia se rechaza; después del inicio, se aplica (RN-16).
      * Una cita cancelada no se reactiva: marcarla, moverla o cancelarla otra vez devuelve `ESTADO_INVALIDO` (S-08).
      * El dueño corrige una cita de `completada` a `no_asistio` y de vuelta (S-09).

* [ ] T5.27: Pruebas de la cita manual y del movimiento
   * Objetivo: Probar los criterios de RN-14, RN-15 y RN-34 con `crearCitaManual` y `moverCita`.
   * Archivos: `tests/integracion/casos-uso/cita-manual-reglas.test.ts`
   * Depende de: T5.07, T5.08
   * Refs: RN-14, RN-15, RN-25, RN-34, D-01, D-11, D-20, S-05, S-06, ARCH §20 (Asistencia por defecto)
   * Aceptación (una prueba por caso; todas pasan):
      * El dueño crea una cita para dentro de 30 minutos aunque la anticipación mínima sea de 2 horas (RN-15).
      * Al crear o mover una cita fuera del horario, sobre un bloqueo, desalineada o sin capacidad, recibe `HORARIO_NO_DISPONIBLE` y la cita no se guarda (RN-15, D-01).
      * Después de mover, la cita conserva su identificador y no aparece ninguna cita nueva; la validación no la cuenta en su propio cupo anterior (RN-14).
      * Si el dueño mueve la cita, el cliente conserva las reprogramaciones que le quedan (RN-34; ARCH §20: "`moverCita` no suma reprogramaciones del cliente").
      * Con `max_appointments_per_month` alcanzado, una cita manual devuelve `LIMITE_PLAN` y no crea nada (RN-25; Q-54).
      * Ninguna acción del dueño encola avisos `dueno_*` (S-06), y una cita sin correo no encola notificaciones al cliente (S-05).

* [ ] T5.28: Pruebas de la ocupación y de las notificaciones
   * Objetivo: Probar con las operaciones reales, y ya no por SQL (T3.24), la ocupación de D-06, y probar las notificaciones de los cambios.
   * Archivos: `tests/integracion/casos-uso/cambios-dueno.test.ts`
   * Depende de: T5.06, T5.08, T5.09, T5.10
   * Refs: RN-10, RN-21, D-06, S-12, ARCH §14.1, §20 (Ocupación, Notificaciones); Q-60
   * Aceptación (una prueba por caso; todas pasan):
      * Una cita cancelada con `cancelarCita` libera su cupo de inmediato: la hora vuelve a ofrecerse y se puede reservar (RN-10).
      * Con capacidad 1, una cita de 9:00 de 30 minutos con 10 de buffer marcada `completada` a las 9:10 sigue ocupando el recurso: para el dueño, a las 9:10, la siguiente hora libre es la primera alineada desde las 9:40 (RN-10, D-06).
      * El recordatorio se anula al cancelar y se rehace al mover, con la clave de la nueva versión (ARCH §20, Notificaciones). Si el nuevo momento del recordatorio ya pasó, no se crea (S-12).
      * Mover encola C-04 con la clave `reprogramacion:{citaId}:v2` y la hora anterior en `datos`, y cancelar encola C-03 con `cancelacion:{citaId}` (ARCH §14.1; Q-60).

* [ ] T5.29: Pruebas de concurrencia del panel
   * Objetivo: Probar RN-11 en las operaciones del dueño que toman el bloqueo del recurso (ARCH §11.3).
   * Archivos: `tests/integracion/casos-uso/panel-concurrencia.test.ts`
   * Depende de: T5.07, T5.08
   * Refs: RN-11, ADR-04, ARCH §11.3, §18.4, §20 (Concurrencia)
   * Aceptación (una prueba por caso; todas pasan):
      * Con 10 citas manuales simultáneas por el último cupo de un recurso de capacidad 1, entra exactamente una; las demás reciben `HORARIO_NO_DISPONIBLE` (RN-11).
      * Una cita manual y una reserva pública lanzadas a la vez por el último cupo: entra solo una (RN-11).
      * Mover una cita a una hora mientras una reserva pide la misma hora: entra solo una de las dos (ARCH §20: "lo mismo al reprogramar contra una reserva", aquí con `moverCita`; la de `reprogramarCita` va en la Fase 6).
      * Dos movimientos simultáneos de la misma cita con la misma `version`: uno se aplica y el otro devuelve `CONFLICTO_VERSION` (ARCH §18.4).

* [ ] T5.30: Pruebas multi-negocio y de solo lectura
   * Objetivo: Probar las Server Actions y las lecturas de esta fase con identificadores de otro negocio y con el negocio suspendido.
   * Archivos: `tests/integracion/app/panel/multi-negocio.test.ts`, `tests/integracion/app/panel/solo-lectura.test.ts`
   * Depende de: T5.22, T5.25
   * Refs: RN-01, RN-04, D-14, ARCH §6, §20 (Multi-negocio, Suscripción)
   * Aceptación (una prueba por caso; todas pasan):
      * Desde la sesión de A, ver, mover, cancelar o marcar una cita de B devuelve `NO_ENCONTRADO`, y la cita de B no cambia. `buscarClientes` y la búsqueda por código no devuelven datos de B (RN-01).
      * Con el negocio suspendido, crear una cita manual, moverla, cancelarla o marcarla devuelve `NEGOCIO_SUSPENDIDO` y no cambia nada (RN-04, D-14).
      * Con el negocio suspendido, la agenda, el detalle, la búsqueda de clientes y las horas libres se siguen leyendo (ARCH §20: "se puede consultar").

* [ ] T5.31: Revisión de accesibilidad y móvil del panel
   * Objetivo: Recorrer la agenda, el detalle, la cita manual y el inicio en móvil y con el teclado, y corregir lo que falle. Los arreglos van en el commit de esta tarea.
   * Archivos: los que haya que corregir en `src/app/(panel)/` y `src/componentes/panel/`
   * Depende de: T5.23, T5.25
   * Refs: RNF-01, RNF-02, RNF-03, RN-03, DESIGN §6, §7; riesgo de Clerk en `http://localhost` (ARCH §23)
   * Aceptación (manual, en el Worker, porque las pantallas necesitan sesión; ARCH §23):
      * A 360 px no hay desplazamiento horizontal en ninguna pantalla del panel, y las áreas táctiles miden al menos 44 px (RNF-01; DESIGN §6).
      * Una cita manual completa se crea solo con el teclado, con el foco visible en cada control. Lighthouse no informa errores de etiquetas, contraste ni nombres de botones en `/panel/agenda`, `/panel/citas/nueva` y el detalle de una cita (RNF-03).

* [ ] T5.32: Despliegue y verificación de la fase
   * Objetivo: Desplegar la fase en el plan gratuito de Workers (Q-36, TASKS-03) y recorrer el panel en `*.workers.dev` con el negocio de prueba.
   * Archivos: — (el commit anota el tamaño del Worker y el CPU medido)
   * Depende de: T5.26–T5.31
   * Refs: RNF-07, RNF-09, D-14, ARCH §21.4, §23; Q-36 (TASKS-03)
   * Aceptación:
      * `npm run deploy` termina sin errores y sin migraciones pendientes, y el tamaño del Worker queda anotado en el commit.
      * En el Worker, el dueño crea una cita manual dentro de la anticipación mínima, la ve en las vistas de día y de semana, la mueve, la busca por su código, marca la asistencia de otra que ya empezó y cancela una tercera. Las horas liberadas vuelven a la página pública, y en `production` quedan pendientes C-01, C-03 y C-04 (Q-60).
      * El admin suspende el negocio: la agenda y el detalle se ven, sin acciones (D-14). Después registra el pago y las acciones vuelven.
      * El CPU del render de `/panel/agenda` y de `moverCita`, medido con `wrangler tail`, queda anotado frente a los 10 ms del plan gratuito (Q-36).

---

## Preguntas

Puntos que el PRD, ARCHITECTURE y DESIGN no definían. Todas quedaron resueltas el 2026-10-22, con el supuesto que se había propuesto. Las que cambian contratos u operaciones (Q-54, Q-55, Q-56 y Q-60) quedaron en ARCH §14.1, §18.2 y §18.4 (v0.13), junto con las lecturas nuevas del panel (Q-53, Q-58 y Q-59), como se hizo con Q-19 (TASKS-02). Siguen vigentes, y aplican a esta fase, Q-20 y Q-24 de [TASKS-02](TASKS-02.md#preguntas); Q-28, Q-29 y Q-36 de [TASKS-03](TASKS-03.md#preguntas); y Q-41, Q-44 y Q-46 de [TASKS-04](TASKS-04.md#preguntas).

| ID | Pregunta | Decisión | Afecta a |
|---|---|---|---|
| Q-52 | PAN-02 pide vistas de día, semana y mes, y PRD §4.3 solo deja recortable la de mes. DESIGN §9 propone construir solo la de día. ¿Cuáles se construyen? | **Resuelta (2026-10-22):** Prevalece el PRD: día (la vista de entrada) y semana. La de mes va al final de la agenda (T5.23) y es lo primero que se recorta si el plazo aprieta (PRD §4.3). Arrastrar citas (F-07, "si da el tiempo") no entra: queda para el colchón. | Alcance, T5.11, T5.18, T5.19, T5.23 |
| Q-53 | F-06 pide buscar un cliente por teléfono o nombre, o escribir uno nuevo, con el correo opcional (S-05). ¿El teléfono es obligatorio? ¿El servidor usa el cliente elegido o vuelve a resolver la identidad? ¿Cómo se busca? | **Resuelta (2026-10-22):** El teléfono es obligatorio: la identidad se busca primero por teléfono (RN-18.1), y `cliente` exige teléfono o correo. Elegir un cliente solo llena el formulario: el servidor recibe nombre, apellido, teléfono y correo, y resuelve el cliente con `clientes.resolver` (RN-18; ARCH §12), igual que la reserva, sin confiar en un id de cliente que llega del navegador (ARCH §6). La búsqueda: si el texto se normaliza como teléfono, por `telefono_e164` exacto; si no, por nombre o apellido que contengan el texto, sin distinguir mayúsculas (sin quitar tildes). Desde 2 caracteres, hasta 10 resultados y sin anonimizados (S-14). La Fase 7 la reutiliza en PAN-09. | T5.05, T5.07, T5.20 |
| Q-54 | ARCH §18.4 no dice si la cita manual lleva código de reserva ni si cuenta para `max_appointments_per_month`, y solo le da los errores `HORARIO_NO_DISPONIBLE` y `NEGOCIO_SUSPENDIDO`. | **Resuelta (2026-10-22):** Lleva código, porque D-28 lo da a "cada cita", con el prefijo del nombre del negocio. Cuenta y exige cupo de `max_appointments_per_month`, como la pública (RN-25; ARCH §16.3: "citas creadas en el mes"; Q-29, TASKS-03). Errores de `crearCitaManual`: `DATOS_INVALIDOS` (con `campos`, como Q-46 de TASKS-04), `NO_ENCONTRADO` (servicio inactivo o de otro negocio), `HORARIO_NO_DISPONIBLE` (con los motivos), `LIMITE_PLAN` y `NEGOCIO_SUSPENDIDO`. `moverCita` suma `NO_ENCONTRADO` y `ESTADO_INVALIDO` a los suyos. | T5.07, T5.08, T5.27 |
| Q-55 | ARCH §18.2 define los tipos de `evento_cita` y dice que `datos` no lleva datos personales, pero no fija qué lleva cada tipo. Tampoco dice qué estados se pueden mover o cancelar, ni cómo se detecta un doble clic en la asistencia. | **Resuelta (2026-10-22):** **Eventos:** `creada`, `cancelada`, `completada` y `no_asistio` llevan `{}`; con el sistema, `completada` y `no_asistio` llevan `{ "automatica": true }` (ARCH §14.4). `reprogramada` lleva `{ "inicio_anterior", "inicio_nuevo" }` en ISO UTC, y `estado_corregido`, `{ "de", "a" }`. Con el dueño, `actor_id` es su `clerk_user_id`. **Estados:** solo se mueven y se cancelan citas `confirmada` (PRD §7), aunque ya hayan empezado; la nueva hora debe ser posterior a `ahora` (D-11). Una cita `completada` o `no_asistio` no se mueve: se corrige su asistencia. **Dobles clics:** las acciones envían el estado que vio el dueño (`estadoEsperado`) y, al mover, la `version`. Si cambiaron, la respuesta es `ESTADO_INVALIDO` o `CONFLICTO_VERSION` y la pantalla se recarga (ARCH §18.4). | T5.01, T5.03, T5.08–T5.10, T5.13, T5.14, T5.21, T5.22 |
| Q-56 | La consulta de horas libres del dueño no tiene contrato: la API pública recorta a la anticipación y no admite al dueño (ARCH §18.5). ¿Cómo se consultan? ¿Y qué hace "clic en un espacio libre" (F-06) si las horas libres dependen del servicio? | **Resuelta (2026-10-22):** `consultarHorasDueno` es un caso de uso de lectura (`requireMiembro`) que se llama con una Server Action, un día local por consulta, con la sede principal y actor `dueno`: sin anticipación máxima y solo desde `ahora` (D-11). Los espacios libres de la vista de día (T5.11) se calculan sin servicio, con las franjas, la granularidad, las citas activas y los bloqueos: solo abren "Nueva cita" con esa fecha y esa hora. La hora se confirma con las horas libres del servicio elegido (T5.06); si no está, el formulario lo dice y muestra las demás. | T5.06, T5.11, T5.18, T5.20, T5.21 |
| Q-57 | DESIGN §4.3 lista las pestañas Inicio, Agenda, Bloqueos, Clientes, Servicios, Profesionales, Reglas y horario, Política de datos, Mi calendario y Marca y sedes. Varias son de otras fases o contradicen el PRD. | **Resuelta (2026-10-22):** En esta fase: Inicio, Agenda, Bloqueos y el grupo Configuración (Negocio, Servicios, Consultorio, Horario, Reglas de reserva, Recordatorios y Política de datos), con las rutas actuales. Clientes llega en la Fase 7 y Mi calendario en la Fase 6. Profesionales no aparece (D-17, D-24). "Marca y sedes" sigue como "Negocio", porque el panel no muestra el concepto de sede (RN-32). En móvil, la navegación horizontal con desplazamiento (DESIGN §7) reemplaza el botón "Menú" de T2.05. | T5.16, T5.18 |
| Q-58 | PAN-02 no dice qué muestra la agenda además de las citas activas, ni cómo se conserva la vista al navegar. | **Resuelta (2026-10-22):** Las vistas de día y de semana muestran todas las citas del rango, también las canceladas con su badge "Cancelada", y los bloqueos, solo para leer. La de mes cuenta solo las citas activas (RN-10). Se pueden ver los días pasados. La URL lleva `?vista=dia\|semana\|mes&fecha=AAAA-MM-DD`, para que recargar o compartir conserve la vista; sin parámetros, abre el día de hoy en la zona del negocio. | T5.11, T5.12, T5.18, T5.19, T5.23 |
| Q-59 | D-28 dice que el cliente usa el código al llamar al negocio, pero ningún PAN-xx dice dónde lo busca el dueño. | **Resuelta (2026-10-22):** Un campo "Buscar por código" en la agenda. Recorta, pasa a mayúsculas y agrega el guion si falta; busca el código exacto dentro del negocio y lleva al detalle de la cita. No es una credencial (ARCH §11.4): solo identifica la cita. | T5.15, T5.18 |
| Q-60 | La Fase 3 encola C-01, C-02 y C-05 de la reserva (Q-28, TASKS-03). ¿Qué encolan los cambios del dueño, con qué claves y con qué datos? | **Resuelta (2026-10-22):** Se encolan, sin envío hasta la Fase 6, al correo con que se reservó la cita (S-15) y solo si existe (S-05): C-01 y C-02 en la cita manual; al mover, C-04 (`reprogramacion:{citaId}:v{version}`, con `{ "version", "inicio_anterior" }` en `datos`) y el recordatorio de la nueva versión; al cancelar, C-03 (`cancelacion:{citaId}`). Mover y cancelar anulan el recordatorio pendiente. Nunca `dueno_*` (S-06). | T5.04, T5.07–T5.09, T5.28, T5.32 |
| Q-61 | ARCH §4 solo ubica `(panel)/panel/…`. ¿Dónde van las rutas y los archivos nuevos? | **Resuelta (2026-10-22):** Rutas: `/panel/agenda` (con la vista y la fecha en la URL; Q-58), `/panel/citas/nueva` (con `fecha` y `hora` opcionales) y `/panel/citas/{id}`. Archivos: `src/dominio/{estados-cita, plazos, agenda, historial-cita}.ts`; `src/servidor/casos-uso/{agendar, cita-manual, mover-cita, cancelar-cita, marcar-asistencia, horas-dueno, agenda-panel, detalle-cita, clientes}.ts`; y los componentes del panel en `src/componentes/panel/`. `buscarCitaPorCodigo` va en `detalle-cita.ts`, y `normalizarCodigo`, en `dominio/codigo-reserva.ts`. | Casi todas las tareas |
