# Agenda de citas (SaaS) — Tareas de la Fase 3

| | |
|---|---|
| **Versión** | 0.1 (borrador) |
| **Fecha** | 2026-10-16 |
| **Fuentes** | [PRD.md](PRD.md) v0.7 · [ARCHITECTURE.md](ARCHITECTURE.md) v0.9 · [TASKS-02.md](TASKS-02.md) |

> El PRD manda en el **qué** y ARCHITECTURE en el **cómo**. Si una tarea contradice a alguno de los dos, se corrige la tarea. El formato de las tareas, sus marcas y la definición de terminado están en [TASKS-00](TASKS-00.md). Lo que los documentos no definen está en [Preguntas](#preguntas): las nuevas siguen la numeración de TASKS-02 (desde Q-27), y las anteriores se citan con su documento, como "Q-17 (TASKS-01)".

## Fase 3: motor de disponibilidad y reserva transaccional

### Alcance

**Entra:**

- El motor de disponibilidad puro, `dominio/disponibilidad.ts`, con `evaluarInicio` e `iniciosDisponibles` (RN-07 a RN-10, D-11, D-12, S-02 y S-04).
- La identidad del cliente (RN-18, RN-19), adelantada desde la Fase 7 porque la reserva la necesita dentro de su transacción (Q-27).
- La consulta de disponibilidad y la reserva transaccional con bloqueo por recurso (RN-11), con sus contratos HTTP de ARCH §18.5.
- Las notificaciones de la reserva en la bandeja de salida, sin envío (Q-28).
- Las pruebas de ARCH §20 que dependen del motor y quedaron pendientes en la Fase 2: un bloqueo y una reserva simultáneos, los bloqueos por sede y las sobrescrituras de duración.

**No entra:**

- La página pública (Fase 4). Aquí solo se construyen los contratos HTTP que esa página va a usar.
- `crearCitaManual` y `moverCita` (Fase 5), y `reprogramarCita` y `cancelarCita` por link (Fase 6). El núcleo de la transacción ya acepta una cita que se excluye de la ocupación (RN-14), para que esas fases lo reutilicen. La prueba de concurrencia "al reprogramar contra una reserva" (ARCH §20) va con `reprogramarCita`.
- El envío de correos y el procesador de la bandeja de salida (Fase 6).
- El límite de frecuencia de la API pública (RN-23), que PRD §12 deja para la Fase 8 (Q-35).
- El motor con varios recursos y la asignación de empleados (ARCH §10.3, D-17).

**Criterio de salida:** T3.33, el despliegue y la verificación de la fase en el Worker.

### Convenciones de la fase

- La decisión de si una hora es reservable vive en un solo lugar, `dominio/disponibilidad.ts`. La consulta y la reserva usan el mismo `ContextoAgenda`, que arma la misma función (T3.14). Así, lo que no se ofrece tampoco se puede reservar (RN-09, ARCH §10).
- Los casos de uso públicos resuelven el negocio por el slug (ARCH §6), comprueban el estado efectivo de la suscripción antes de hacer nada (ARCH §7.6) y reciben `ahora` como parámetro (ARCH §20).
- En el MVP, cada oferta (un servicio en una sede) tiene un solo recurso activo, el consultorio (ARCH §10.3).
- Las rutas `/api/publico/…` son adaptadores delgados: JSON de entrada y de salida, y los errores con el formato y los códigos HTTP de ARCH §18.5.
- El Worker quedó en 2978,61 KiB comprimidos en T2.42, a unos 93 KiB del límite del plan gratuito, y esta fase suma `libphonenumber-js`. Por Q-17 (TASKS-01), resuelta, la cuenta pasa a Workers Paid (T3.32) antes del despliegue de la fase (T3.33).
- Las rutas y los archivos nuevos que ARCH §4 no ubica están en Q-34.

### 3.A Motor de disponibilidad (dominio)

Funciones puras con su prueba unitaria en la misma tarea. Las tareas de este módulo cubren la suite `dominio/disponibilidad` de ARCH §20, y las dos tareas de cierre prueban los criterios de aceptación de RN-07, RN-08 y RN-10.

* [x] T3.01: Calendario local en `dominio/tiempo.ts`
   * Objetivo: Añadir a `dominio/tiempo.ts` las operaciones de calendario que necesita el motor sobre fechas locales `YYYY-MM-DD`: el día de la semana ISO, sumar días, recorrer un rango de fechas (ambas inclusive) y el intervalo UTC del mes local que contiene un instante (ARCH §9, regla 5).
   * Archivos: `src/dominio/tiempo.ts`, `tests/unit/dominio/tiempo.test.ts`
   * Depende de: T2.22
   * Refs: RN-03, ARCH §9 (reglas 1 y 5), §10.1, §16.3
   * Aceptación:
      * El 2026-10-12 es lunes (1) y el 2026-10-18, domingo (7). Sumar un día al 2026-10-31 da 2026-11-01, y al 2026-12-31, 2027-01-01.
      * Recorrer del 2026-10-12 al 2026-10-18 da 7 fechas en orden, y un rango que termina antes de empezar lanza un error.
      * El 31-oct-2026 a las 8:00 p. m. en Bogotá (`2026-11-01T01:00:00Z`) cae en el mes local de octubre: `[2026-10-01T05:00:00Z, 2026-11-01T05:00:00Z)`.

* [x] T3.02: Tipos del motor y capacidad simultánea
   * Objetivo: Crear `dominio/disponibilidad.ts` con los tipos de ARCH §10 (`Intervalo`, `ContextoAgenda` y `MotivoRechazo`) y con `maxSimultaneas`, el barrido de eventos de ARCH §10.2. Las franjas usan el tipo `FranjaValida` de `dominio/horario.ts`.
   * Archivos: `src/dominio/disponibilidad.ts`, `tests/unit/dominio/disponibilidad-capacidad.test.ts`
   * Depende de: T2.19
   * Refs: RN-09, RN-10, D-06, S-04, ARCH §10, §10.2
   * Aceptación:
      * Con una ventana de 9:00 a 10:00 y citas de 9:00 a 9:30 y de 9:30 a 10:00, `maxSimultaneas` da 1 (ARCH §20: "capacidad 2 con citas escalonadas").
      * Dos citas que se solapan dentro de la ventana dan 2. Una cita que termina justo cuando empieza la ventana no cuenta (S-04).

* [x] T3.03: `evaluarInicio`: horario y alineación
   * Objetivo: Implementar en `evaluarInicio` las condiciones 1 y 3 de RN-09: el intervalo completo (duración más buffer) cabe en una sola franja del día local (D-12), y el inicio está alineado con la granularidad contada desde las 00:00 locales (S-02). Los motivos de rechazo son `FUERA_DE_HORARIO` y `NO_ALINEADO`.
   * Archivos: `src/dominio/disponibilidad.ts`, `tests/unit/dominio/disponibilidad-evaluar.test.ts`
   * Depende de: T3.01, T3.02
   * Refs: RN-08, RN-09, D-12, S-02, ARCH §10, §10.1, §20 (`dominio/disponibilidad`)
   * Aceptación:
      * Con una franja de 8:00 a 12:00, un servicio de 30 minutos con 10 de buffer se acepta a las 11:00 y se rechaza a las 11:30, porque el buffer no cabe (ARCH §20: "buffer al final de la franja").
      * Con franjas contiguas de 8:00 a 12:00 y de 12:00 a 14:00, un servicio de 60 minutos a las 11:30 devuelve `FUERA_DE_HORARIO` (D-12).
      * Con una franja que empieza a las 8:15 y granularidad de 30 minutos, las 8:15 devuelven `NO_ALINEADO` y las 8:30 se aceptan (S-02).

* [x] T3.04: `evaluarInicio`: bloqueos, anticipación y capacidad
   * Objetivo: Completar `evaluarInicio` con las condiciones 2, 4 y 5 de RN-09: que no haya solape con bloqueos; la anticipación mínima y máxima para el cliente (para el dueño, solo `inicio ≥ ahora`, D-11); y la capacidad en todo el intervalo, con `maxSimultaneas`. Devuelve todos los motivos a la vez (ARCH §10).
   * Archivos: `src/dominio/disponibilidad.ts`, `tests/unit/dominio/disponibilidad-evaluar.test.ts`
   * Depende de: T3.03
   * Refs: RN-09, RN-10, D-11, S-04, ARCH §10; Q-31
   * Aceptación:
      * Con 120 minutos de anticipación mínima, `ahora + 120 min` se acepta y `ahora + 120 min − 1 ms` devuelve `ANTICIPACION`. Lo mismo en el borde de la anticipación máxima (ARCH §20: "bordes exactos de la anticipación").
      * Un bloqueo que empieza justo donde termina el intervalo no lo afecta (S-04), y uno que se solapa devuelve `BLOQUEADO`. Con la capacidad llena, el resultado es `SIN_CAPACIDAD`.
      * Un inicio desalineado, bloqueado y sin capacidad devuelve los tres motivos. Para el dueño, un inicio dentro de la anticipación mínima se acepta, y uno que ya pasó devuelve `ANTICIPACION` (D-11; Q-31).

* [x] T3.05: `iniciosDisponibles`
   * Objetivo: Implementar `iniciosDisponibles(ctx, desde, hasta)` con el algoritmo de ARCH §10.1. Recorre cada fecha local y cada franja por separado, empieza en el primer múltiplo de la granularidad y agrega los inicios que pasan las mismas condiciones que `evaluarInicio`.
   * Archivos: `src/dominio/disponibilidad.ts`, `tests/unit/dominio/disponibilidad-inicios.test.ts`
   * Depende de: T3.04
   * Refs: RN-07, RN-08, RN-09, RN-10, D-12, ARCH §10, §10.1, §10.2, §20
   * Aceptación:
      * Un bloqueo de día completo deja ese día sin inicios y no afecta a los demás días del rango (ARCH §20: "bloqueos de día completo").
      * Con capacidad 2 y citas escalonadas de 9:00 a 9:30 y de 9:30 a 10:00, un servicio de 60 minutos se ofrece a las 9:00 (ARCH §10.2).

* [x] T3.06: `iniciosDisponibles`: dueño, zona horaria y coherencia
   * Objetivo: Cubrir los casos de ARCH §20 que cruzan el motor con el actor y la zona horaria, y comprobar que la lista de inicios y la verificación de un inicio coinciden siempre.
   * Archivos: `tests/unit/dominio/disponibilidad-inicios.test.ts`, `src/dominio/disponibilidad.ts`
   * Depende de: T3.05
   * Refs: RN-03, RN-09, D-11, ARCH §9, §10, §20
   * Aceptación:
      * Para el dueño aparecen inicios dentro de la anticipación mínima, pero nunca fuera del horario, sobre un bloqueo, sin cupo ni antes de `ahora` (D-11; ARCH §20).
      * Con una franja el 14-oct-2026 hasta las 8:00 p. m. en Bogotá, el inicio de las 7:00 p. m. aparece en la fecha local 2026-10-14 como `2026-10-15T00:00:00Z` (ARCH §9: caso obligatorio).
      * Cada inicio que devuelve `iniciosDisponibles` pasa `evaluarInicio`, y cada inicio alineado del rango que no devuelve, falla (RN-09: la misma verificación al listar y al reservar).

* [x] T3.07: Pruebas del motor: RN-07
   * Objetivo: Probar con el motor los criterios de aceptación de RN-07.
   * Archivos: `tests/unit/dominio/disponibilidad-rn07.test.ts`
   * Depende de: T3.06
   * Refs: RN-07, D-12
   * Aceptación (una prueba por caso; todas pasan):
      * Con el horario "lunes de 8:00 a 12:00 y de 14:00 a 18:00", no se ofrecen horas entre las 12:00 y las 14:00 (RN-07).
      * Con franjas de 8:00 a 12:00 y de 12:00 a 14:00, un servicio de 60 minutos no se ofrece a las 11:30 (RN-07).
      * Un bloqueo de día completo elimina todas las horas de ese día (RN-07).

* [x] T3.08: Pruebas del motor: RN-08 y RN-10
   * Objetivo: Probar con el motor los criterios de aceptación de RN-08 y el primero de RN-10.
   * Archivos: `tests/unit/dominio/disponibilidad-rn08-rn10.test.ts`
   * Depende de: T3.07
   * Refs: RN-08, RN-10, S-02
   * Aceptación (una prueba por caso; todas pasan):
      * Con granularidad de 30 minutos, los inicios ofrecidos caen en :00 y :30 (RN-08).
      * Un servicio de 30 minutos con 10 de buffer reservado a las 9:00 ocupa el recurso hasta las 9:40. Con capacidad 1, el siguiente inicio libre es el primero alineado a partir de las 9:40 (RN-10).

### 3.B Identidad del cliente (RN-18, RN-19)

Entra en esta fase por Q-27. Las pruebas de sus criterios de aceptación se hacen a través de la reserva, en el módulo 3.E (T3.28 y T3.29).

* [x] T3.09: Normalización del teléfono y del correo
   * Objetivo: Crear `dominio/identidad-cliente.ts` con la normalización de ARCH §12: el teléfono pasa a E.164 con `libphonenumber-js` (país por defecto CO) y el correo se recorta y pasa a minúsculas. `libphonenumber-js` se instala con versión exacta.
   * Archivos: `src/dominio/identidad-cliente.ts`, `tests/unit/dominio/identidad-cliente.test.ts`, `package.json`
   * Depende de: T1.03
   * Refs: RN-18, ARCH §3, §12, §20 (`dominio/identidad-cliente`); Q-27
   * Aceptación:
      * "300 123 4567" y "+57 300-123-4567" dan `+573001234567`, y un número no válido se rechaza. " Ana@Mail.com " da `ana@mail.com` (RN-18; ARCH §20).
      * Todo teléfono normalizado cumple el `CHECK` de `cliente.telefono_e164` (`^\+[1-9][0-9]{6,14}$`).

* [x] T3.10: Decisión de identidad
   * Objetivo: Implementar en `dominio/identidad-cliente.ts` la decisión de ARCH §12 como función pura. Recibe el cliente que coincide por teléfono y el que coincide por correo, y decide a cuál se asocia la cita, qué datos se actualizan o si se crea uno nuevo. Nombre y apellido siempre se actualizan; el correo o el teléfono, solo si estaban vacíos y nadie más los usa (S-15).
   * Archivos: `src/dominio/identidad-cliente.ts`, `tests/unit/dominio/identidad-cliente.test.ts`
   * Depende de: T3.09
   * Refs: RN-18, RN-19, D-22, S-15, ARCH §12, §20 (`dominio/identidad-cliente`)
   * Aceptación:
      * Si coincide por teléfono, se usa ese cliente, se actualizan nombre y apellido, y el correo solo se completa si estaba vacío (RN-18.1, RN-18.3, S-15). Si coincide solo por correo, se usa ese y el teléfono se completa si estaba vacío (RN-18.2). Si no coincide ninguno, se crea un cliente nuevo (RN-18.4).
      * Si el teléfono es de un cliente y el correo de otro, gana el del teléfono, el otro no cambia y no se crea nada más (RN-18.5, D-22; ARCH §20).

* [x] T3.11: Repositorio de clientes
   * Objetivo: Crear `clientes.resolver(negocioId, datos, tx)`, que busca por teléfono y por correo, aplica la decisión de T3.10 y crea o actualiza el cliente. El caso nuevo usa `INSERT … ON CONFLICT (negocio_id, telefono_e164)` (ARCH §12).
   * Archivos: `src/servidor/db/repositorios/clientes.ts`, `tests/integracion/repositorios/clientes.test.ts`
   * Depende de: T3.10
   * Refs: RN-01, RN-18, RN-19, S-15, ARCH §6, §12; Q-34
   * Aceptación:
      * Dos llamadas con el mismo teléfono en formatos distintos dejan un solo cliente, con el nombre de la segunda.
      * Las búsquedas filtran por `negocioId`: el mismo teléfono en otro negocio crea otro cliente (ARCH §6).

### 3.C Consulta de disponibilidad

* [ ] T3.12: Repositorio de la agenda: oferta y franjas
   * Objetivo: Crear en `repositorios/agenda.ts` la lectura de la oferta de un servicio en una sede, que funciona con la conexión HTTP y dentro de una transacción. Devuelve:
      * el servicio y la sede, si están activos;
      * el `servicio_sede` activo, con su duración y su buffer (los de la sede, si los sobrescribe, o los del servicio);
      * su único recurso activo en `servicio_sede_recurso`, con su capacidad (ARCH §10.3);
      * las franjas de la sede (`recurso_id` en `NULL`).
   * Archivos: `src/servidor/db/repositorios/agenda.ts`, `tests/integracion/repositorios/agenda.test.ts`
   * Depende de: T2.20
   * Refs: RN-05, RN-06, RN-32, ARCH §6, §10, §10.3, §17.3; Q-34
   * Aceptación:
      * Si `servicio_sede` sobrescribe la duración, la oferta usa la de la sede; si no, la del servicio (RN-32).
      * Un servicio, una sede o una oferta inactivos, o de otro negocio, no devuelven oferta (RN-05; ARCH §6).

* [ ] T3.13: Repositorio de la agenda: bloqueos y ocupación
   * Objetivo: Agregar las dos lecturas de ARCH §11.2 para un rango. La primera trae los bloqueos que aplican al recurso: los del negocio, los de su sede y los suyos. La segunda trae la ocupación del recurso (citas no canceladas, `[inicio, ocupado_hasta)`), con una cita opcional que se excluye (RN-14).
   * Archivos: `src/servidor/db/repositorios/agenda.ts`, `tests/integracion/repositorios/agenda.test.ts`
   * Depende de: T3.12
   * Refs: RN-07, RN-10, RN-14, RN-32, D-06, ARCH §10.3, §11.2
   * Aceptación:
      * Un bloqueo de otra sede o de otro recurso no aparece, y uno sin sede sí (ARCH §11.2).
      * La ocupación no incluye las citas canceladas ni la cita excluida, y sí incluye las `completada` y `no_asistio` (D-06).

* [ ] T3.14: Contexto de la agenda
   * Objetivo: Crear en `casos-uso/agenda.ts` la función que arma el `ContextoAgenda` (ARCH §10) a partir del repositorio, la configuración y la zona del negocio. La usan la consulta de disponibilidad y la reserva, con la conexión HTTP o con la transacción, para que lo que no se ofrece tampoco se pueda reservar (RN-09).
   * Archivos: `src/servidor/casos-uso/agenda.ts`, `tests/integracion/casos-uso/agenda.test.ts`
   * Depende de: T3.05, T3.13
   * Refs: RN-09, D-11, ARCH §10, §11.1
   * Aceptación:
      * Un negocio de prueba con horario, un bloqueo y una cita produce un contexto con esas franjas, ese bloqueo y esa ocupación, en la zona del negocio.
      * El contexto lleva el `actor` que recibe (`cliente` o `dueno`) y el `ahora` inyectado (ARCH §20).

* [ ] T3.15: Caso de uso `consultarDisponibilidad`
   * Objetivo: Implementar `consultarDisponibilidad(entrada, ahora)` (ARCH §18.5). Resuelve el negocio por el slug y rechaza uno suspendido; valida la sede y el servicio de la oferta y un rango de hasta 31 días; recorta el rango a hoy y a la anticipación máxima (Q-32); y devuelve `{ zonaHoraria, dias: [{ fecha, inicios }] }`.
   * Archivos: `src/servidor/casos-uso/disponibilidad.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/disponibilidad.test.ts`
   * Depende de: T3.14
   * Refs: PUB-03, PUB-04, PUB-07, RN-04, RN-09, ARCH §6, §7.6, §18.5; Q-30, Q-32, Q-33
   * Aceptación:
      * Con el negocio de prueba, devuelve un día por fecha local, con los inicios en ISO UTC. Un día sin cupo trae `inicios: []` (PUB-03).
      * Un slug, una sede o un servicio inexistentes, de otro negocio o no ofrecidos devuelven `NO_ENCONTRADO`, igual que un `recursoId` (Q-30). Un negocio suspendido devuelve `NEGOCIO_SUSPENDIDO`.
      * Un rango de más de 31 días, o que termina antes de empezar, devuelve `DATOS_INVALIDOS` (Q-33).

* [ ] T3.16: Respuestas de la API pública
   * Objetivo: Crear el ayudante que convierte el `Resultado` de un caso de uso público en una respuesta JSON con el formato y el código HTTP de ARCH §18.5 (`{ "error": { "codigo", "mensaje" } }`). Los mensajes van en español y se toman del PRD donde existen.
   * Archivos: `src/servidor/http/respuestas.ts`, `tests/unit/servidor/respuestas.test.ts`
   * Depende de: T1.25
   * Refs: RNF-02, ARCH §18.5, §19.2; Q-33, Q-34
   * Aceptación:
      * Cada código de la tabla de ARCH §18.5 sale con su estado HTTP; por ejemplo, `HORARIO_NO_DISPONIBLE` con 409 y "Esa hora se acaba de ocupar.".
      * Las respuestas de error no incluyen datos del cliente ni detalles internos (ARCH §19.2).

* [ ] T3.17: Ruta de disponibilidad
   * Objetivo: Crear `GET /api/publico/{slug}/disponibilidad` como adaptador delgado de `consultarDisponibilidad` (ARCH §18.5).
   * Archivos: `src/app/api/publico/[slug]/disponibilidad/route.ts`, `tests/integracion/app/api/publico/disponibilidad.test.ts`
   * Depende de: T3.15, T3.16
   * Refs: PUB-03, PUB-04, ARCH §4, §5, §18.5
   * Aceptación:
      * La consulta de una semana del negocio de prueba responde 200 con el JSON de ARCH §18.5, también con `npm run preview`.
      * Sin `sedeId` o con fechas mal formadas, responde 422 `DATOS_INVALIDOS`; con un slug inexistente, 404 `NO_ENCONTRADO`.

### 3.D Reserva transaccional

* [ ] T3.18: Entrada y precondiciones de `reservarCita`
   * Objetivo: Implementar la parte de `reservarCita(entrada, ahora)` (ARCH §18.4) que va antes de la transacción:
      1. valida con Zod el cuerpo de ARCH §18.5: nombre, apellido, teléfono normalizable, correo, `aceptaPolitica` en `true` y `sitioWeb` vacío (la trampa para bots de ARCH §15);
      2. resuelve el negocio por el slug y rechaza uno suspendido;
      3. comprueba la oferta (servicio, sede y recurso activos) y que la política sea del negocio;
      4. exige cupo de `max_appointments_per_month` (Q-29).
   * Archivos: `src/servidor/casos-uso/reservar-cita.ts`, `tests/integracion/casos-uso/reservar-cita.test.ts`
   * Depende de: T3.09, T3.15
   * Refs: PUB-05, F-01, RN-04, RN-17, RN-25, ARCH §6, §15, §18.4, §18.5; Q-29, Q-30
   * Aceptación:
      * Si falta un dato, el teléfono no se puede normalizar, la casilla no está marcada o `sitioWeb` llega lleno, devuelve `DATOS_INVALIDOS` sin tocar la base (RN-17; ARCH §18.5).
      * Una política de otro negocio devuelve `NO_ENCONTRADO` (ARCH §6). Cualquier versión de la política del negocio se acepta, porque se guarda la que vio el cliente (F-01).

* [ ] T3.19: Transacción de la reserva
   * Objetivo: Completar `reservarCita` con la transacción de ARCH §11:
      1. toma el recurso con `FOR UPDATE`;
      2. después del bloqueo, arma el contexto (T3.14) y lo evalúa con `evaluarInicio`, con actor `cliente`;
      3. resuelve el cliente (T3.11);
      4. inserta la cita `confirmada` con su instantánea, el consentimiento (`politica_aceptada_en = ahora`), `fin` y `ocupado_hasta`, y el evento `creada` sin datos personales.

      Si choca con el correo de otro cliente, reintenta la transacción una vez (ARCH §12).
   * Archivos: `src/servidor/casos-uso/reservar-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `src/servidor/db/repositorios/recursos.ts`, `tests/integracion/casos-uso/reservar-cita.test.ts`
   * Depende de: T3.11, T3.18
   * Refs: RN-09, RN-10, RN-11, RN-12, RN-17, RN-18, ADR-04, ADR-13, ARCH §11, §12, §18.4; Q-34
   * Aceptación:
      * Una reserva válida responde `{ citaId, inicio, fin }` y deja la cita `confirmada`, con `fin = inicio + duración` y `ocupado_hasta = fin + buffer`, según la oferta.
      * Una hora que no pasa `evaluarInicio` devuelve `HORARIO_NO_DISPONIBLE` y no deja ninguna fila, ni de cliente ni de cita.
      * La transacción usa `READ COMMITTED` y toma el bloqueo del recurso antes de leer los bloqueos y las citas (revisión del código; ARCH §11.3).

* [ ] T3.20: Notificaciones de la reserva
   * Objetivo: Insertar, en la misma transacción, las filas de la bandeja de salida de una reserva (ARCH §14.1). C-01 (`confirmacion`) y C-02 (`recordatorio`, para `inicio − recordatorio_horas_antes`) van al correo de la cita; el recordatorio solo se crea si ese momento no pasó (S-12). C-05 (`dueno_cita_nueva`) va al dueño (Q-28). Nadie las envía hasta la Fase 6.
   * Archivos: `src/servidor/db/repositorios/notificaciones.ts`, `src/servidor/casos-uso/reservar-cita.ts`, `tests/integracion/casos-uso/reservar-cita.test.ts`
   * Depende de: T3.19
   * Refs: C-01, C-02, C-05, RN-20, RN-21, RN-22, S-12, ARCH §14.1; Q-28, Q-34
   * Aceptación:
      * Una reserva crea tres notificaciones pendientes, con las claves `confirmacion:{citaId}`, `recordatorio:{citaId}:v1` y `dueno_cita_nueva:{citaId}`.
      * Sin recordatorio configurado, o si `inicio − horas` ya pasó, no se crea el recordatorio (S-12).

* [ ] T3.21: Ruta de reservas
   * Objetivo: Crear `POST /api/publico/{slug}/reservas` como adaptador delgado de `reservarCita`. Solo acepta `application/json` (ARCH §19.2) y responde 201 con `{ citaId, inicio, fin }` o con el error de ARCH §18.5.
   * Archivos: `src/app/api/publico/[slug]/reservas/route.ts`, `tests/integracion/app/api/publico/reservas.test.ts`
   * Depende de: T3.16, T3.20
   * Refs: PUB-05, PUB-06, ARCH §18.5, §19.2, §21.4; Q-17 (TASKS-01), Q-33
   * Aceptación:
      * Una reserva válida responde 201, y la misma hora pedida otra vez responde 409 `HORARIO_NO_DISPONIBLE`.
      * Un cuerpo que no es `application/json` responde 422 `DATOS_INVALIDOS` (Q-33).
      * `opennextjs-cloudflare build` y `wrangler deploy --dry-run` informan el tamaño comprimido del Worker, ya con `libphonenumber-js`, y queda anotado en el commit.

### 3.E Pruebas de la reserva

Pruebas de integración contra la rama efímera de Neon, con los casos de ARCH §20 y los criterios de aceptación de las RN que esta fase hace posibles. Cada caso cita su origen.

* [ ] T3.22: Pruebas de concurrencia
   * Objetivo: Probar RN-11 con reservas reales en paralelo. El caso "al reprogramar contra una reserva" de ARCH §20 va con `reprogramarCita`, en la Fase 6.
   * Archivos: `tests/integracion/casos-uso/reservar-cita-concurrencia.test.ts`
   * Depende de: T3.20
   * Refs: RN-11, ADR-04, ARCH §11.3, §20 (Concurrencia)
   * Aceptación (una prueba por caso; todas pasan):
      * Con 10 reservas simultáneas por el último cupo de un recurso de capacidad 1, entra exactamente una y las demás reciben `HORARIO_NO_DISPONIBLE` (RN-11).
      * Con capacidad 2, entran exactamente dos (RN-11).

* [ ] T3.23: Pruebas de bloqueo y reserva simultáneos
   * Objetivo: Probar el caso de ARCH §20 (Bloqueos) que quedó pendiente en la Fase 2: un bloqueo y una reserva simultáneos sobre el mismo rango.
   * Archivos: `tests/integracion/casos-uso/bloqueo-y-reserva.test.ts`
   * Depende de: T2.23, T3.20
   * Refs: D-15, RN-11, ARCH §11.3, §20 (Bloqueos)
   * Aceptación (una prueba por caso; todas pasan):
      * En varias rondas en las que `crearBloqueo` y `reservarCita` se lanzan a la vez sobre el mismo rango, en cada ronda entra solo uno de los dos (ARCH §20).
      * Si gana la reserva, el bloqueo responde `BLOQUEO_CON_CITAS` con esa cita; si gana el bloqueo, la reserva responde `HORARIO_NO_DISPONIBLE` (D-15, RN-11).

* [ ] T3.24: Pruebas de ocupación
   * Objetivo: Probar con citas reales que todo estado, salvo `cancelada`, ocupa capacidad (D-06). Los cambios de estado se hacen por SQL, porque sus operaciones llegan en las Fases 5 y 6.
   * Archivos: `tests/integracion/casos-uso/ocupacion.test.ts`
   * Depende de: T3.20
   * Refs: RN-10, D-06, ARCH §20 (Ocupación)
   * Aceptación (una prueba por caso; todas pasan):
      * Una cita marcada `completada` o `no_asistio` antes de terminar sigue ocupando su intervalo hasta `ocupado_hasta`: la hora no se ofrece ni se puede reservar (RN-10; ARCH §20).
      * Una cita cancelada libera su cupo de inmediato (RN-10).
      * Con `enable_seqscan = off` en la sesión de la prueba, el plan de la consulta de ocupación usa `cita_ocupacion_idx` (ARCH §20).

* [ ] T3.25: Pruebas de las sedes en el motor
   * Objetivo: Probar los casos de RN-32 y de ARCH §20 (Sedes) que dependen del motor, con una segunda sede creada por SQL.
   * Archivos: `tests/integracion/casos-uso/disponibilidad-sedes.test.ts`
   * Depende de: T3.15
   * Refs: RN-32, ARCH §20 (Sedes)
   * Aceptación (una prueba por caso; todas pasan):
      * Un bloqueo de la sede A no afecta a la sede B, y uno sin sede afecta a las dos (RN-32).
      * El mismo servicio con 30 minutos en la sede A y 45 en la sede B ofrece en cada sede las horas que corresponden a su duración (RN-32; ARCH §20: "las sobrescrituras de duración cambian las horas ofrecidas").

* [ ] T3.26: Pruebas de las reglas de la reserva
   * Objetivo: Probar que la reserva aplica las mismas reglas que la consulta y crea la cita como pide el PRD.
   * Archivos: `tests/integracion/casos-uso/reservar-cita-reglas.test.ts`
   * Depende de: T3.20
   * Refs: RN-05, RN-09, RN-12
   * Aceptación (una prueba por caso; todas pasan):
      * Una hora que la consulta no ofrece (fuera del horario, bloqueada o desalineada) tampoco se puede reservar con una solicitud directa (RN-09).
      * Un servicio inactivo no aparece en la disponibilidad ni admite reservas nuevas, y sus citas existentes se conservan (RN-05).
      * Toda cita creada queda `confirmada` (RN-12).

* [ ] T3.27: Pruebas del consentimiento y de la hora
   * Objetivo: Probar los criterios de RN-17 y RN-03 en la reserva.
   * Archivos: `tests/integracion/casos-uso/reservar-cita-consentimiento.test.ts`
   * Depende de: T3.20
   * Refs: RN-03, RN-17
   * Aceptación (una prueba por caso; todas pasan):
      * Sin alguno de los cuatro datos, o sin marcar la casilla, no se puede reservar (RN-17).
      * Cada cita pública guarda la versión de la política y la fecha y hora de aceptación (RN-17).
      * Una cita reservada a las 7:00 p. m. hora de Colombia se guarda como las 00:00 UTC del día siguiente (RN-03).

* [ ] T3.28: Pruebas de identidad: normalización y nombre
   * Objetivo: Probar a través de la reserva los criterios de RN-18 sobre la normalización y el nombre de cada cita.
   * Archivos: `tests/integracion/casos-uso/identidad-cliente.test.ts`
   * Depende de: T3.20
   * Refs: RN-18
   * Aceptación (una prueba por caso; todas pasan):
      * Reservas con "300 123 4567" y con "+57 300-123-4567" quedan en el mismo cliente, y lo mismo con `Ana@Mail.com` y `ana@mail.com` (RN-18).
      * Una cita vieja sigue mostrando el nombre con el que se reservó, aunque el cliente reserve después con otro (RN-18).

* [ ] T3.29: Pruebas de identidad: teléfono que prevalece y teléfono compartido
   * Objetivo: Probar a través de la reserva el caso 5 de RN-18 y el criterio de RN-19.
   * Archivos: `tests/integracion/casos-uso/identidad-cliente.test.ts`
   * Depende de: T3.28
   * Refs: RN-18, RN-19, D-22
   * Aceptación (una prueba por caso; todas pasan):
      * Si el teléfono coincide con un cliente y el correo con otro, la cita queda en el cliente del teléfono y no se crea ninguna revisión (RN-18, caso 5).
      * Dos reservas con el mismo teléfono y distinto nombre quedan en el mismo cliente, cuyo nombre es el de la última; cada cita muestra el suyo (RN-19).

* [ ] T3.30: Pruebas de suscripción y límites
   * Objetivo: Probar la reserva frente al estado de la suscripción y a los límites del plan.
   * Archivos: `tests/integracion/casos-uso/reservar-cita-suscripcion.test.ts`
   * Depende de: T3.20
   * Refs: RN-04, RN-25, RN-29, RN-31
   * Aceptación (una prueba por caso; todas pasan):
      * Con el negocio suspendido y el plan `ilimitado`, el servidor rechaza una reserva directa con `NEGOCIO_SUSPENDIDO` (RN-04, RN-29).
      * En el período de gracia, la reserva funciona (RN-31: "todo funciona").
      * Con `max_appointments_per_month` alcanzado, una reserva directa devuelve `LIMITE_PLAN` (RN-25).

* [ ] T3.31: Pruebas multi-negocio
   * Objetivo: Probar que la consulta y la reserva no alcanzan datos de otro negocio cuando se manipulan los identificadores.
   * Archivos: `tests/integracion/app/api/publico/multi-negocio.test.ts`
   * Depende de: T3.17, T3.21
   * Refs: RN-01, ARCH §6, §20 (Multi-negocio)
   * Aceptación (una prueba por caso; todas pasan):
      * Con el slug de A, consultar o reservar con la sede o el servicio de B devuelve `NO_ENCONTRADO`, y en B no aparece ninguna cita (RN-01).
      * Con el slug de A, una reserva con la política de B devuelve `NO_ENCONTRADO` (RN-01).

### 3.F Cierre de la fase

* [ ] T3.32: [manual] Plan Workers Paid
   * Objetivo: Pasar la cuenta de Cloudflare a Workers Paid (≈ USD 5/mes) antes del despliegue de la fase, porque el Worker está a unos 93 KiB del límite de 3 MiB del plan gratuito (Q-17, TASKS-01). El plan Paid sube el límite a 10 MiB comprimidos y el de CPU por solicitud, de 10 ms a 30 s.
   * Archivos: —
   * Depende de: T1.05
   * Refs: RNF-08, ARCH §21.4, §23; Q-17 (TASKS-01)
   * Aceptación:
      * El Dashboard de Cloudflare (Workers & Pages → Plans) muestra la cuenta en Workers Paid.
      * La facturación de la cuenta muestra el cargo mensual del plan.

* [ ] T3.33: Despliegue y verificación de la fase
   * Objetivo: Desplegar la fase y comprobar en `*.workers.dev`, con `curl`, la consulta y la reserva sobre el negocio de prueba que se configuró en la Fase 2.
   * Archivos: — (el commit anota el tamaño del Worker)
   * Depende de: T3.08, T3.22–T3.31, T3.32
   * Refs: RNF-07, RNF-09, ARCH §21.4, §23
   * Aceptación:
      * `npm run deploy` termina sin errores en el plan Paid, y el tamaño del Worker queda anotado en el commit.
      * En el Worker, la consulta de una semana y una reserva funcionan: la cita aparece en `production` y su hora deja de ofrecerse.
      * El tiempo de respuesta de la disponibilidad de una semana, con la base ya despierta, queda medido y anotado frente al objetivo de 500 ms (RNF-07).

---

## Preguntas

Puntos que el PRD y ARCHITECTURE no definían. Todas las preguntas de esta fase quedaron resueltas el 2026-10-18, junto con Q-11 y Q-17 de [TASKS-01](TASKS-01.md#preguntas). Siguen abiertas, y aplican a esta fase, Q-04 de TASKS-01, y Q-20 y Q-24 de [TASKS-02](TASKS-02.md#preguntas).

| ID | Pregunta | Decisión | Afecta a |
|---|---|---|---|
| Q-27 | PRD §12 pone "Clientes (RN-18)" en la Fase 7, pero `reservarCita` necesita resolver el cliente dentro de su transacción (ARCH §11.1 y §12): sin eso, la segunda reserva con el mismo teléfono choca con `UNIQUE (negocio_id, telefono_e164)`. | **Resuelta (2026-10-18):** la identidad (normalización y decisión de RN-18 y RN-19) entra en la Fase 3. La Fase 7 queda con PAN-09, `editarCliente` y `suprimirCliente` (S-14, S-17). | Alcance, T3.09–T3.11, T3.28, T3.29 |
| Q-28 | Las notificaciones C-01, C-02 y C-05 se insertan en la transacción de la reserva (ARCH §11.1, §14.1), pero el envío es de la Fase 6. Además, ARCH no dice a qué correo va C-05: ¿al del miembro dueño o a `negocio.correo_contacto` (Q-11, TASKS-01)? | **Resuelta (2026-10-18):** la Fase 3 crea las filas y nadie las procesa hasta la Fase 6. Los avisos al dueño (C-05 y C-06) van al correo del miembro con rol `dueno`, como C-07 y C-08 en ARCH §7.6. El `reply_to` de los correos de citas se resuelve en Q-11 (TASKS-01). | T3.20, Fase 6 |
| Q-29 | ARCH §16.3 deja para D-04 si las citas canceladas cuentan para `max_appointments_per_month`. | **Resuelta (2026-10-18):** cuentan todas las citas creadas en el mes calendario local, también las canceladas, para que crear y cancelar no sirva para esquivar el límite. Con el plan `ilimitado` no tiene efecto. | T3.18, T3.30 |
| Q-30 | En el MVP, la API pública siempre omite `recursoId` (ARCH §18.5). ¿Qué responde si llega uno? | **Resuelta (2026-10-18):** `NO_ENCONTRADO`, porque ARCH §18.4 exige que el servicio tenga `cliente_elige` y ningún servicio del MVP lo tiene. | T3.15, T3.18 |
| Q-31 | Para el dueño, el motor solo ofrece inicios a partir de `ahora` (ARCH §10), pero `MotivoRechazo` no tiene un motivo para un inicio que ya pasó. | **Resuelta (2026-10-18):** `ANTICIPACION`, porque es la condición 4 de RN-09 en su versión para el dueño. | T3.04 |
| Q-32 | ARCH §18.5 dice que el rango de la disponibilidad "siempre se recorta a la anticipación máxima". ¿Los días fuera del rango se omiten o vienen con `inicios` vacíos? ¿Y los días anteriores a hoy? | **Resuelta (2026-10-18):** se omiten. Los días van desde la fecha más tardía entre `desde` y hoy (local) hasta la más temprana entre `hasta` y la fecha local de `ahora` más la anticipación máxima. | T3.15 |
| Q-33 | ARCH §18.5 no da un código propio para un cuerpo que no es `application/json` (ARCH §19.2) ni para un rango de fechas inválido, y solo define el mensaje de `HORARIO_NO_DISPONIBLE`. | **Resuelta (2026-10-18):** `DATOS_INVALIDOS` (422) en ambos casos. Los demás mensajes se toman de los textos del PRD cuando existen ("Reservas no disponibles", "intenta en un minuto"…). | T3.15, T3.16, T3.21 |
| Q-34 | ARCH §4 no ubica algunos archivos nuevos: los repositorios `agenda`, `clientes`, `citas` y `notificaciones`; `src/servidor/casos-uso/agenda.ts`, `disponibilidad.ts` y `reservar-cita.ts`; y `src/servidor/http/respuestas.ts`. Las rutas `/api/publico/[slug]/…` sí siguen ARCH §4. | **Resuelta (2026-10-18):** las rutas indicadas. | T3.11–T3.21 |
| Q-35 | PRD §12 deja el límite de frecuencia (RN-23) para la Fase 8, pero desde esta fase la API de reservas queda expuesta en `*.workers.dev`. | **Resuelta (2026-10-18):** llega en la Fase 8, antes del primer cliente en producción (día 18). Hasta entonces, el Worker solo tiene negocios de prueba. | Alcance, T3.17, T3.21 |
