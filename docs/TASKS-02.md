# Agenda de citas (SaaS) — Tareas de la Fase 2

| | |
|---|---|
| **Versión** | 0.1 (borrador) |
| **Fecha** | 2026-10-16 |
| **Fuentes** | [PRD.md](PRD.md) v0.7 · [ARCHITECTURE.md](ARCHITECTURE.md) v0.9 · [TASKS-01.md](TASKS-01.md) v0.2 |

> El PRD manda en el **qué** y ARCHITECTURE en el **cómo**. Si una tarea contradice a alguno de los dos, se corrige la tarea. El formato de las tareas, sus marcas y la definición de terminado están en [TASKS-00](TASKS-00.md). Lo que los documentos no definen está en [Preguntas](#preguntas): las nuevas siguen la numeración de TASKS-01 (desde Q-18), y las de TASKS-01 se citan como "Q-04 (TASKS-01)".

## Fase 2: sede principal, servicios por sede, recursos, horario semanal, bloqueos y configuración

### Alcance

**Entra:**

- Los datos del negocio: nombre, logo (en R2), colores, y dirección y teléfono de la sede principal (PAN-11).
- Los servicios del catálogo, ofrecidos en la sede principal con su consultorio (PAN-12; RN-05, RN-06 y RN-32), y el nombre y la capacidad del consultorio (PAN-13).
- El horario semanal de la sede principal, con varias franjas por día (PAN-14).
- Los bloqueos: crear, ver y eliminar, sin solaparse con citas confirmadas que aún no terminan (PAN-08, D-15).
- Las reglas de reserva, el recordatorio y la política de datos (PAN-15 a PAN-17).
- El inicio del panel: la lista de verificación de F-05 (paso 3) y el enlace a la página pública (PAN-18).
- La suscripción, según el supuesto de Q-04 (TASKS-01): los avisos del panel (PAN-19) y las acciones del admin (ADM-03).

**No entra:**

- El motor de disponibilidad (Fase 3). Allí se prueba que el horario, los bloqueos y las reglas cambian las horas ofrecidas, junto con los casos de ARCH §20 que dependen de él: un bloqueo de una sede que no afecta a otra, las sobrescrituras de duración por sede, y un bloqueo y una reserva simultáneos.
- La interfaz de varias sedes, la configuración de `servicio_sede` por sede y los empleados (D-16, D-17).
- El recálculo de los recordatorios pendientes al cambiar el momento del recordatorio (Q-23).
- Los envíos de correo: C-08 queda en la bandeja de salida hasta la Fase 6. Tampoco entran `aplicarVencimientos` ni ADM-05.
- La página pública (Fase 4): aquí solo se enlaza.

**Criterio de salida:** T2.42, el despliegue y la verificación de la fase en el Worker.

### Convenciones de la fase

- Las Server Actions del panel son adaptadores delgados (ARCH §4). Empiezan con `requireEscritura()`, o con `requireMiembro()` si solo leen; van envueltas en `accion()` y pasan el contexto al caso de uso. El caso de uso nunca recibe el `negocioId` del cliente (ARCH §6).
- Los casos de uso validan con Zod en el servidor (Q-02, TASKS-01) y devuelven un `Resultado` con los códigos de ARCH §18.5. Los que dependen del reloj reciben `ahora` (ARCH §20).
- Toda la configuración del MVP actúa sobre la sede principal y su consultorio (Q-20). El panel no muestra el concepto de sede (RN-32, D-16).
- Las pantallas usan los componentes de T2.04 y siguen `docs/DESIGN.md` cuando exista (Q-26).
- Las operaciones nuevas que ARCH §18.4 no define están listadas en Q-19, y las rutas y archivos nuevos, en Q-18.

### 2.A Base del panel

* [x] T2.01: Repositorios de la sede principal y su consultorio
   * Objetivo: Crear `sedes.principal(negocioId)` y `recursos.consultorioPrincipal(negocioId)`, que resuelven la sede y el recurso sobre los que actúa toda la configuración del MVP (Q-20).
   * Archivos: `src/servidor/db/repositorios/sedes.ts`, `src/servidor/db/repositorios/recursos.ts`, `tests/integracion/repositorios/sedes.test.ts`
   * Depende de: T1.39, T1.45
   * Refs: RN-32, D-16, ARCH §6 (defensa 1), §17.3; Q-18, Q-20
   * Aceptación:
      * Después de un alta, `principal` devuelve la "Sede principal", y `consultorioPrincipal`, el "Consultorio" de esa sede con capacidad 1.
      * Con el `negocioId` de otro negocio, ambas devuelven `null` (ARCH §6).

* [x] T2.02: Ayudante de pruebas: sesión del dueño
   * Objetivo: Llevar a `tests/integracion/fixtures.ts` el ayudante de T1.43 que simula la sesión de Clerk del dueño. Ahora crea el negocio con `altaNegocio`, para que traiga la sede principal, el consultorio y la política v1, y permite fijar el estado de la suscripción.
   * Archivos: `tests/integracion/fixtures.ts`, `tests/integracion/auth/suscripcion.test.ts`
   * Depende de: T1.43
   * Refs: ARCH §20
   * Aceptación:
      * `tests/integracion/auth/suscripcion.test.ts` usa el ayudante compartido y sigue pasando.
      * El ayudante devuelve el `negocioId`, y las Server Actions que se llaman después ven ese negocio a través de `requireMiembro`.

* [x] T2.03: Formato de fechas y horas
   * Objetivo: Crear en `dominio/formato.ts` las funciones que muestran fechas y horas con `Intl.DateTimeFormat('es-CO')`, siempre en la zona del negocio y con la hora en formato de 12 horas.
   * Archivos: `src/dominio/formato.ts`, `tests/unit/dominio/formato.test.ts`
   * Depende de: T1.03
   * Refs: RN-03, RNF-02, ARCH §9 (regla 3); Q-18
   * Aceptación:
      * `2026-10-15T00:00:00Z` en `America/Bogota` se muestra como el 14 de octubre de 2026 a las 7:00 p. m. (RN-03), aunque la suite corra con otra `TZ`. La comparación normaliza los espacios especiales que produce `Intl`.
      * Las horas usan "a. m." y "p. m." (RNF-02).

* [x] T2.04: Componentes base de formularios
   * Objetivo: Crear en `src/componentes/` los componentes que repiten los formularios del panel y del admin: un campo con etiqueta, ayuda y error; un botón con estado de envío; un aviso de error, advertencia, éxito o información; y una sección con título. Todos accesibles: etiqueta asociada, `aria-describedby`, foco visible y `role="alert"` o `role="status"` (RNF-03).
   * Archivos: `src/componentes/formulario.tsx`, `src/componentes/aviso.tsx`, `src/app/(admin)/admin/negocios/nuevo/formulario.tsx`
   * Depende de: T1.49
   * Refs: RNF-03, ARCH §3, §4; Q-18, Q-26
   * Aceptación:
      * El formulario de alta de `/admin` (T1.49) pasa a usar los componentes y se comporta igual: el slug `admin` sigue mostrando "slug no disponible".
      * Con el teclado, cada campo del formulario de alta se alcanza en orden y muestra el foco.

* [x] T2.05: Navegación del panel y avisos de suscripción
   * Objetivo: Ampliar el layout del panel con la navegación, usable en celular, y con el aviso de PAN-19. Las secciones de la navegación son Inicio, Bloqueos y Configuración (Negocio, Servicios, Consultorio, Horario, Reglas de reserva, Recordatorios y Política de datos). El aviso depende de la suscripción: en gracia dice "Tu suscripción venció. Renueva antes del {fecha} para no perder el servicio"; suspendida, avisa que el panel está en solo lectura e invita a renovar.
   * Archivos: `src/app/(panel)/layout.tsx`, `src/componentes/panel/navegacion.tsx`, `src/componentes/panel/aviso-suscripcion.tsx`, `src/servidor/casos-uso/resumen-negocio.ts`, `src/servidor/db/repositorios/negocios.ts`
   * Depende de: T2.03, T2.04
   * Refs: PAN-19, RN-04, RN-31, D-14, ARCH §7.6, §9; Q-04 (TASKS-01), Q-18
   * Aceptación:
      * Con un negocio en gracia en `development`, el panel muestra el aviso con la fecha de `suspendeEn` (vencimiento más 3 días) en la zona del negocio.
      * Con el negocio suspendido, aparece el aviso de solo lectura; al día, no aparece ningún aviso.

### 2.B Negocio, marca y sede principal (PAN-11)

Ni ARCH §20 ni los criterios de las RN tienen casos para este módulo, así que no hay tarea de pruebas de cierre: los criterios quedan en cada tarea. La solo lectura de sus Server Actions se prueba en T2.41.

* [x] T2.06: Validación de imágenes
   * Objetivo: Crear en `dominio/imagen.ts` la validación de los logos. Detecta PNG, JPEG o WebP por los primeros bytes del archivo, sin fiarse del nombre ni del tipo que declara el navegador, y rechaza los archivos de más de 512 KB.
   * Archivos: `src/dominio/imagen.ts`, `tests/unit/dominio/imagen.test.ts`
   * Depende de: T1.03
   * Refs: ARCH §19.2 (Archivos); Q-18
   * Aceptación:
      * Se aceptan muestras mínimas de PNG, JPEG y WebP. Se rechazan un SVG, un GIF y un texto con nombre `.png` (ARCH §19.2: sin SVG).
      * Se acepta un archivo de 512 KB y se rechaza uno de 512 KB más 1 byte.

* [x] T2.07: [manual] Bucket de R2
   * Objetivo: Crear en Cloudflare R2 el bucket `agenda-media` de ARCH §21.2.
   * Archivos: —
   * Depende de: T1.05
   * Refs: ARCH §2, §21.2; Q-21
   * Aceptación:
      * `npx wrangler r2 bucket list` muestra `agenda-media`.
      * El bucket no tiene acceso público (`r2.dev` desactivado), porque las imágenes se sirven a través del Worker (Q-21).

* [x] T2.08: Almacenamiento de imágenes y ruta pública
   * Objetivo: Declarar el binding `MEDIA` en `wrangler.jsonc`, crear `guardarImagen` y `borrarImagen` (con nombre aleatorio y el tipo que detecta T2.06) y crear la ruta `GET /api/media/{clave}`, que sirve la imagen desde R2 con los encabezados de Q-21.
   * Archivos: `wrangler.jsonc`, `cloudflare-env.d.ts`, `src/servidor/archivos/imagenes.ts`, `src/app/api/media/[clave]/route.ts`
   * Depende de: T2.06, T2.07
   * Refs: ARCH §19.2, §21.2; Q-18, Q-21
   * Aceptación:
      * Con `npm run preview`, una imagen guardada responde 200 en `/api/media/{clave}` con su `Content-Type`, `Cache-Control: public, max-age=31536000, immutable` y `X-Content-Type-Options: nosniff`. Una clave inexistente responde 404.
      * La clave guardada es aleatoria y no contiene el nombre original del archivo.

* [x] T2.09: Caso de uso `guardarNegocio`
   * Objetivo: Implementar `guardarNegocio`, que guarda en una transacción el nombre, el color primario y el secundario (`#rrggbb` en minúsculas), y la dirección y el teléfono de la sede principal.
   * Archivos: `src/servidor/casos-uso/guardar-negocio.ts`, `src/servidor/db/repositorios/negocios.ts`, `src/servidor/db/repositorios/sedes.ts`, `tests/integracion/casos-uso/guardar-negocio.test.ts`
   * Depende de: T2.01
   * Refs: PAN-11, RN-32, ARCH §18.2 (`negocio`, `sede`); Q-19, Q-20
   * Aceptación:
      * Guardar actualiza `negocio` y la sede principal del negocio del contexto, y deja intactas las demás sedes y los demás negocios.
      * Un color fuera del formato `#rrggbb` o un nombre vacío devuelve `DATOS_INVALIDOS` y no cambia nada.

* [x] T2.10: Casos de uso del logo
   * Objetivo: Implementar `subirLogo` y `quitarLogo`. `subirLogo` valida la imagen con T2.06, la guarda en R2 y actualiza `negocio.logo_url`. Si falla la escritura en la base, borra la imagen subida; si sale bien, borra la anterior (Q-21).
   * Archivos: `src/servidor/casos-uso/logo-negocio.ts`, `tests/integracion/casos-uso/logo-negocio.test.ts`
   * Depende de: T2.08, T2.09
   * Refs: PAN-11, ARCH §19.2; Q-19, Q-21
   * Aceptación (con el almacenamiento simulado):
      * Un PNG válido queda en `logo_url`, y reemplazarlo borra el anterior. Un SVG devuelve `DATOS_INVALIDOS` y no guarda nada.
      * `quitarLogo` deja `logo_url` en `NULL` y borra la imagen.

* [x] T2.11: Página "Negocio"
   * Objetivo: Crear `/panel/configuracion/negocio` con el formulario de PAN-11 y sus Server Actions: nombre, logo con vista previa, colores, dirección y teléfono.
   * Archivos: `src/app/(panel)/panel/configuracion/negocio/page.tsx`, `src/app/(panel)/panel/configuracion/negocio/formulario.tsx`, `src/app/(panel)/panel/configuracion/negocio/acciones.ts`
   * Depende de: T2.05, T2.10
   * Refs: PAN-11, RN-32, D-14, D-16, ARCH §19.2; Q-18
   * Aceptación (manual, en local):
      * El dueño cambia el nombre, los colores y la dirección; sube un logo PNG, lo ve en la vista previa y lo quita. Un SVG muestra el error.
      * La página habla de la dirección y el teléfono del negocio, sin mencionar sedes (RN-32: con una sola sede, el panel se ve igual que sin el concepto).
      * Con el negocio suspendido, el formulario aparece deshabilitado (D-14).

### 2.C Servicios y consultorio (PAN-12, PAN-13)

* [x] T2.12: Caso de uso `guardarServicio`
   * Objetivo: Implementar `guardarServicio` (ARCH §18.4). Al crear, exige cupo de `max_services` y, en una transacción, crea el servicio, su `servicio_sede` en la sede principal (sin `cliente_elige`) y su `servicio_sede_recurso` con el consultorio. Al editar, cambia el nombre, la descripción, la duración y el buffer de un servicio del negocio.
   * Archivos: `src/servidor/casos-uso/servicios.ts`, `src/servidor/db/repositorios/servicios.ts`, `tests/integracion/casos-uso/servicios.test.ts`
   * Depende de: T2.01
   * Refs: PAN-12, RN-05, RN-06, RN-25, RN-32, D-02, ARCH §16.3, §18.4
   * Aceptación:
      * Crear deja el servicio activo, ofrecido en la sede principal y atendido por el consultorio.
      * Una duración fuera de 5 a 720 minutos o un buffer fuera de 0 a 240 devuelve `DATOS_INVALIDOS`. Editar un servicio inexistente o de otro negocio devuelve `NO_ENCONTRADO` (ARCH §6, defensa 3).

* [x] T2.13: Activar y desactivar servicios
   * Objetivo: Implementar `activarServicio`, que exige cupo de `max_services` porque el cupo se valida al crear o reactivar (RN-28), y `desactivarServicio`. Desactivar no toca las citas existentes.
   * Archivos: `src/servidor/casos-uso/servicios.ts`, `src/servidor/db/repositorios/servicios.ts`, `tests/integracion/casos-uso/servicios.test.ts`
   * Depende de: T2.12
   * Refs: PAN-12, RN-05, RN-25, RN-28, ARCH §16.3; Q-19
   * Aceptación:
      * Desactivar y volver a activar un servicio cambia `servicio.activo` y nada más.
      * Un servicio de otro negocio devuelve `NO_ENCONTRADO`.
      * Con más servicios activos que `max_services`, los existentes se pueden editar y desactivar: solo crear o reactivar exige cupo (RN-28; ARCH §16.3).

* [x] T2.14: Caso de uso `guardarConsultorio`
   * Objetivo: Implementar `guardarConsultorio`, que guarda el nombre y la capacidad (un entero mayor o igual que 1) del consultorio de la sede principal.
   * Archivos: `src/servidor/casos-uso/consultorio.ts`, `src/servidor/db/repositorios/recursos.ts`, `tests/integracion/casos-uso/consultorio.test.ts`
   * Depende de: T2.01
   * Refs: PAN-13, RN-06, ARCH §18.2 (`recurso`); Q-19, Q-20, Q-24
   * Aceptación:
      * Cambia el nombre y la capacidad del consultorio de la sede principal, y de ningún otro recurso.
      * Una capacidad que no es un número entero devuelve `DATOS_INVALIDOS`.

* [x] T2.15: Página de servicios
   * Objetivo: Crear `/panel/configuracion/servicios` con sus Server Actions: la lista de servicios activos e inactivos, el formulario para crear y editar, y los botones para activar y desactivar. El error `LIMITE_PLAN` se muestra como "límite del plan".
   * Archivos: `src/app/(panel)/panel/configuracion/servicios/page.tsx`, `src/app/(panel)/panel/configuracion/servicios/formulario.tsx`, `src/app/(panel)/panel/configuracion/servicios/acciones.ts`
   * Depende de: T2.05, T2.13
   * Refs: PAN-12, RN-05, RN-25, RNF-03; Q-18
   * Aceptación (manual, en local):
      * El dueño crea "Examen visual" de 30 minutos, lo cambia a 45 minutos con 10 de buffer, lo desactiva y lo vuelve a activar.
      * La lista distingue los servicios inactivos sin depender solo del color (RNF-03).

* [x] T2.16: Página del consultorio
   * Objetivo: Crear `/panel/configuracion/consultorio` con el formulario de PAN-13 (nombre y capacidad) y su Server Action.
   * Archivos: `src/app/(panel)/panel/configuracion/consultorio/page.tsx`, `src/app/(panel)/panel/configuracion/consultorio/formulario.tsx`, `src/app/(panel)/panel/configuracion/consultorio/acciones.ts`
   * Depende de: T2.05, T2.14
   * Refs: PAN-13, RN-06; Q-18
   * Aceptación (manual, en local):
      * El dueño cambia el nombre y la capacidad, y una capacidad de 0 muestra el error.
      * La ayuda explica que la capacidad es el número de citas simultáneas (glosario del PRD).

* [x] T2.17: Pruebas de servicios y recursos
   * Objetivo: Probar las reglas de servicios y recursos con los casos de uso del módulo.
   * Archivos: `tests/integracion/casos-uso/servicios-reglas.test.ts`
   * Depende de: T2.02, T2.13, T2.14
   * Refs: RN-05, RN-06
   * Aceptación (una prueba por caso; todas pasan):
      * Un servicio recién creado queda atendido por el consultorio de la sede principal, así que no existe un servicio sin recurso (RN-06).
      * Guardar el consultorio con capacidad 0 devuelve `DATOS_INVALIDOS` y la capacidad no cambia (RN-06).
      * Desactivar un servicio conserva sus citas tal como estaban (RN-05: "sus citas existentes se conservan").

* [x] T2.18: Pruebas del límite de servicios del plan
   * Objetivo: Probar que el límite `max_services` se valida en el servidor, llamando directamente a las Server Actions que lo exigen: crear y activar (ARCH §16.3).
   * Archivos: `tests/integracion/app/panel/servicios-limites.test.ts`
   * Depende de: T2.15, T2.17
   * Refs: RN-25, ARCH §16.3
   * Aceptación (una prueba por caso; todas pasan):
      * Con `max_services` alcanzado por una excepción en `negocio_limite`, crear un servicio llamando directamente a la Server Action, sin pasar por la interfaz, devuelve `LIMITE_PLAN` y no crea nada (RN-25).
      * Con el límite alcanzado, activar un servicio inactivo por la misma vía devuelve `LIMITE_PLAN` y el servicio sigue inactivo (RN-25).

### 2.D Horario semanal (PAN-14)

Los casos de ARCH §20 y de RN-07 sobre el horario dependen del motor de disponibilidad y se prueban en la Fase 3. Este módulo no tiene tarea de pruebas de cierre: sus criterios quedan en cada tarea, y la solo lectura se prueba en T2.41.

* [x] T2.19: Validación de la semana
   * Objetivo: Crear `validarSemana(franjas)` en `dominio/horario.ts`. Acepta varias franjas por día y rechaza las que se solapan en el mismo día, con intervalos semiabiertos: dos franjas contiguas no se solapan (D-12, S-04).
   * Archivos: `src/dominio/horario.ts`, `tests/unit/dominio/horario.test.ts`
   * Depende de: T1.25
   * Refs: RN-07, D-12, S-04, ARCH §18.4 (`guardarHorarioSemanal`); Q-18
   * Aceptación:
      * El mismo día se aceptan 8:00–12:00 con 14:00–18:00, y 8:00–12:00 con 12:00–14:00 (contiguas, D-12). En cambio, 8:00–12:00 con 11:00–13:00 devuelve `FRANJAS_SOLAPADAS` con el día afectado.
      * Se rechaza una franja que termina a la misma hora o antes de empezar, o con un día fuera de 1 a 7. La misma franja en días distintos se acepta.

* [x] T2.20: Caso de uso `guardarHorarioSemanal`
   * Objetivo: Implementar `guardarHorarioSemanal` y `leerHorarioSemanal` para la sede principal (`recurso_id` en `NULL`). Guardar valida con T2.19 y reemplaza la semana completa en una transacción (ARCH §17.3).
   * Archivos: `src/servidor/casos-uso/horario.ts`, `src/servidor/db/repositorios/horarios.ts`, `tests/integracion/casos-uso/horario.test.ts`
   * Depende de: T2.01, T2.19
   * Refs: PAN-14, RN-07, RN-32, ARCH §17.3 (`horario_semanal`), §18.4; Q-19, Q-24
   * Aceptación:
      * Guardar una semana reemplaza todas las franjas de la sede principal, sin tocar los horarios de otras sedes ni los horarios propios de los recursos.
      * Con franjas solapadas devuelve `FRANJAS_SOLAPADAS`, y la semana anterior queda intacta.

* [x] T2.21: Página del horario
   * Objetivo: Crear `/panel/configuracion/horario` con los siete días, franjas que se pueden agregar y quitar en cada día, y "Cerrado" en los días sin franjas, más su Server Action.
   * Archivos: `src/app/(panel)/panel/configuracion/horario/page.tsx`, `src/app/(panel)/panel/configuracion/horario/formulario.tsx`, `src/app/(panel)/panel/configuracion/horario/acciones.ts`
   * Depende de: T2.05, T2.20
   * Refs: PAN-14, RN-07, RNF-02; Q-18
   * Aceptación (manual, en local):
      * El dueño guarda el lunes de 8:00 a. m. a 12:00 p. m. y de 2:00 p. m. a 6:00 p. m., y lo ve igual al volver, con las horas en formato de 12 horas (RNF-02).
      * Dos franjas solapadas muestran el error sobre el día afectado.

### 2.E Bloqueos (PAN-08)

* [x] T2.22: Intervalos de días locales
   * Objetivo: Añadir a `dominio/tiempo.ts` la función `intervaloDeDias(desde, hasta, zona)`, que va de las 00:00 locales de `desde` a las 00:00 locales del día siguiente a `hasta`. Un día completo es el caso `desde = hasta`.
   * Archivos: `src/dominio/tiempo.ts`, `tests/unit/dominio/tiempo.test.ts`
   * Depende de: T1.26
   * Refs: RN-03, RN-07, ARCH §9 (reglas 1 y 2), §17.3 (`bloqueo`)
   * Aceptación:
      * El 14-oct-2026 en `America/Bogota` da `[2026-10-14T05:00:00Z, 2026-10-15T05:00:00Z)`, y del 14 al 16 da `[2026-10-14T05:00:00Z, 2026-10-17T05:00:00Z)`.
      * Si `hasta` es anterior a `desde`, lanza un error.

* [x] T2.23: Caso de uso `crearBloqueo`
   * Objetivo: Implementar `crearBloqueo` para la sede principal, con tres tipos: una hora (un rango dentro de un día), un día completo o un rango de días, y un motivo opcional. Dentro de una transacción:
      1. toma con `FOR UPDATE` los recursos de la sede, ordenados por `id`;
      2. busca las citas `confirmada` con `ocupado_hasta > ahora` cuyo intervalo `[inicio, ocupado_hasta)` se solapa con el del bloqueo;
      3. si las hay, responde `BLOQUEO_CON_CITAS` con esas citas; si no, inserta el bloqueo con la sede principal y `recurso_id` en `NULL`.
   * Archivos: `src/servidor/casos-uso/bloqueos.ts`, `src/servidor/db/repositorios/bloqueos.ts`, `tests/integracion/casos-uso/bloqueos.test.ts`
   * Depende de: T2.01, T2.22
   * Refs: PAN-08, F-09, RN-07, D-15, ARCH §11.2, §11.3, §17.3, §18.4
   * Aceptación:
      * Sin citas en el rango, el bloqueo queda guardado con la sede principal y `recurso_id` en `NULL` (ARCH §17.3). Una cita confirmada que ya terminó no lo impide (D-15: "citas confirmadas que aún no terminan").
      * El error `BLOQUEO_CON_CITAS` trae, para cada cita, su inicio, su servicio y el nombre del cliente, para que el panel la liste (F-09).
      * La transacción toma los bloqueos de fila antes de buscar las citas (revisión del código). La prueba de concurrencia con una reserva va en la Fase 3.

* [x] T2.24: Listar y eliminar bloqueos
   * Objetivo: Implementar `listarBloqueos`, con los bloqueos vigentes y futuros de la sede principal ordenados por inicio, y `eliminarBloqueo`.
   * Archivos: `src/servidor/casos-uso/bloqueos.ts`, `src/servidor/db/repositorios/bloqueos.ts`, `tests/integracion/casos-uso/bloqueos.test.ts`
   * Depende de: T2.23
   * Refs: PAN-08, ARCH §6; Q-19
   * Aceptación:
      * La lista no incluye los bloqueos que ya terminaron ni los de otros negocios.
      * Eliminar un bloqueo inexistente o de otro negocio devuelve `NO_ENCONTRADO`.

* [x] T2.25: Página de bloqueos
   * Objetivo: Crear `/panel/bloqueos` con sus Server Actions: el formulario (tipo, fechas, horas y motivo), la lista con fecha y hora locales, y un botón para eliminar con confirmación. Ante `BLOQUEO_CON_CITAS`, la página lista las citas que impiden el bloqueo.
   * Archivos: `src/app/(panel)/panel/bloqueos/page.tsx`, `src/app/(panel)/panel/bloqueos/formulario.tsx`, `src/app/(panel)/panel/bloqueos/acciones.ts`
   * Depende de: T2.03, T2.05, T2.24
   * Refs: PAN-08, F-09, D-15, RNF-02; Q-18
   * Aceptación (manual, en local):
      * El dueño crea un bloqueo de una hora, uno de día completo y uno de un rango de días, los ve en la lista en hora de Colombia y elimina uno.
      * Con una cita confirmada en el rango, creada por SQL en `development`, el panel lista esa cita y no crea el bloqueo (F-09).

* [x] T2.26: Pruebas de bloqueos
   * Objetivo: Probar la regla de D-15 en `crearBloqueo`. El otro caso de ARCH §20 (un bloqueo y una reserva simultáneos) va en la Fase 3, cuando exista `reservarCita`.
   * Archivos: `tests/integracion/casos-uso/bloqueos-reglas.test.ts`
   * Depende de: T2.02, T2.24
   * Refs: RN-07, D-15, ARCH §20 (Bloqueos)
   * Aceptación (una prueba por caso; todas pasan):
      * Un bloqueo que se solapa con una cita confirmada se rechaza con `BLOQUEO_CON_CITAS` y no se guarda (RN-07; ARCH §20, Bloqueos).
      * El rechazo trae esa cita, para que el panel la muestre (RN-07: "se rechaza y muestra esa cita").

### 2.F Reglas, recordatorio, política e inicio del panel (PAN-15 a PAN-18)

* [x] T2.27: Casos de uso de las reglas de reserva y el recordatorio
   * Objetivo: Implementar `leerConfiguracion`, `guardarReglasReserva` y `guardarRecordatorio`.
      * `guardarReglasReserva` guarda la granularidad (15, 30 o 60), la anticipación mínima en minutos, la máxima en días (de 1 a 365), el plazo de cancelación en horas, el límite de reprogramaciones (vacío = sin límite; 0 = no se permite) y la asistencia por defecto.
      * `guardarRecordatorio` guarda las horas antes de la cita, o "ninguno", que se guarda como `NULL`.
   * Archivos: `src/servidor/casos-uso/configuracion.ts`, `src/servidor/db/repositorios/configuracion.ts`, `tests/integracion/casos-uso/configuracion.test.ts`
   * Depende de: T1.41
   * Refs: PAN-15, PAN-16, RN-08, RN-09, RN-13, RN-16, RN-21, RN-34, D-09, D-20, D-21, ARCH §18.2 (`configuracion_negocio`); Q-19, Q-23
   * Aceptación:
      * Guardar cambia solo la fila de `configuracion_negocio` del negocio del contexto.
      * El límite de reprogramaciones vacío se guarda como sin límite (`NULL`), y 0 se guarda como "no se permite" (RN-34).
      * `guardarRecordatorio` con "ninguno" deja `recordatorio_horas_antes` en `NULL`, y con 0 devuelve `DATOS_INVALIDOS`.

* [x] T2.28: Página de reglas de reserva
   * Objetivo: Crear `/panel/configuracion/reglas` con los campos de PAN-15 y su Server Action. Cada campo lleva su unidad y una ayuda que explica su efecto.
   * Archivos: `src/app/(panel)/panel/configuracion/reglas/page.tsx`, `src/app/(panel)/panel/configuracion/reglas/formulario.tsx`, `src/app/(panel)/panel/configuracion/reglas/acciones.ts`
   * Depende de: T2.05, T2.27
   * Refs: PAN-15, RN-08, RN-34, D-09, D-21; Q-18
   * Aceptación (manual, en local):
      * En un negocio nuevo, la página muestra los valores por defecto de D-09 y guarda los cambios.
      * La asistencia por defecto ofrece "Asistió", "No asistió" y "Siempre decido yo" (D-21). La ayuda del límite de reprogramaciones explica que vacío es sin límite y que 0 no permite reprogramar (RN-34).

* [x] T2.29: Página de recordatorios
   * Objetivo: Crear `/panel/configuracion/recordatorios` con el momento del recordatorio (PAN-16) y su Server Action.
   * Archivos: `src/app/(panel)/panel/configuracion/recordatorios/page.tsx`, `src/app/(panel)/panel/configuracion/recordatorios/formulario.tsx`, `src/app/(panel)/panel/configuracion/recordatorios/acciones.ts`
   * Depende de: T2.28
   * Refs: PAN-16, RN-21, S-12; Q-18
   * Aceptación (manual, en local):
      * El dueño elige un número de horas antes de la cita o "Ninguno", y al volver ve lo que guardó.
      * La ayuda aclara que una cita reservada después de ese momento no recibe recordatorio (S-12).

* [x] T2.30: Casos de uso de la política de datos
   * Objetivo: Implementar `listarPoliticas` y `publicarPolitica`. Publicar crea la versión siguiente con el texto nuevo, sin modificar las anteriores; la vigente es la de mayor versión.
   * Archivos: `src/servidor/casos-uso/politica-datos.ts`, `src/servidor/db/repositorios/politicas.ts`, `tests/integracion/casos-uso/politica-datos.test.ts`
   * Depende de: T1.44
   * Refs: PAN-17, D-05, RN-17, ARCH §17.3 (`politica_datos`), §18.3; Q-19
   * Aceptación:
      * Publicar en un negocio con la v1 crea la v2, y la v1 conserva su contenido y su fecha (ARCH §18.3: "La política aceptada no cambia").
      * Un texto vacío devuelve `DATOS_INVALIDOS`, y el repositorio no expone ninguna función de `UPDATE` ni de `DELETE` sobre `politica_datos`.

* [x] T2.31: Página de la política de datos
   * Objetivo: Crear `/panel/configuracion/politica` con su Server Action. La página tiene el editor del texto (Markdown), que parte de la versión vigente; un botón para partir de la plantilla del SaaS; el historial de versiones con su fecha; y un aviso de que publicar crea una versión nueva, que aplica a las reservas siguientes.
   * Archivos: `src/app/(panel)/panel/configuracion/politica/page.tsx`, `src/app/(panel)/panel/configuracion/politica/formulario.tsx`, `src/app/(panel)/panel/configuracion/politica/acciones.ts`
   * Depende de: T2.05, T2.30
   * Refs: PAN-17, D-05, RN-17; Q-10 (TASKS-01), Q-18
   * Aceptación (manual, en local):
      * El dueño publica una versión nueva y la ve encabezando el historial; la anterior sigue en la lista.
      * "Usar la plantilla" carga el texto de `politicaInicial` con el nombre del negocio.

* [x] T2.32: Inicio del panel: lista de verificación y enlace público
   * Objetivo: Implementar `estadoConfiguracion` (cuántos servicios activos y franjas de horario tiene la sede principal) y reemplazar la página provisional de `/panel` por dos cosas: la lista de verificación de F-05 (paso 3) y el enlace a la página pública con el aviso de PAN-18 (Q-22).
   * Archivos: `src/servidor/casos-uso/estado-configuracion.ts`, `src/app/(panel)/panel/page.tsx`, `tests/integracion/casos-uso/estado-configuracion.test.ts`
   * Depende de: T2.05, T2.13, T2.20
   * Refs: F-05, PAN-18, RN-32; Q-22
   * Aceptación:
      * Sin servicios activos o sin franjas, la lista marca lo que falta, y el aviso dice que la página pública mostrará "Aún no hay horarios disponibles" (F-05, paso 4). Con ambos, el aviso desaparece. Se comprueba con una prueba de integración del caso de uso y con una revisión manual.
      * El enlace apunta a `{APP_URL}/{slug}`, la página que llega en la Fase 4.

* [x] T2.33: Pruebas de la configuración
   * Objetivo: Probar las reglas de la configuración de reservas en los casos de uso del módulo.
   * Archivos: `tests/integracion/casos-uso/configuracion-reglas.test.ts`
   * Depende de: T2.02, T2.27
   * Refs: RN-08
   * Aceptación (una prueba por caso; todas pasan):
      * La granularidad acepta 15, 30 y 60 (RN-08).
      * Cualquier otro valor, como 20, devuelve `DATOS_INVALIDOS` y no cambia nada (RN-08: "la configuración solo acepta esos tres valores").

### 2.G Suscripción: acciones del admin (ADM-03)

Entra en esta fase por el supuesto de Q-04 (TASKS-01). Si esa pregunta se responde de otra forma, el módulo se mueve completo a la fase que se elija.

* [x] T2.34: Caso de uso `registrarPago`
   * Objetivo: Implementar `registrarPago`. Recibe el negocio y la nueva fecha de "pagado hasta" como fecha local inclusiva y, en una sola sentencia auditada con el admin como autor, deja `estado_suscripcion = 'activa'` y el nuevo `pagado_hasta` (las 00:00 locales del día siguiente).
   * Archivos: `src/servidor/casos-uso/suscripcion-admin.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/suscripcion-admin.test.ts`
   * Depende de: T1.26, T1.47
   * Refs: ADM-03, RN-04, RN-29, RN-30, RN-31, D-13, ARCH §7.6, §18.4; Q-04 (TASKS-01)
   * Aceptación:
      * Una fecha que no supera el `pagado_hasta` actual devuelve `DATOS_INVALIDOS`, y un negocio inexistente, `NO_ENCONTRADO`.
      * "Pagado hasta 2026-11-09" se guarda como `2026-11-10T05:00:00Z` (ARCH §7.6).

* [x] T2.35: Caso de uso `suspenderNegocio`
   * Objetivo: Implementar `suspenderNegocio`. En una transacción con el admin como autor, pasa el negocio a `suspendida` y encola C-08 (`dueno_suspension`, sin cita) para cada dueño, con la clave de idempotencia de ARCH §14.1. El envío llega en la Fase 6.
   * Archivos: `src/servidor/casos-uso/suscripcion-admin.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/suscripcion-admin.test.ts`
   * Depende de: T2.34
   * Refs: ADM-03, RN-04, RN-30, S-16, ARCH §7.6, §14.1, §18.4
   * Aceptación:
      * Suspender crea una notificación `dueno_suspension` pendiente, sin `cita_id`, dirigida al correo del dueño.
      * Suspender un negocio que ya está suspendido devuelve `ESTADO_INVALIDO` y no crea otra notificación.

* [x] T2.36: Caso de uso `cambiarFinPrueba`
   * Objetivo: Implementar `cambiarFinPrueba` (ADM-03), que recibe la nueva fecha de fin de prueba como fecha local inclusiva. Solo aplica a negocios en `prueba` (Q-25), y el cambio queda auditado con el admin como autor.
   * Archivos: `src/servidor/casos-uso/suscripcion-admin.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/suscripcion-admin.test.ts`
   * Depende de: T2.35
   * Refs: ADM-03, RN-30, RN-31, ARCH §7.6; Q-19, Q-25
   * Aceptación:
      * Cambia `fin_prueba` a las 00:00 locales del día siguiente a la fecha elegida.
      * Con el negocio en `activa` o en `suspendida`, devuelve `ESTADO_INVALIDO` (Q-25).

* [x] T2.37: `/admin`: detalle del negocio
   * Objetivo: Crear `/admin/negocios/{id}` con los datos de la suscripción (estado, vencimiento como fecha local inclusiva y estado efectivo), con un caso de uso `detalleNegocioAdmin`, y enlazar cada fila de la lista de ADM-01 a su detalle.
   * Archivos: `src/servidor/casos-uso/detalle-negocio-admin.ts`, `src/app/(admin)/admin/negocios/[id]/page.tsx`, `src/app/(admin)/admin/page.tsx`
   * Depende de: T1.48
   * Refs: ADM-01, ADM-03, RN-31, ARCH §6, §7.6; Q-18, Q-19
   * Aceptación (manual, en local):
      * Cada fila de la lista abre el detalle de su negocio.
      * Un id inexistente responde 404.

* [x] T2.38: `/admin`: acciones de suscripción
   * Objetivo: Agregar al detalle los formularios y sus Server Actions, detrás de `requireSuperadmin`: registrar un pago, cambiar el fin de la prueba (solo en `prueba`) y suspender, con confirmación.
   * Archivos: `src/app/(admin)/admin/negocios/[id]/page.tsx`, `src/app/(admin)/admin/negocios/[id]/acciones.ts`, `src/app/(admin)/admin/negocios/[id]/formularios.tsx`
   * Depende de: T2.36, T2.37
   * Refs: ADM-03, PAN-19, RN-31, D-14
   * Aceptación (manual, en local):
      * Al registrar un pago, un negocio suspendido queda "Al día" en la lista, y su dueño vuelve a poder guardar cambios en el panel.
      * Suspender pide confirmación, y después el panel del dueño queda en solo lectura con su aviso (PAN-19).

* [x] T2.39: Pruebas de la suscripción desde el admin
   * Objetivo: Probar los efectos de las acciones de ADM-03 sobre el acceso del dueño y la auditoría.
   * Archivos: `tests/integracion/casos-uso/suscripcion-admin-reglas.test.ts`
   * Depende de: T2.02, T2.36
   * Refs: RN-04, RN-29, RN-30, RN-31, ARCH §20 (Suscripción)
   * Aceptación (una prueba por caso; todas pasan):
      * `registrarPago` reactiva de inmediato: con el negocio suspendido, después del pago `requireEscritura` deja escribir sin que corra ninguna tarea (RN-31; ARCH §20: "registrarPago reactiva").
      * Después de `suspenderNegocio`, el dueño conserva el acceso al panel, y cualquier cambio devuelve `NEGOCIO_SUSPENDIDO` (RN-04, RN-29).
      * `registrarPago`, `suspenderNegocio` y `cambiarFinPrueba` quedan en `auditoria_admin` con el admin como autor y con los valores anterior y nuevo (RN-30).

### 2.H Cierre de la fase

* [x] T2.40: Pruebas multi-negocio de la fase
   * Objetivo: Probar, con las Server Actions de esta fase que reciben identificadores del cliente, que un dueño no alcanza datos de otro negocio.
   * Archivos: `tests/integracion/app/panel/multi-negocio.test.ts`
   * Depende de: T2.15, T2.25
   * Refs: RN-01, ARCH §6, §20 (Multi-negocio)
   * Aceptación (una prueba por caso; todas pasan):
      * Desde la sesión del dueño de A, editar, activar o desactivar un servicio de B devuelve `NO_ENCONTRADO`, y B no cambia (RN-01).
      * Desde la sesión de A, eliminar un bloqueo de B devuelve `NO_ENCONTRADO`, y el bloqueo sigue (RN-01).

* [x] T2.41: Pruebas de solo lectura
   * Objetivo: Probar cada Server Action de escritura de la fase con el negocio suspendido.
   * Archivos: `tests/integracion/app/panel/solo-lectura.test.ts`
   * Depende de: T2.11, T2.16, T2.21, T2.29, T2.31, T2.40
   * Refs: RN-04, D-14, ARCH §20 (Suscripción)
   * Aceptación (una prueba por caso; todas pasan):
      * Con el negocio suspendido, cada Server Action que modifica datos en esta fase (negocio, logo, servicios, consultorio, horario, bloqueos, reglas, recordatorio y política) devuelve `NEGOCIO_SUSPENDIDO` y no cambia nada (RN-04; ARCH §20).
      * Con el negocio suspendido, las lecturas de esas páginas siguen funcionando (ARCH §20: "se puede consultar").

* [x] T2.42: Despliegue y verificación de la fase
   * Objetivo: Desplegar la fase con `npm run deploy` y recorrer en `*.workers.dev` la configuración completa de un negocio de prueba.
   * Archivos: — (el commit anota el tamaño del Worker, como pide Q-17 de TASKS-01)
   * Depende de: T2.32, T2.38, T2.39, T2.41
   * Refs: RNF-09, ARCH §21.4, §23; Q-17 (TASKS-01)
   * Aceptación:
      * `npm run deploy` termina sin errores, sin migraciones pendientes, y el tamaño del Worker queda anotado en el commit (Q-17, TASKS-01).
      * En el Worker desplegado, el dueño sube un logo, que se sirve desde R2; crea un servicio, guarda el horario, crea y elimina un bloqueo, y ajusta las reglas, el recordatorio y la política. Al final, la lista de verificación de `/panel` está completa.
      * El admin suspende el negocio y el panel pasa a solo lectura; después registra un pago y el panel vuelve a funcionar.

---

## Preguntas

Puntos que el PRD y ARCHITECTURE no definían. Todas quedaron resueltas el 2026-10-18, igual que las de [TASKS-01](TASKS-01.md#preguntas).

| ID | Pregunta | Decisión | Afecta a |
|---|---|---|---|
| Q-18 | ARCH §4 no ubica los archivos ni las rutas nuevas de esta fase. Archivos: `src/dominio/formato.ts`, `imagen.ts` y `horario.ts`; `src/servidor/archivos/imagenes.ts`; los repositorios `sedes`, `recursos`, `servicios`, `horarios`, `bloqueos`, `configuracion` y `politicas`; y `src/componentes/`. Rutas: `/panel/configuracion/{negocio, servicios, consultorio, horario, reglas, recordatorios, politica}`, `/panel/bloqueos`, `/admin/negocios/{id}` y `/api/media/{clave}`. ¿Se aceptan? | **Resuelta (2026-10-18):** las rutas indicadas. | Casi todas las tareas |
| Q-19 | ARCH §18.4 no define las operaciones de PAN-11, PAN-13 y PAN-15 a PAN-17, ni las de activar y desactivar servicios, listar y eliminar bloqueos, cambiar el fin de la prueba o ver el detalle de un negocio en el admin. | **Resuelta (2026-10-18):** esos nombres. Las del dueño que escriben empiezan con `requireEscritura`, y todas usan los códigos de ARCH §18.5. Quedaron agregadas a ARCH §18.4 (v0.10). | T2.09–T2.14, T2.20, T2.24, T2.27, T2.30, T2.36, T2.37 |
| Q-20 | El esquema no marca cuál es la "Sede principal" ni cuál es su consultorio. ¿Cómo se identifican? | **Resuelta (2026-10-18):** la sede activa con menor (`orden`, `creado_en`) y, en ella, el recurso `consultorio` activo con menor (`orden`, `creado_en`). En el MVP hay exactamente uno de cada uno. | T2.01 y todo lo que actúa sobre la sede principal |
| Q-21 | ARCH §2 y §19.2 dicen dónde se guardan los logos (R2, con nombre aleatorio), pero no cómo se sirven, ni qué pasa con el archivo anterior al reemplazarlo. | **Resuelta (2026-10-18):** una ruta del Worker, `GET /api/media/{clave}` (bajo `api`, que ya es un slug reservado), lee del binding `MEDIA` y responde con `Cache-Control: public, max-age=31536000, immutable` y `X-Content-Type-Options: nosniff`. El bucket no es público. `negocio.logo_url` guarda esa ruta, y al reemplazar o quitar el logo, el anterior se borra de R2. | T2.07, T2.08, T2.10 |
| Q-22 | La lista de verificación de F-05 solo tiene un criterio de "hecho" para los servicios y el horario (F-05, paso 4; PAN-18). La marca, las reglas, el recordatorio y la política ya tienen valores por defecto (D-09 y la plantilla), y no hay ningún dato que diga si el dueño los revisó. | **Resuelta (2026-10-18):** los servicios (al menos uno activo) y el horario (al menos una franja) son obligatorios y muestran su estado. Los otros cuatro aparecen como enlaces para revisar, sin estado, y no se guarda si el dueño ya los revisó. | T2.32 |
| Q-23 | ARCH §14.1 dice que cambiar `recordatorio_horas_antes` recalcula los recordatorios pendientes de citas futuras, pero no define qué pasa al pasar a "ninguno" (¿se cancelan?), al pasar de "ninguno" a un valor (¿se crean para las citas futuras?) ni cuando el nuevo momento ya pasó (S-12). | **Resuelta (2026-10-18):** la Fase 2 solo guarda el valor. En la Fase 6, al cambiarlo: pasar a "ninguno" anula los recordatorios pendientes; pasar de "ninguno" a un valor los crea para las citas futuras confirmadas; y la cita cuyo nuevo momento ya pasó no lleva recordatorio (como S-12). | T2.27, Fase 6 |
| Q-24 | ¿Qué pasa con las citas existentes cuando un cambio de configuración las deja fuera de las reglas nuevas, como un horario que ya no las cubre o una capacidad menor que las citas simultáneas? D-15 solo cubre los bloqueos. | **Resuelta (2026-10-18):** no se avisa ni se tocan las citas, igual que en RN-28: reducir un límite no borra datos. Las reglas nuevas solo aplican a las reservas siguientes. | T2.14, T2.20 |
| Q-25 | ADM-03 permite cambiar el fin de la prueba. ¿También con el negocio suspendido (una prueba vencida que el cron suspendió), y en ese caso vuelve a `prueba`? | **Resuelta (2026-10-18):** solo con el negocio en `prueba`. Un negocio suspendido se reactiva con `registrarPago`. | T2.36, T2.38 |
| Q-26 | Todavía no existe `docs/DESIGN.md` con el diseño de Claude Design. | **Resuelta (2026-10-18):** el diseño de Claude Design llega antes de la Fase 4, en `docs/DESIGN.md`. Hasta entonces, las pantallas usan el estilo de la Fase 1 (Tailwind con `teal` y `zinc`) a través de los componentes de T2.04; cuando llegue, se ajustan los componentes y se revisa cada pantalla por sus IDs PAN-xx. | T2.04, T2.05 y las páginas del panel |
