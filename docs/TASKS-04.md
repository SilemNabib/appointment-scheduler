# Agenda de citas (SaaS) — Tareas de la Fase 4

| | |
|---|---|
| **Versión** | 0.1 (borrador) |
| **Fecha** | 2026-10-20 |
| **Fuentes** | [PRD.md](PRD.md) v0.9 · [ARCHITECTURE.md](ARCHITECTURE.md) v0.12 · [DESIGN.md](DESIGN.md) v1.0 · [TASKS-03.md](TASKS-03.md) |

> El PRD manda en el **qué** y ARCHITECTURE en el **cómo**. DESIGN.md describe cómo se ve y se comporta la interfaz; donde difiere del PRD, prevalece el PRD (DESIGN, encabezado). Si una tarea contradice a alguno de los tres, se corrige la tarea. El formato de las tareas, sus marcas y la definición de terminado están en [TASKS-00](TASKS-00.md). Lo que los documentos no definen está en [Preguntas](#preguntas): las nuevas siguen la numeración de TASKS-03 (desde Q-37), y las anteriores se citan con su documento, como "Q-35 (TASKS-03)".

## Fase 4: página pública de reservas

### Alcance

**Entra:**

- La página pública `/{slug}` (ARCH §4, §5) con el flujo F-01 completo sobre los contratos HTTP de la Fase 3: encabezado con la marca y la sede (PUB-01), servicios (PUB-02), día y hora (PUB-03, PUB-04), datos y política (PUB-05) y confirmación (PUB-06).
- Los estados de la página: negocio suspendido (PUB-07), "Aún no hay horarios disponibles" (F-05, paso 4), hora ocupada al confirmar y día sin horas (F-01, casos límite) y el mensaje de demasiadas solicitudes (PUB-08, solo la interfaz; Q-35 de TASKS-03).
- La página de la política vigente, enlazada desde la casilla de PUB-05 (RN-17).
- Las decisiones D-26 a D-29 del PRD v0.9, con su modelo de datos, sus casos de uso y sus campos en el panel (PAN-11, PAN-12): categorías de servicio, marca ampliada, código de reserva y contactos de la sede (Q-37).
- Los tokens, la tipografía y los componentes de DESIGN.md, aplicados a la página pública y a los componentes compartidos del panel (Q-44).
- Los encabezados de seguridad de ARCH §19.2 (Q-47).

**No entra:**

- La gestión de la cita por link (GES-01 a GES-05) y los correos, incluido el código de reserva y la invitación de calendario en C-01 (Fase 6).
- El binding del límite de frecuencia (RN-23), que llega en la Fase 8 (Q-35, TASKS-03). La página ya muestra el mensaje cuando la API responde 429.
- La revisión del panel pantalla por pantalla según DESIGN §4.3, con su navegación nueva (Fase 5; Q-44).
- La interfaz de varias sedes y el selector de sede (D-16), los profesionales (D-24), el precio (D-25), los controles de demo (D-31) y el campo de notas del cliente (Q-43).
- La prueba de humo E2E de ARCH §20 (opcional): reserva y cancela con el link, así que necesita la Fase 6. Va con la integración continua de la Fase 8.
- La redacción definitiva y la revisión legal de la política (Q-10, TASKS-01) y lo que muestra la raíz `/` (Q-15, TASKS-01).

**Criterio de salida:** T4.31, el despliegue y la verificación de la fase en el Worker.

### Convenciones de la fase

- Antes de escribir rutas, páginas o configuración de Next, se lee la guía correspondiente en `node_modules/next/dist/docs/` (AGENTS.md): rutas dinámicas y `params`, `generateMetadata`, `not-found`, `next/font` y `headers()`. Next 16 no es el de los datos de entrenamiento.
- La página pública no carga Clerk (ARCH §7.2, RNF-01) y no usa Server Actions para reservar: consulta y reserva con los contratos HTTP de ARCH §18.5, para que el límite de frecuencia de la Fase 8 los cubra sin cambios.
- Toda fecha y hora se muestra con la zona del negocio, con `dominio/formato.ts`, nunca con la del dispositivo (RN-03, ARCH §9, regla 3).
- Con una sola sede activa, la página usa la sede principal (Q-20, TASKS-02) y nunca muestra la palabra "sede" ni un selector de sede (RN-32, ARCH §5).
- La lógica de la interfaz que puede ser pura (calendario, contraste, código de reserva, contactos y resumen del horario) va en `src/dominio/`, con su prueba unitaria en la misma tarea. Las pantallas tienen aceptación manual a 360 px de ancho (RNF-01), como en la Fase 2.
- Las migraciones son compatibles hacia atrás (ARCH §8): una columna que deja de usarse no se borra en esta fase (Q-40).
- La fase se despliega en el plan gratuito de Workers (Q-36, TASKS-03). Cada despliegue anota el tamaño del Worker y el CPU medido.
- Las rutas y los archivos nuevos que ARCH §4 no ubica están en Q-49.

### 4.A Modelo de datos (D-26 a D-29)

Cada tarea cumple los criterios E1 y E2 de [TASKS-01 §1.B](TASKS-01.md#1b-base-de-datos-esquema-y-migraciones) y depende de la anterior para mantener lineal la cadena de migraciones. El SQL debe coincidir con ARCH §18.2 (v0.12), que recoge el modelo de Q-38 a Q-41.

* [x] T4.01: Esquema: marca ampliada y categoría de servicio
   * Objetivo: Agregar a `negocio` el rubro, el eslogan, la frase del banner y la descripción (D-27), y a `servicio` la categoría (D-26), según Q-38 y Q-39. Cambiar el valor por defecto de `negocio.color_primario` a `#2b3fd6` (Q-42).
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T3.33
   * Refs: PUB-01, PUB-02, PAN-11, PAN-12, D-26, D-27, ARCH §18.1, §18.2; Q-38, Q-39, Q-42
   * Aceptación:
      * E1 y E2.
      * Las cinco columnas admiten `NULL` y tienen el `CHECK` de longitud de Q-38 y Q-39. Los negocios existentes conservan su `color_primario`.

* [x] T4.02: Esquema: contactos de la sede
   * Objetivo: Crear el enum `tipo_contacto` y la tabla `contacto_sede` de Q-40, con FK directa a `negocio` y FK compuesta `(sede_id, negocio_id)` (ARCH §18.1). Una migración manual copia cada `sede.telefono` no vacío como un contacto `telefono`.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración generada y nueva migración manual en `drizzle/`
   * Depende de: T4.01
   * Refs: PUB-01, PAN-11, F-02, D-29, ARCH §6 (defensa 2), §18.1; Q-40
   * Aceptación:
      * E1 y E2.
      * En `development`, cada sede que tenía teléfono tiene un contacto `telefono` con ese valor, y `sede.telefono` no cambió.
      * Dentro de `BEGIN … ROLLBACK`, un contacto con la sede de otro negocio falla por la FK compuesta, y borrar el negocio borra sus contactos (ARCH §18.1).

* [x] T4.03: Esquema: código de reserva
   * Objetivo: Agregar `cita.codigo` con `UNIQUE (negocio_id, codigo)` y el `CHECK` de formato de Q-41 (D-28). La migración generada se edita para agregar la columna sin `NOT NULL`, rellenar las citas existentes y después fijar `NOT NULL`. Como la columna es obligatoria, `crearPublica` recibe el código y `reservarCita` lo genera con T4.04, todavía sin los reintentos (Q-50), y las pruebas que insertan citas directamente le ponen uno.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`, `src/servidor/db/repositorios/citas.ts`, `src/servidor/casos-uso/reservar-cita.ts`, las pruebas de `tests/integracion/` que insertan en `cita`
   * Depende de: T4.04
   * Refs: PUB-06, D-28, ARCH §8, §18.2 (`cita`); Q-41, Q-50
   * Aceptación:
      * E1 y E2. La migración se aplica sin errores sobre una rama con citas.
      * En `development`, toda cita tiene un código con el formato de Q-41, sin repetidos dentro de su negocio.
      * Una reserva nueva queda con un código con el prefijo del nombre de su negocio.

### 4.B Casos de uso del modelo nuevo

* [x] T4.04: Dominio: código de reserva
   * Objetivo: Crear en `dominio/codigo-reserva.ts` el prefijo que sale del nombre del negocio y la generación del código con el formato de Q-41. El azar llega como parámetro, para que el dominio siga siendo puro (ARCH §4).
   * Archivos: `src/dominio/codigo-reserva.ts`, `tests/unit/dominio/codigo-reserva.test.ts`
   * Depende de: T4.02 (va antes de T4.03; Q-50)
   * Refs: D-28, ARCH §4; Q-41
   * Aceptación:
      * "Óptica Visión Clara" da el prefijo `OV`, y "Ébano" da `EB`: sin tildes y en mayúsculas. Un nombre sin letras da `XX`.
      * Con un azar fijo, el código es `OV-0042`. Con 6 dígitos, `OV-000042`. Todo código cumple el `CHECK` de Q-41 (T4.03).

* [x] T4.05: La reserva genera el código
   * Objetivo: Completar el código de la reserva de T4.03: comprobar dentro de la transacción (T3.19) que el código esté libre, con los reintentos de Q-41, y devolverlo. `POST /api/publico/{slug}/reservas` responde `{ citaId, codigo, inicio, fin }` (cambio aditivo del contrato de ARCH §18.5).
   * Archivos: `src/servidor/casos-uso/reservar-cita.ts`, `src/servidor/db/repositorios/citas.ts`, `src/app/api/publico/[slug]/reservas/route.ts`, `tests/integracion/casos-uso/reservar-cita.test.ts`
   * Depende de: T4.03
   * Refs: PUB-06, D-28, RN-11, ARCH §11, §18.4, §18.5; Q-41, Q-50
   * Aceptación:
      * Una reserva válida responde 201 con un `codigo` igual al que quedó en la cita, con el prefijo del nombre del negocio.
      * Con el azar simulado para que el primer código choque con una cita existente, la reserva sale con otro código y no falla (Q-41).
      * Pasan sin cambios las pruebas de concurrencia de T3.22 y de bloqueo de T3.23.

* [x] T4.06: Dominio: contactos
   * Objetivo: Crear en `dominio/contactos.ts` la validación de una lista de contactos (tipo, valor y etiqueta opcional, con los máximos de Q-40), la normalización de cada valor (teléfono y WhatsApp a E.164 con `normalizarTelefono`, correo en minúsculas) y los enlaces de cada tipo: `https://wa.me/…`, `tel:…`, `mailto:…`, y el de Google Maps para una dirección (D-30).
   * Archivos: `src/dominio/contactos.ts`, `tests/unit/dominio/contactos.test.ts`
   * Depende de: T4.02
   * Refs: PUB-01, PUB-07, D-29, D-30, ARCH §12; Q-40
   * Aceptación:
      * Un WhatsApp "300 123 4567" da `+573001234567` y el enlace `https://wa.me/573001234567`. Un teléfono no válido, un correo mal formado o más contactos que el máximo devuelven un error que indica qué contacto falló.
      * El enlace de Google Maps codifica la dirección ("Cra. 7 # 12-34, Bogotá") en el parámetro `query`.

* [x] T4.07: Caso de uso `guardarContactos` y alta con contacto
   * Objetivo: Implementar `listarContactos` y `guardarContactos`, que reemplaza en una transacción la lista de contactos de la sede principal (Q-20, TASKS-02), empieza con `requireEscritura` y valida con T4.06. `altaNegocio` pasa a crear el teléfono de la sede principal como contacto `telefono`, y `guardarNegocio` deja de escribir `sede.telefono` (Q-40).
   * Archivos: `src/servidor/casos-uso/contactos.ts`, `src/servidor/db/repositorios/contactos.ts`, `src/servidor/casos-uso/alta-negocio.ts`, `src/servidor/casos-uso/guardar-negocio.ts`, `tests/integracion/casos-uso/contactos.test.ts`
   * Depende de: T4.06
   * Refs: PAN-11, F-11, D-14, D-29, ARCH §6, §7.5, §18.4; Q-12 (TASKS-01), Q-40
   * Aceptación:
      * Guardar una lista reemplaza los contactos de la sede principal del negocio del contexto, en el orden recibido, y no toca los de otras sedes ni otros negocios (ARCH §6).
      * Una lista inválida devuelve `DATOS_INVALIDOS` y la lista anterior queda intacta.
      * Un alta con teléfono crea su contacto `telefono` y deja `sede.telefono` en `NULL`.

* [x] T4.08: Marca ampliada en `guardarNegocio`
   * Objetivo: Ampliar `guardarNegocio` y su lectura con el rubro, el eslogan, la frase del banner y la descripción (D-27). Un texto vacío o solo con espacios se guarda como `NULL`.
   * Archivos: `src/servidor/casos-uso/guardar-negocio.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/guardar-negocio.test.ts`
   * Depende de: T4.01
   * Refs: PAN-11, D-27, ARCH §18.4; Q-38
   * Aceptación:
      * Los cuatro campos se guardan y se leen. Uno que pasa su longitud máxima devuelve `DATOS_INVALIDOS` y no cambia nada.
      * Pasan sin cambios las demás pruebas de `guardarNegocio` de T2.09.

* [x] T4.09: Categoría en `guardarServicio`
   * Objetivo: Agregar la categoría a `guardarServicio` (recortada; vacía = sin categoría) y crear `listarCategorias`, con las categorías distintas del negocio, para sugerirlas en el formulario (Q-39).
   * Archivos: `src/servidor/casos-uso/servicios.ts`, `src/servidor/db/repositorios/servicios.ts`, `tests/integracion/casos-uso/servicios.test.ts`
   * Depende de: T4.01
   * Refs: PAN-12, D-26; Q-39
   * Aceptación:
      * Crear y editar un servicio guarda su categoría. " Lentes " queda como "Lentes", y una categoría vacía queda en `NULL`.
      * `listarCategorias` devuelve cada categoría una vez, sin las de otros negocios (ARCH §6).

* [x] T4.10: Página "Negocio": marca y contactos
   * Objetivo: Agregar a `/panel/configuracion/negocio` el rubro, el eslogan, la frase del banner y la descripción, y reemplazar el campo de teléfono por la lista de contactos: agregar, quitar, ordenar y elegir el tipo de cada uno. Cada parte tiene su Server Action.
   * Archivos: `src/app/(panel)/panel/configuracion/negocio/page.tsx`, `src/app/(panel)/panel/configuracion/negocio/formulario.tsx`, `src/app/(panel)/panel/configuracion/negocio/contactos.tsx`, `src/app/(panel)/panel/configuracion/negocio/acciones.ts`
   * Depende de: T4.07, T4.08
   * Refs: PAN-11, D-14, D-27, D-29, RN-32, RNF-03; Q-38, Q-40
   * Aceptación (manual, en local):
      * El dueño llena los cuatro textos, agrega un WhatsApp, un teléfono y un correo, cambia su orden y quita uno. Al volver, ve lo que guardó. Un teléfono no válido muestra el error junto a ese contacto.
      * La página no menciona sedes (RN-32). Con el negocio suspendido, el formulario aparece deshabilitado (D-14).

* [x] T4.11: Página de servicios: categoría
   * Objetivo: Agregar la categoría al formulario de `/panel/configuracion/servicios`, con las categorías existentes como sugerencias (`<datalist>`), y mostrarla en la lista.
   * Archivos: `src/app/(panel)/panel/configuracion/servicios/page.tsx`, `src/app/(panel)/panel/configuracion/servicios/formulario.tsx`, `src/app/(panel)/panel/configuracion/servicios/acciones.ts`
   * Depende de: T4.09
   * Refs: PAN-12, D-26; Q-39
   * Aceptación (manual, en local):
      * El dueño asigna "Exámenes" a un servicio; al crear otro, "Exámenes" aparece como sugerencia.
      * La lista muestra la categoría de cada servicio, y los que no tienen aparecen sin ella.

### 4.C Base visual (DESIGN.md)

* [x] T4.12: Tokens, tipografía y movimiento
   * Objetivo: Reemplazar el estilo de la Fase 1 en `globals.css` por los tokens de DESIGN §2.1 como variables CSS y tema de Tailwind, con solo el tema claro (Q-44). Cargar Bricolage Grotesque y Figtree con `next/font` (servidas por el propio Worker) y desactivar las animaciones con `prefers-reduced-motion: reduce` (DESIGN §2.4).
   * Archivos: `src/app/globals.css`, `src/app/layout.tsx`, `src/app/fuentes.ts`
   * Depende de: T3.33
   * Refs: RNF-01, RNF-03, DESIGN §2; Q-44, Q-49
   * Aceptación:
      * `npm run build` pasa, y en `npm run preview` las fuentes llegan desde `/_next/static/media/…`, sin solicitudes a dominios de Google (pestaña Red).
      * Con el sistema en tema oscuro, las páginas se ven con los tokens claros. Con `prefers-reduced-motion: reduce` emulado, no hay animaciones de entrada.

* [x] T4.13: Dominio: color de marca y contraste
   * Objetivo: Crear en `dominio/color.ts` la razón de contraste de WCAG 2.1 entre dos colores `#rrggbb` y las decisiones de Q-42: el color del texto sobre el acento (blanco o `tinta`) y si el acento sirve como color de texto sobre `superficie` y `fondo`; si no sirve, el texto usa `tinta` (RNF-03).
   * Archivos: `src/dominio/color.ts`, `tests/unit/dominio/color.test.ts`
   * Depende de: T3.33
   * Refs: RNF-03, PAN-11, DESIGN §2.1; Q-42
   * Aceptación:
      * El contraste entre `#ffffff` y `#000000` es 21, y el de un color consigo mismo es 1.
      * Con el acento `#2b3fd6`, el texto sobre el acento es blanco y el acento sirve como texto. Con `#f5d90a`, el texto sobre el acento es `tinta` y el acento no sirve como texto. Cada resultado cumple al menos 4.5:1.

* [x] T4.14: Componentes compartidos con los tokens
   * Objetivo: Llevar los componentes de T2.04 (campo, botón, aviso y sección) a los tokens, radios y alturas de DESIGN §2.3 y §3: botón primario, secundario y destructivo con "Procesando…"; campo de 48 px con su error; aviso informativo, de advertencia, de error y de éxito; y el anillo de foco `foco`. Se quitan sus variantes `dark:` (Q-44).
   * Archivos: `src/componentes/formulario.tsx`, `src/componentes/aviso.tsx`
   * Depende de: T4.12
   * Refs: RNF-03, DESIGN §2.3, §3, §6; Q-26 (TASKS-02), Q-44
   * Aceptación (manual, en local):
      * El alta de `/admin` y las páginas de configuración del panel funcionan igual con el estilo nuevo. El slug `admin` sigue mostrando "slug no disponible".
      * Con el teclado, cada control muestra el anillo de foco de DESIGN §2.1, y los botones miden al menos 48 px de alto.

* [x] T4.15: Componentes de la página pública
   * Objetivo: Crear los componentes de DESIGN §3 que usa la página pública: chip de selección (`aria-pressed`), badge de estado, tarjeta, mosaico de logo (logo o inicial, en 42, 48, 72 y 116 px), barra de pasos (`nav` con `aria-label` y el paso actual con `aria-current`) y tarjeta de contacto (con los enlaces de T4.06).
   * Archivos: `src/componentes/chip.tsx`, `src/componentes/badge.tsx`, `src/componentes/tarjeta.tsx`, `src/componentes/mosaico-logo.tsx`, `src/componentes/publico/barra-pasos.tsx`, `src/componentes/publico/tarjeta-contacto.tsx`
   * Depende de: T4.06, T4.14
   * Refs: RNF-03, DESIGN §3, §6, §8; Q-49
   * Aceptación (manual, con una página temporal de muestra en local que se borra después):
      * Cada componente se ve en sus estados de DESIGN §3, y ningún estado depende solo del color (DESIGN §2.1).
      * El mosaico sin logo muestra la inicial del nombre. Los iconos decorativos llevan `aria-hidden="true"` (DESIGN §8).

### 4.D Página pública: datos y estructura

* [x] T4.16: Caso de uso `leerPaginaPublica`
   * Objetivo: Implementar `leerPaginaPublica(slug, ahora)`, que arma en una lectura lo que la página necesita:
      * la marca del negocio y su zona horaria;
      * la sede principal, con su dirección, sus contactos y sus franjas;
      * los servicios activos que ofrece, con su categoría y su duración (la de `servicio_sede` si la sobrescribe);
      * la política vigente (id y versión);
      * hoy y el último día reservable en fecha local (`ahora` más la anticipación máxima);
      * el estado: `abierta`, `suspendida` según `estadoEfectivo` (ARCH §7.6), o `sin_horarios` si no hay un servicio activo o una franja (F-05, paso 4).

      Con el negocio suspendido, solo devuelve la marca y la sede. Nunca incluye datos del dueño.
   * Archivos: `src/servidor/casos-uso/pagina-publica.ts`, `src/servidor/db/repositorios/negocios.ts`, `src/servidor/db/repositorios/servicios.ts`, `tests/integracion/casos-uso/pagina-publica.test.ts`
   * Depende de: T4.07, T4.08, T4.09
   * Refs: PUB-01, PUB-02, PUB-07, F-05, RN-04, RN-05, RN-31, RN-32, ARCH §6, §7.6; Q-49
   * Aceptación:
      * Con el negocio de prueba, devuelve la marca, los contactos en orden, las franjas, los servicios activos con la duración de la sede y la política vigente. Un slug inexistente devuelve `NO_ENCONTRADO`.
      * Suspendido, el estado es `suspendida`, con la marca y los contactos y sin servicios. Sin servicios activos o sin franjas, el estado es `sin_horarios`.

* [x] T4.17: Ruta `/{slug}` y sus estados
   * Objetivo: Crear el grupo `(publico)` y la página `/{slug}`, que llama a `leerPaginaPublica` con `ahora` y responde 404 si el slug no existe. Fija las variables CSS de la marca con T4.13, pone el nombre del negocio en el título y muestra los estados: "Reservas no disponibles" con los contactos (PUB-07) y "Aún no hay horarios disponibles" con los contactos (F-05). Con el estado `abierta`, deja el lugar del flujo de reserva (módulo 4.E).
   * Archivos: `src/app/(publico)/layout.tsx`, `src/app/(publico)/[slug]/page.tsx`, `src/app/(publico)/[slug]/not-found.tsx`, `src/componentes/publico/estado-pagina.tsx`
   * Depende de: T4.13, T4.15, T4.16
   * Refs: PUB-07, F-05, RN-04, RN-31, RNF-01, RNF-03, ARCH §4, §5, §7.2; Q-42, Q-49
   * Aceptación (manual, con `npm run preview`):
      * Un slug inexistente responde 404. `/panel`, `/admin` y `/login` siguen llevando a sus páginas.
      * La página no carga scripts de Clerk (pestaña Red; ARCH §7.2).
      * Con el negocio suspendido en `development`, se ve "Reservas no disponibles" con sus contactos. En gracia, la página funciona normal (RN-31).

* [x] T4.18: Encabezado del negocio
   * Objetivo: Construir el encabezado de PUB-01 según DESIGN §4.1: mosaico de logo, nombre, rubro, frase del banner, eslogan y descripción (Q-38); dirección con el enlace "Cómo llegar" a Google Maps en una pestaña nueva (D-30); el horario de la semana, resumido por días con las mismas franjas; y la tarjeta de contactos. Agrega a `dominio/horario.ts` el resumen del horario (por ejemplo, "Lunes a viernes").
   * Archivos: `src/componentes/publico/encabezado.tsx`, `src/dominio/horario.ts`, `tests/unit/dominio/horario.test.ts`, `src/app/(publico)/[slug]/page.tsx`
   * Depende de: T4.17
   * Refs: PUB-01, D-27, D-29, D-30, RN-32, RNF-02, DESIGN §4.1; Q-38, Q-43
   * Aceptación:
      * Prueba unitaria: lunes a viernes de 8:00 a 12:00 y de 14:00 a 18:00, más el sábado de 8:00 a 12:00, se resumen en dos líneas, con las horas en formato de 12 horas (RNF-02). Un día sin franjas aparece como cerrado.
      * Manual: a 360 px, el encabezado se ve sin desplazamiento horizontal; sin logo, aparece la inicial. Los campos de marca vacíos no dejan huecos, y la página no muestra la palabra "sede" (RN-32).

* [x] T4.19: Página de la política de datos
   * Objetivo: Crear `/{slug}/politica/{version}`, que muestra esa versión de la política del negocio con un renderizador de Markdown sin HTML crudo (ARCH §19.2), con su número de versión y su fecha. La casilla de PUB-05 enlaza a la versión que el cliente vio (F-01; Q-45).
   * Archivos: `src/app/(publico)/[slug]/politica/[version]/page.tsx`, `src/componentes/markdown.tsx`, `src/servidor/casos-uso/pagina-publica.ts`, `src/servidor/db/repositorios/politicas.ts`, `tests/integracion/casos-uso/pagina-publica.test.ts`, `package.json`
   * Depende de: T4.17
   * Refs: PUB-05, RN-17, D-05, F-01, ARCH §19.2; Q-45
   * Aceptación:
      * Prueba de integración: una versión anterior sigue disponible después de publicar otra, y una versión inexistente o de otro negocio devuelve `NO_ENCONTRADO` (RN-01).
      * Manual: los títulos y las listas de la plantilla se ven con formato, y un `<script>` en el texto de la política aparece como texto (ARCH §19.2).
      * El tamaño del Worker con el renderizador queda anotado en el commit.

* [x] T4.20: Encabezados de seguridad
   * Objetivo: Agregar los encabezados de ARCH §19.2 según Q-47: HSTS, `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin` en todas las respuestas, y la CSP básica en las páginas públicas.
   * Archivos: `next.config.ts` (o `src/proxy.ts`, si `headers()` no puede excluir el panel; Q-47)
   * Depende de: T4.17
   * Refs: RNF-04, ARCH §19.2; Q-47
   * Aceptación (con `npm run preview` y `curl -I`):
      * `/{slug}` y `/{slug}/politica/1` traen los cuatro encabezados. `/panel` y `/admin` traen los tres primeros, sin CSP.
      * Con la CSP activa, la página pública no registra violaciones en la consola, y el ingreso con Clerk en `/login` sigue funcionando.

### 4.E Flujo de reserva (F-01)

El flujo vive en un solo componente de cliente con cuatro pasos: servicio, día y hora, datos y confirmación (DESIGN §3, barra de pasos). Sin el paso "Profesional" (D-24).

* [x] T4.21: Dominio: calendario del mes
   * Objetivo: Crear en `dominio/calendario.ts` lo que necesita el calendario de PUB-03: las semanas de un mes local, con lunes primero; los meses a los que se puede ir entre hoy y el último día reservable; el rango que se consulta para un mes, recortado a esos días (Q-48); y el siguiente día con cupo a partir de una fecha (F-01).
   * Archivos: `src/dominio/calendario.ts`, `tests/unit/dominio/calendario.test.ts`
   * Depende de: T3.01
   * Refs: PUB-03, F-01, RN-09, ARCH §9, §18.5; Q-48
   * Aceptación:
      * Octubre de 2026 empieza en jueves: su primera semana tiene tres días vacíos. Febrero de 2027 tiene 28 días en cuatro semanas completas: empieza en lunes y termina en domingo.
      * Con hoy el 2026-10-20 y el último día el 2026-12-19, se puede ir de octubre a diciembre; el rango de octubre va del 20 al 31 y el de diciembre, del 1 al 19.
      * El siguiente día con cupo salta los días con `inicios: []` y devuelve `null` si no hay ninguno en lo consultado.

* [x] T4.22: Errores por campo en la API de reservas
   * Objetivo: Hacer que `DATOS_INVALIDOS` de `POST /api/publico/{slug}/reservas` traiga la lista de campos que fallaron (`nombre`, `apellido`, `telefono`, `correo` o `aceptaPolitica`), sin los valores recibidos (Q-46). La trampa `sitioWeb` responde `DATOS_INVALIDOS` sin campos, para no delatarla.
   * Archivos: `src/servidor/casos-uso/reservar-cita.ts`, `src/servidor/http/respuestas.ts`, `tests/integracion/app/api/publico/reservas.test.ts`, `tests/unit/servidor/respuestas.test.ts`
   * Depende de: T4.05
   * Refs: PUB-05, RN-17, ARCH §15, §18.5, §19.2; Q-46
   * Aceptación:
      * Un teléfono que no se puede normalizar responde 422 con `campos: ["telefono"]`, y un cuerpo sin nombre ni correo, con `["nombre", "correo"]`.
      * Con `sitioWeb` lleno, responde 422 sin `campos`. Ninguna respuesta repite lo que llegó en la solicitud (ARCH §19.2).

* [x] T4.23: Cliente de la API pública
   * Objetivo: Crear las funciones del navegador que llaman a la disponibilidad y a la reserva y devuelven un resultado con tipo: los días, la cita creada (`citaId`, `codigo`, `inicio` y `fin`) o el error, con su código y sus campos. Una falla de red o una respuesta que no es JSON se convierten en un error de conexión.
   * Archivos: `src/componentes/publico/api.ts`, `tests/unit/componentes/publico/api.test.ts`
   * Depende de: T4.22
   * Refs: PUB-04, PUB-06, PUB-08, F-01, ARCH §18.5; Q-49
   * Aceptación (con `fetch` simulado):
      * Las respuestas 200, 201, 403, 404, 409, 422 (con campos) y 429 dan el resultado correspondiente.
      * Una falla de red y una página de error en HTML dan el error de conexión, sin lanzar excepciones.

* [x] T4.24: Paso "Servicio"
   * Objetivo: Crear el componente del flujo con su barra de pasos y su resumen (vacío: "Elige día y hora"), y el primer paso (PUB-02): chips de categoría con "Todos" (Q-39) y tarjetas con categoría, nombre, descripción y duración, sin precio (D-25). Elegir una tarjeta lleva al paso siguiente.
   * Archivos: `src/componentes/publico/reserva.tsx`, `src/componentes/publico/paso-servicio.tsx`, `src/componentes/publico/resumen.tsx`, `src/app/(publico)/[slug]/page.tsx`
   * Depende de: T4.15, T4.17
   * Refs: PUB-02, D-24, D-25, D-26, RN-05, RNF-03, DESIGN §3, §4.1; Q-39
   * Aceptación (manual, en local, a 360 px):
      * Con servicios de dos categorías, cada chip filtra la lista y "Todos" la restablece. Sin categorías, no aparecen chips.
      * Un servicio desactivado en el panel desaparece de la lista al recargar (RN-05). Todo el paso se usa con el teclado.

* [x] T4.25: Paso "Día y hora"
   * Objetivo: Construir PUB-03 y PUB-04: el calendario del mes con T4.21, que consulta la disponibilidad del mes visible en una sola solicitud y deshabilita los días sin inicios ("Sin cupos"); y las horas libres del día elegido, en la zona del negocio. Si el día elegido queda sin horas, muestra "No quedan horas libres este día." y ofrece el siguiente día con cupo (F-01).
   * Archivos: `src/componentes/publico/paso-horario.tsx`, `src/componentes/publico/calendario.tsx`, `src/componentes/publico/horas-libres.tsx`
   * Depende de: T4.21, T4.23, T4.24
   * Refs: PUB-03, PUB-04, F-01, RN-03, RN-09, DESIGN §3, §4.1, §9; Q-43, Q-48
   * Aceptación (manual, en local):
      * Los días antes de hoy, después del último día reservable o sin cupo aparecen deshabilitados; el calendario no avanza más allá del último mes reservable. Cada mes hace una sola solicitud (pestaña Red).
      * Con el dispositivo en otra zona horaria (sensor de ubicación de las DevTools), las horas se ven en hora de Colombia (RN-03).
      * Con un bloqueo de día completo en `development`, ese día aparece sin cupo.

* [x] T4.26: Paso "Tus datos"
   * Objetivo: Construir PUB-05: nombre, apellido, celular con `+57` por defecto, correo y la casilla obligatoria con la versión de la política y su enlace (T4.19), sin el campo de notas (Q-43). Lleva el campo oculto `sitioWeb` fuera del orden de tabulación y oculto para los lectores de pantalla (ARCH §15). Los errores de T4.22 se muestran junto a cada campo. "Atrás" vuelve a las horas sin perder lo escrito.
   * Archivos: `src/componentes/publico/paso-datos.tsx`
   * Depende de: T4.19, T4.22, T4.25
   * Refs: PUB-05, RN-17, RNF-03, ARCH §15, DESIGN §3, §6; Q-43, Q-45, Q-46
   * Aceptación (manual, en local):
      * El formulario no se envía sin los cuatro datos y sin la casilla (RN-17). Un celular no válido muestra el error junto al campo, con `aria-invalid` y `aria-describedby`.
      * El enlace de la casilla abre, en una pestaña nueva, la versión de la política que se cargó con la página.
      * Con el teclado no se llega al campo `sitioWeb`.

* [x] T4.27: Confirmación y errores de la reserva
   * Objetivo: Enviar la reserva y resolver cada respuesta:
      * 201: la pantalla de PUB-06 con el código de reserva, el servicio, la fecha y la hora locales, la dirección, el correo al que llega la confirmación (con el link de gestión y la invitación de calendario; Q-43) y "Reservar otra cita".
      * 409: vuelve a las horas con el aviso "Esa hora se acaba de ocupar. Elige otra; tus datos se conservan.", con la disponibilidad recargada (F-01, G1).
      * 403 `NEGOCIO_SUSPENDIDO`: el estado de PUB-07.
      * 429: "Hiciste muchas solicitudes seguidas. Intenta en un minuto." (PUB-08; Q-43).
      * Error de conexión: un aviso para reintentar, sin perder los datos.

      El botón muestra "Procesando…" y no admite un segundo envío. Cada cambio de paso o aviso mueve el foco a su título o al aviso.
   * Archivos: `src/componentes/publico/reserva.tsx`, `src/componentes/publico/confirmacion.tsx`
   * Depende de: T4.26
   * Refs: PUB-06, PUB-07, PUB-08, F-01, RN-04, RN-11, D-28, RNF-03, DESIGN §4.1, §5; Q-41, Q-43
   * Aceptación (manual, en local):
      * Una reserva muestra su código, igual al de la cita en `development`, y su hora deja de ofrecerse.
      * Con dos pestañas en la misma hora, la segunda en confirmar ve el aviso de hora ocupada y conserva sus datos (F-01; RN-11).
      * Con el negocio suspendido después de cargar la página, confirmar muestra "Reservas no disponibles" con los contactos (RN-04).

### 4.F Pruebas y cierre

Pruebas de integración contra la rama efímera de Neon, con los criterios de aceptación de las RN que esta fase hace posibles. Cada caso cita su origen.

* [x] T4.28: Pruebas de la página pública
   * Objetivo: Probar con `leerPaginaPublica` los criterios de las RN que tocan la página pública.
   * Archivos: `tests/integracion/casos-uso/pagina-publica-reglas.test.ts`
   * Depende de: T4.16, T4.19
   * Refs: RN-01, RN-04, RN-05, RN-31, RN-32, F-05
   * Aceptación (una prueba por caso; todas pasan):
      * Con el negocio suspendido, la página queda en "Reservas no disponibles" (RN-04), y en gracia funciona igual que al día (RN-31).
      * Un servicio inactivo no aparece en la página pública (RN-05).
      * Sin un servicio activo o sin horario, la página queda en "Aún no hay horarios disponibles" (F-05, paso 4).
      * Con una segunda sede activa creada por SQL, la página sigue mostrando solo la sede principal y sus datos (RN-32: "con una sola sede activa…", D-16).
      * Con el slug de A, pedir la política de B por su versión devuelve `NO_ENCONTRADO`, y la página de A no trae datos de B (RN-01).

* [x] T4.29: Pruebas del código de reserva y de los contactos
   * Objetivo: Probar las reglas de D-28 y D-29, y la solo lectura de la Server Action nueva.
   * Archivos: `tests/integracion/casos-uso/codigo-reserva.test.ts`, `tests/integracion/casos-uso/contactos-reglas.test.ts`, `tests/integracion/app/panel/solo-lectura.test.ts`, `tests/integracion/app/panel/multi-negocio.test.ts`
   * Depende de: T4.05, T4.10
   * Refs: D-14, D-28, D-29, RN-01, RN-04, ARCH §20 (Suscripción, Multi-negocio); Q-40, Q-41
   * Aceptación (una prueba por caso; todas pasan):
      * 30 reservas del mismo negocio quedan con 30 códigos distintos con el formato de Q-41, y el código de una cita no cambia si el negocio cambia de nombre (D-28).
      * Con el negocio suspendido, `guardarContactos` y la Server Action de la marca ampliada devuelven `NEGOCIO_SUSPENDIDO` y no cambian nada (RN-04, D-14).
      * Desde la sesión de A, guardar contactos no cambia los contactos de B (RN-01).

* [x] T4.30: Revisión de accesibilidad y móvil
   * Objetivo: Recorrer la página pública completa en móvil y con el teclado, y corregir lo que falle. Los arreglos van en el commit de esta tarea.
   * Archivos: los que haya que corregir en `src/componentes/publico/` y `src/app/(publico)/`
   * Depende de: T4.27
   * Refs: RNF-01, RNF-02, RNF-03, RN-03, DESIGN §6, §7
   * Aceptación (manual, con `npm run preview`):
      * A 360 px no hay desplazamiento horizontal en ningún paso ni estado, y las áreas táctiles miden al menos 44 px (RNF-01; DESIGN §6).
      * Una reserva completa se hace solo con el teclado, con el foco visible en cada control. El panel de accesibilidad de Lighthouse no informa errores de etiquetas, contraste ni nombres de botones (RNF-03).
      * Con un color de marca claro (`#f5d90a`), los textos y botones de marca cumplen 4.5:1 (RNF-03; Q-42).
      * Pendiente (2026-10-21): el panel de accesibilidad de Lighthouse, que no estaba instalado. En su lugar se corrió en la página una auditoría propia de etiquetas, nombres de controles, contraste (WCAG 2.1), áreas táctiles y desborde, en cada paso y estado; ver el commit de T4.30.

* [ ] T4.31: Despliegue y verificación de la fase
   * Objetivo: Desplegar la fase en el plan gratuito de Workers (Q-36, TASKS-03) y recorrer la página pública en `*.workers.dev` con el negocio de prueba.
   * Archivos: — (el commit anota el tamaño del Worker, el CPU y el LCP medidos)
   * Depende de: T4.11, T4.20, T4.28–T4.30
   * Refs: RNF-01, RNF-04, RNF-07, RNF-09, ARCH §21.4, §23; Q-36 (TASKS-03)
   * Aceptación:
      * `npm run deploy` aplica las migraciones de T4.01 a T4.03 en `production` y termina sin errores. El tamaño del Worker queda anotado en el commit.
      * En el Worker, con un celular o el viewport de 360 px, una reserva completa termina en la confirmación con su código, y la cita aparece en `production`. El admin suspende el negocio, la página muestra "Reservas no disponibles", y después registra el pago.
      * El LCP de `/{slug}` en Lighthouse móvil (4G simulado) queda anotado frente a los 2,5 s de RNF-01, y el CPU de su render con `wrangler tail`, frente a los 10 ms del plan gratuito (Q-36).
      * `curl -I` muestra los encabezados de T4.20 en el Worker.
   * Avance (2026-10-21): desplegado (versión `c56714f9`, Total Upload 16471.82 KiB / gzip 3612.22 KiB); migraciones de T4.01 a T4.03 aplicadas en `production`; reserva completa a 360 px con su código (`NO-8969`) y la cita en `production`; encabezados verificados con `curl -I`. CPU medido con `wrangler tail`: de 35 a 875 ms por render de `/{slug}`, muy por encima de los 10 ms del plan gratuito, aunque todas las solicitudes respondieron (Q-36). Desde `/admin`, suspender `testing2` dejó la página en "Reservas no disponibles", y registrar el pago (hasta el 31 de diciembre de 2026: la fecha debe ser posterior a la anterior) la volvió a abrir; los dos cambios quedaron en `auditoria_admin` con el usuario de Clerk. Falta: el LCP con Lighthouse.

---

## Preguntas

Puntos que el PRD, ARCHITECTURE y DESIGN no definían. Todas quedaron resueltas el 2026-10-20. El modelo y los contratos nuevos (Q-38 a Q-41 y Q-46) quedaron en ARCH §11.4, §17, §18 y §19.1 (v0.12). Siguen vigentes, y aplican a esta fase, Q-20 y Q-24 de [TASKS-02](TASKS-02.md#preguntas), y Q-35 y Q-36 de [TASKS-03](TASKS-03.md#preguntas).

| ID | Pregunta | Decisión | Afecta a |
|---|---|---|---|
| Q-37 | El PRD v0.9 sumó D-26 a D-29 al MVP sin asignarles fase, y ARCH v0.11 no tiene su modelo. ¿Dónde entran? | **Resuelta (2026-10-20):** En la Fase 4, completas: modelo, casos de uso, campos del panel (PAN-11 y PAN-12) y su lugar en la página pública, porque la página los muestra. El código en C-01 va con los correos (Fase 6), y en el panel, con la agenda (Fase 5). La fase crece de 2 días a unos 3. Como el colchón ya está consumido (PRD §12), si el plazo aprieta se aplica el recorte de PRD §4.3. | Alcance, módulos 4.A y 4.B |
| Q-38 | ¿Cómo se guarda la marca ampliada (D-27) y dónde se muestra cada texto? | **Resuelta (2026-10-20):** Cuatro columnas de texto plano en `negocio`, que admiten `NULL`: `rubro` (hasta 60 caracteres), `eslogan` (hasta 120), `frase_banner` (hasta 120) y `descripcion` (hasta 600), con `CHECK` de longitud. El rubro va junto al nombre; la frase del banner es el título del banner (si falta, el nombre); el eslogan va debajo; y la descripción, en el encabezado. Son del negocio, no de la sede. | T4.01, T4.08, T4.10, T4.18 |
| Q-39 | ¿Cómo se modelan las categorías de servicio (D-26) y cómo filtra el cliente? | **Resuelta (2026-10-20):** Una columna `servicio.categoria` (texto de 1 a 40 caracteres, `NULL` = sin categoría), sin tabla aparte: con unos 8 servicios basta. El panel sugiere las categorías existentes para evitar variantes. En la página, "Todos" va primero y después cada categoría de los servicios ofrecidos, en el orden en que aparece su primer servicio (`servicio.orden`). Los servicios sin categoría solo aparecen en "Todos". Sin ninguna categoría, no hay chips. | T4.01, T4.09, T4.11, T4.24 |
| Q-40 | ¿Cómo se modela la lista de contactos (D-29), qué pasa con `sede.telefono` y cuántos contactos se admiten? | **Resuelta (2026-10-20):** Tabla `contacto_sede` (`id`, `negocio_id`, `sede_id`, `tipo` del enum `tipo_contacto` con `whatsapp`, `telefono` y `correo`, `valor`, `etiqueta` opcional de hasta 40 caracteres y `orden`), con FK compuesta a la sede y `ON DELETE CASCADE`. El valor se guarda normalizado (E.164 o correo en minúsculas), y se admiten hasta 6 contactos por sede, validados en código. La migración copia `sede.telefono` como contacto `telefono`; la columna deja de leerse y escribirse, pero no se borra en esta fase (ARCH §8: migraciones compatibles hacia atrás). El `reply_to` de los correos (Q-11, TASKS-01) se revisa en la Fase 6 con esta lista. | T4.02, T4.06, T4.07, T4.10, T4.18 |
| Q-41 | ¿Qué formato tiene el código de reserva (D-28), cómo se evita que se repita y qué permite hacer? | **Resuelta (2026-10-20):** Formato `AA-0000`: dos letras sacadas del nombre del negocio al reservar (las iniciales de las dos primeras palabras, o las dos primeras letras si hay una sola; sin tildes; `XX` si no hay letras) y 4 dígitos al azar. `CHECK (codigo ~ '^[A-Z]{2}-[0-9]{4,6}$')` y `UNIQUE (negocio_id, codigo)`. La reserva comprueba que el código esté libre antes del `INSERT`. Si aun así choca (con otra reserva de otro recurso), reintenta la transacción, como con el correo (ARCH §12). Tras 5 choques usa 6 dígitos. Las citas existentes se rellenan con el prefijo de su negocio y un número correlativo. El código solo identifica la cita al hablar con el negocio: no da acceso a nada, y la gestión sigue necesitando el link firmado (ARCH §13). El ejemplo `EB-4821` de D-28 es ilustrativo. | T4.03–T4.05, T4.27, T4.29 |
| Q-42 | DESIGN §9: ¿el negocio elige su color, o es fijo? ¿Qué pasa si el color elegido no da contraste? | **Resuelta (2026-10-20):** Lo elige el negocio, como piden PUB-01 y PAN-11: `color_primario` es el token `acento`. El valor por defecto pasa de `#0f766e` a `#2b3fd6`, el del diseño, solo para los negocios nuevos. Por RNF-03, el texto sobre el acento es blanco o `tinta`, según cuál cumpla 4.5:1, y si el acento no cumple 4.5:1 como texto sobre `superficie` o `fondo`, esos textos usan `tinta`. `color_secundario`, si existe y contrasta con `tinta`, reemplaza a `lima` en los destaques sobre fondo oscuro. | T4.01, T4.13, T4.17, T4.30 |
| Q-43 | DESIGN §4.1 y §9 tienen elementos que el PRD o ARCH no piden o contradicen. ¿Cuáles se construyen? | **Resuelta (2026-10-20):** Prevalecen el PRD y ARCH: <br>• **Notas para el negocio:** no, porque PUB-05 no las pide y RN-24 exige datos mínimos.<br>• **"Agregar a mi calendario" en la confirmación:** no, porque ARCH §14.6 descarta los enlaces que crean eventos que no se actualizan. La confirmación dice que la invitación llega en el correo (C-01, Fase 6).<br>• **"Gestionar mi cita" en la confirmación:** no, porque el link llega por correo (ARCH §18.5).<br>• **"Pocos cupos":** no; solo "Sin cupos" (DESIGN §9).<br>• **Paso "Profesional":** oculto (D-24).<br>• **Logo de hasta 1 MB y SVG** (DESIGN §8): no; sigue ARCH §19.2, con hasta 512 KB y sin SVG.<br>• **Horario de la semana en el encabezado:** sí, con los datos que ya existen.<br>• **Demasiadas solicitudes:** "Hiciste muchas solicitudes seguidas. Intenta en un minuto.", que une el texto de DESIGN §5 y el de F-01. | T4.18, T4.25–T4.27 |
| Q-44 | DESIGN §1 reemplaza el estilo de la Fase 1 "en las pantallas nuevas y en el panel", y Q-26 (TASKS-02) pide revisar cada pantalla del panel por su ID. DESIGN no tiene tema oscuro. ¿Qué parte entra aquí? | **Resuelta (2026-10-20):** En esta fase: los tokens, las fuentes y los componentes compartidos (T4.12 a T4.15), con lo que el panel y el admin cambian de aspecto sin tocar sus páginas, y solo el tema claro: se quitan las variantes `dark:`. La revisión de cada pantalla del panel por su PAN-xx, y la navegación de DESIGN §4.3, van en la Fase 5, que construye la agenda. | T4.12, T4.14, Fase 5 |
| Q-45 | PUB-05 pide un "enlace a la versión vigente" de la política, pero ARCH no define la ruta ni cómo se muestra el Markdown. | **Resuelta (2026-10-20):** `/{slug}/politica/{version}`, con la versión que se cargó con la página, para que el cliente lea exactamente la que acepta aunque el dueño publique otra mientras llena el formulario (F-01). Se muestra con `react-markdown` (versión exacta), que por defecto no interpreta HTML (ARCH §19.2). Si el tamaño del Worker crece demasiado, se cambia por un renderizador propio de títulos, párrafos, listas y negritas. | T4.19, T4.26 |
| Q-46 | La API responde `DATOS_INVALIDOS` sin decir qué campo falló, y validar el teléfono en el navegador exigiría cargar `libphonenumber-js` en la página (RNF-01). | **Resuelta (2026-10-20):** `DATOS_INVALIDOS` de la reserva lleva un `campos` opcional con los nombres de los campos que fallaron, nunca sus valores. Es un cambio aditivo del formato de ARCH §18.5. La trampa para bots no aparece en `campos`. | T4.22, T4.23, T4.26 |
| Q-47 | ARCH §19.2 pide HSTS, `nosniff`, `Referrer-Policy` y "una CSP básica", sin decir dónde. Clerk carga scripts de su propio dominio en el panel. | **Resuelta (2026-10-20):** Los tres primeros, en todas las respuestas. La CSP, solo en las páginas públicas: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. La CSP del panel y del admin, con los dominios de Clerk, va en la Fase 8. El `no-referrer` de la gestión llega en la Fase 6 (ARCH §13). | T4.20 |
| Q-48 | ¿Qué rango de disponibilidad consulta el calendario, y cómo se ofrece "el siguiente día con cupo" (F-01) si cae en otro mes? | **Resuelta (2026-10-20):** Una consulta por mes visible, del primer día del mes (o hoy) al último (o el último día reservable), que no pasa de los 31 días de ARCH §18.5. Al entrar, se elige el primer día con cupo. Si el siguiente día con cupo no está en el mes cargado, se consulta el mes siguiente, hasta el último día reservable. | T4.21, T4.25 |
| Q-49 | ARCH §4 solo ubica `/{slug}` y `/{slug}/cita/…`. ¿Dónde van las rutas y los archivos nuevos? | **Resuelta (2026-10-20):** Rutas: `/{slug}` y `/{slug}/politica/{version}` en el grupo `(publico)`. Archivos: `src/dominio/{codigo-reserva, contactos, color, calendario}.ts`; `src/servidor/casos-uso/{contactos, pagina-publica}.ts`; `src/servidor/db/repositorios/contactos.ts`; `src/app/fuentes.ts`; los componentes compartidos en `src/componentes/` y los de la página en `src/componentes/publico/`. | Casi todas las tareas |
| Q-50 | T4.03 hace obligatorio `cita.codigo` sin valor por defecto, pero la reserva no lo genera hasta T4.05: después de T4.03 no compilarían `crearPublica` ni las pruebas que insertan citas, y E2 no pasaría. | **Resuelta (2026-10-20):** T4.04 (dominio, sin dependencias del esquema) va antes de T4.03. T4.03 agrega la generación mínima: `reservarCita` arma el código con T4.04 y `crearPublica` lo recibe, y las pruebas que insertan citas le ponen uno. T4.05 se queda con la comprobación de código libre, los reintentos de Q-41 y el cambio del contrato HTTP. | T4.03–T4.05 |
| Q-51 | En la verificación de T4.31, el LCP de `/{slug}` fue de 5,0 s: el 59% era la redirección de *handshake* de Clerk, porque el `matcher` de ARCH §7.3 hacía pasar por el middleware también la página pública, en contra de §7.2 y RNF-01. | **Resuelta (2026-10-22):** el `matcher` cubre solo las rutas que usan Clerk (`/panel`, `/admin`, `/login`, `/registro` y `/sin-acceso`, con sus Server Actions). La página pública, su política y la API no pasan por Clerk. ARCH §7.3 se actualizó. Además, el primer paso del flujo ya no tiene animación de entrada, que retrasaba el LCP. | T4.31, ARCH §7.3 |
