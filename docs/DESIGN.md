# Agenda de citas — Sistema de diseño

| | |
|---|---|
| **Versión** | 1.0 (borrador) |
| **Fecha** | 2026-10-20 |
| **Fuente visual** | [Demo de reservas — Estudio Ébano](https://claude.ai/artifact/KhwQjUsva4C89DVUCuVgWg) (versión 12) |
| **Fuente funcional** | [PRD.md](PRD.md) v0.9 (IDs PUB, GES, PAN, F-xx y D-xx) |
| **Cierra** | Q-26 de [TASKS-02.md](TASKS-02.md) |

> Este documento describe **cómo se ve y se comporta** la interfaz. Lo que se construye y las reglas están en el PRD. Donde el diseño y el PRD difieren, prevalece el PRD.
> Este documento no cubre el panel de administración del SaaS (`/admin`), que es interno y no tiene diseño.

---

## 1. Qué se toma del diseño y qué no

| Tema | Decisión |
|---|---|
| Colores, tipografía, radios, espaciado y componentes | Se toman del diseño (secciones 2 a 4). |
| Estilo de la Fase 1 (Tailwind con `teal` y `zinc`) | Se reemplaza por los tokens de este documento, en las pantallas nuevas y en el panel. |
| Color de marca del negocio | Ver sección 9 (decisión abierta). |
| Controles "Solo demo" (suscripción, simular hora ocupada, simular límite) | No se construyen (D-31). |
| Pago en línea, precio por servicio | No se construyen en el MVP (D-25). |
| Sección de profesionales y elección de profesional en la reserva | No se construye en el MVP (D-24). Ver sección 9. |

---

## 2. Tokens

### 2.1 Colores

| Token | Valor | Uso |
|---|---|---|
| `fondo` | `#F5F6F2` | Fondo de página. |
| `superficie` | `#FFFFFF` | Tarjetas, campos y botones secundarios. |
| `tinta` | `#15171A` | Texto principal, botón primario, chip seleccionado. |
| `tinta-suave` | `#3A3F45` | Texto secundario y datos en tablas. |
| `texto-muted` | `#5B6068` | Etiquetas, ayudas y textos de apoyo. |
| `borde` | `#E3E5E0` | Bordes de tarjetas y separadores. |
| `borde-control` | `#CFD2CB` | Bordes de campos y botones secundarios. |
| `fondo-suave` | `#F0F1EC` | Filas resaltadas, avisos neutros. |
| `acento` | `#2B3FD6` (por defecto) | Color de marca del negocio. Ver sección 9. |
| `lima` | `#D9F36B` | Destaques sobre fondo oscuro (logo por defecto, precio y títulos de tarjetas oscuras). |
| `exito-fondo` / `exito-texto` | `#E2F4DF` / `#1F5F1B` | Estado "Al día", "Asistió", "Listo". |
| `aviso-fondo` / `aviso-texto` | `#FFF4E0` / `#6B3600` | Aviso de gracia, "Falta", avisos de plazo. |
| `error-fondo` / `error-texto` | `#FDECEA` / `#8E1F14` | Errores de formulario, "Cancelada", suspensión. |
| `error-acción` | `#B42318` | Texto de acciones destructivas ("Cancelar cita", "Eliminar"). |
| `foco` | `#8C9BFF`, 3 px, desfase 2 px | Anillo de foco visible en todos los controles. |

Los colores de texto cumplen 4.5:1 sobre su fondo. No se usa solo el color para distinguir estados: cada estado lleva texto.

### 2.2 Tipografía

| Rol | Familia | Peso | Tamaño |
|---|---|---|---|
| Títulos y cifras | `Bricolage Grotesque`, luego `Figtree`, luego `sans-serif` | 700 | 24 px (`h2` de tarjeta); el título de la portada es fluido |
| Cuerpo | `Figtree`, luego `system-ui` | 400 y 600 | 15 px (texto), 14 px (ayudas), 13 px (etiquetas pequeñas) |
| Etiquetas en mayúsculas | `Figtree` | 700, con espaciado de 0.08 em | 12 px |
| Código de reserva y datos técnicos | `ui-monospace`, `Menlo`, `monospace` | 400 | 14 px |

### 2.3 Forma y espaciado

| Elemento | Radio |
|---|---|
| Tarjeta | 24 px (borde de 1 px `borde`, padding 24 px, 18 px en móvil) |
| Campo de texto | 12 px, alto 48 px |
| Botón | 14 px, alto mínimo 48 px |
| Chip, píldora, badge | 999 px, alto mínimo 40–44 px |
| Aviso | 12–14 px |
| Logo y mosaicos de marca | 13 a 32 px según tamaño |

- Separación entre elementos de una tarjeta: 16 px. Entre tarjetas: 20 a 24 px.
- Grillas de dos columnas con `auto-fit` y mínimo de 220 px. En móvil colapsan a una columna.
- Ancho de página: fluido. El diseño de referencia se trazó a 1440 px de ancho.
- Margen lateral en móvil: 16 px.

### 2.4 Movimiento

- Animación de entrada corta (`translateY` de 8 px con fundido, para pasos y avisos).
- Giro continuo para los indicadores de carga.
- El diseño de referencia no contempla `prefers-reduced-motion`. Se agrega al implementar, porque es una buena práctica de accesibilidad.

---

## 3. Componentes

Cada componente tiene nombre, uso y estados. Si no se indica un estado, se usa el normal.

| Componente | Uso | Estados |
|---|---|---|
| **Botón primario** | Acción principal de la pantalla (Confirmar reserva, Guardar, Agregar). Fondo `acento` o `tinta`. | normal, foco, deshabilitado (fondo gris `#E4E6E1`), cargando ("Procesando…"). |
| **Botón secundario** | Acciones de apoyo (Atrás, Cambiar, Eliminar). Fondo blanco y borde `borde-control`. | normal, foco, deshabilitado. |
| **Botón destructivo** | Cancelar cita, suprimir datos. Texto `error-acción`. | normal, confirmación en dos pasos ("¿Cancelar la cita?" con "Sí, cancelar"). |
| **Chip de selección** | Categorías, sede, profesional y horas. `aria-pressed`. | seleccionado (fondo `tinta`, texto blanco), normal, deshabilitado. |
| **Campo de texto** | Datos del cliente y configuración. Etiqueta visible siempre. | normal, foco, error (con texto de ayuda), deshabilitado. |
| **Selector de hora** | Horas libres del día. Cuadrícula de botones de 44 px. | libre, seleccionada, ocupada (no aparece), "Sin cupos" en el día. |
| **Calendario** | Selección de día dentro de la anticipación. | día disponible, día sin cupo (deshabilitado), día de hoy, día seleccionado, mes anterior o siguiente. |
| **Tarjeta de servicio** | Lista de servicios en la reserva. Muestra categoría, nombre, descripción y duración. | normal, seleccionada (borde `acento`), "Se reserva por cupo" cuando no requiere profesional. |
| **Resumen de la reserva** | Panel lateral oscuro con servicio, sede, fecha, hora y cliente. | vacío ("Elige día y hora"), completo. |
| **Barra de pasos** | Indica el paso actual en la reserva. | paso actual, pasos completados (con marca), pasos futuros. |
| **Aviso** | Información, advertencias y errores. | informativo (`eb-note`), advertencia (`aviso`), error (`error`), éxito (`exito`). |
| **Badge de estado** | Estado de la cita, de la suscripción y de un aviso. | Confirmada, Asistió, No asistió, Cancelada, Pagada, Al día, En gracia, Suspendida. |
| **Tarjeta de contacto** | Lista de contactos de la sede: WhatsApp, teléfono y correo. Botones de 48 px. | WhatsApp (verde `#17784A`), teléfono (borde), correo (borde). |
| **Lista de verificación** | Primer ingreso del dueño (F-05). | "Listo" (verde), "Falta" (ámbar), para revisar (sin estado). |
| **Interruptor** | Servicio activo y profesional requerido. | activo, inactivo. |
| **Mosaico de logo** | Logo del negocio en encabezado, portada y panel. Muestra el logo cargado o la inicial del nombre con un punto de color. | con logo, sin logo (inicial), tamaños 42, 48, 72 y 116 px. |

---

## 4. Pantallas por ID del PRD

### 4.1 Página pública (`/{slug}`)

Pantalla de cliente, sin cuenta. Orden de la página: encabezado con banner, sede y contactos, pasos de la reserva y confirmación.

| ID | Pantalla o elemento | Estado en el diseño |
|---|---|---|
| PUB-01 | Encabezado con logo, nombre, rubro, frase del banner y selector de sede. Muestra dirección, horarios de la semana, enlace a Google Maps y contactos de la sede. | Diseñado. Los contactos son una lista editable por sede (D-29). Waze no se usa (D-30). |
| PUB-02 | Servicios activos con categoría (chips), nombre, descripción y duración. | Diseñado. Sin precio (D-25). Categorías definidas por el negocio (D-26). |
| PUB-03 | Calendario. Días sin cupo deshabilitados. Etiquetas "Pocos cupos" y "Sin cupos". | Diseñado. Las etiquetas de cupo no están en el PRD: ver sección 9. |
| PUB-04 | Horas libres del día elegido, en hora de Colombia. | Diseñado. |
| PUB-05 | Formulario: nombre, apellido, celular con `+57`, correo, notas para el negocio y casilla de la política de datos con su versión. | Diseñado. "Notas para el negocio" no tiene campo en `cita` (ver sección 9). |
| PUB-06 | Confirmación con código de reserva (`EB-xxxx`), botón "Agregar a mi calendario" y "Reservar otra cita". | Diseñado. Falta el enlace "Gestionar mi cita" en esta pantalla (GES). |
| PUB-07 | Negocio suspendido: "Reservas no disponibles" con los contactos del negocio. | Diseñado. |
| PUB-08 | Límite de frecuencia: "Hiciste muchas solicitudes seguidas." | Diseñado. |
| F-05 | Sin horarios: "Aún no hay horarios disponibles" con contactos. | Diseñado. |
| F-01 | Hora ocupada al confirmar: aviso "Esa hora se acaba de ocupar. Elige otra; tus datos se conservan." | Diseñado. |
| F-01 | Día sin horas: "No quedan horas libres este día." | Diseñado. Falta ofrecer el siguiente día con cupo. |
| — | Paso "Profesional" (elegir quién atiende) | Diseñado, pero es posterior al MVP (D-24). Ver sección 9. |

### 4.2 Gestión de la cita por link

Pantalla sin login. Se abre desde el enlace del correo.

| ID | Pantalla o elemento | Estado en el diseño |
|---|---|---|
| GES-01 | Detalle de la cita: servicio, fecha, hora, sede, código, estado e historial de cambios. | Diseñado. |
| GES-02 | Cancelar: botón "Cancelar cita", confirmación "Sí, cancelar mi cita" y estado "Esta cita fue cancelada y su cupo quedó libre." | Diseñado. |
| GES-03 | Reprogramar: elegir día y hora del mismo servicio, "Confirmar cambio" y contador "Te quedan X de Y reprogramaciones". | Diseñado. |
| GES-04 | Fuera del plazo: "Ya no puedes cancelar ni reprogramar por aquí." con contactos. Límite alcanzado y cita pasada: "Esta cita ya pasó…". | Diseñado. |
| GES-05 | Negocio suspendido: se muestran la cita y los contactos, sin acciones. | Diseñado en el mismo bloque que GES-04. Revisar el texto. |

### 4.3 Panel del negocio (`/panel`)

Navegación lateral (en móvil, horizontal con desplazamiento). Pestañas: Inicio, Agenda, Bloqueos, Clientes, Servicios, Profesionales, Reglas y horario, Política de datos, Mi calendario y Marca y sedes.

| ID | Pantalla o elemento | Estado en el diseño |
|---|---|---|
| PAN-01 | Ingreso, cierre de sesión y cambio de contraseña. | No diseñado (autenticación con Clerk). |
| PAN-02 | Agenda por día con navegación. | Diseñado en vista de día. Vistas de semana y mes no están en el diseño: ver sección 9. |
| PAN-03 | Detalle de cita: cliente, contacto, servicio, estado e historial. | Diseñado. |
| PAN-04 | Crear cita manual: buscar cliente por teléfono o nombre, o crear uno nuevo; elegir servicio y hora libre. | Diseñado. |
| PAN-05 | Mover cita a otra hora libre del mismo servicio. | Diseñado. |
| PAN-06 | Cancelar cita con confirmación. | Diseñado. |
| PAN-07 | Marcar "Asistió" o "No asistió". | Diseñado. |
| PAN-08 | Bloqueos por hora, por día o por rango, con motivo. Si hay citas en el rango, el panel las lista y no crea el bloqueo. | Diseñado. Revisar el mensaje de bloqueo con citas. |
| PAN-09 | Clientes: lista con búsqueda, contacto, historial, nota interna y supresión de datos. | Diseñado. |
| PAN-11 | Marca del negocio: nombre, rubro, frase del banner, descripción, logo (subida de imagen de hasta 1 MB) y contactos de la sede. | Diseñado. Falta el control de color de marca (ver sección 9). |
| PAN-12 | Servicios: nombre, categoría, duración, descripción, si requiere profesional, activo y eliminar. | Diseñado. Sin precio (D-25). Falta el buffer por servicio (D-02). |
| PAN-13 | Recurso de la sede: nombre y capacidad. | Sin pantalla propia. El diseño muestra solo "Por cupo" en el servicio. |
| PAN-14 | Horario semanal de la sede, con varias franjas por día. | Diseñado en "Reglas y horario". |
| PAN-15 | Reglas de reserva: granularidad, anticipación mínima y máxima, plazo de cancelación, límite de reprogramaciones y asistencia por defecto. | Diseñado. |
| PAN-16 | Recordatorio por correo: momento de envío o ninguno. | Diseñado. |
| PAN-17 | Política de datos: texto, versiones y restaurar plantilla. | Diseñado. |
| PAN-18 | Enlace a la página pública y aviso mientras falte configuración. | Diseñado (enlace y "Ver página"). El aviso de configuración faltante está en Inicio. |
| PAN-19 | Estado de la suscripción: Al día, En gracia y Suspendida, con fecha límite y panel en solo lectura. | Diseñado. Los botones de simulación no se construyen (D-31). |
| PAN-20 | Enlace privado de calendario para Google Calendar y Outlook, con instrucciones y "Regenerar enlace". | Diseñado. |
| F-05 | Inicio: "Prepara tu negocio" con marca, servicios, horario, reglas, recordatorio y política. | Diseñado. |

---

## 5. Estados vacíos y de error

| Caso | Texto de referencia | Fuente |
|---|---|---|
| Sin citas en el día | "No tienes citas hoy." | PAN-02 |
| Sin clientes con la búsqueda | "No encontramos clientes con esa búsqueda." | PAN-09 |
| Sin bloqueos | "No hay bloqueos próximos." | PAN-08 |
| Hora ocupada | "Esa hora se acaba de ocupar. Elige otra; tus datos se conservan." | F-01 |
| Límite de frecuencia | "Hiciste muchas solicitudes seguidas." | PUB-08 |
| Sin horarios | "Aún no hay horarios disponibles" | F-05 |
| Negocio suspendido | "Reservas no disponibles" | PUB-07 |
| Suscripción vencida | "Tu suscripción está suspendida." y "Cómo renovar" | PAN-19 |

Todos los textos de error son visibles y van junto al campo o a la acción que falló. Nunca dependen solo del color.

---

## 6. Accesibilidad

- Los controles son botones, enlaces o campos reales. No se usan `div` con eventos de clic.
- Cada campo tiene su etiqueta visible. Los botones de solo icono tienen `aria-label`.
- Los chips de selección usan `aria-pressed`. Los pasos de la reserva usan `nav` con `aria-label`.
- Áreas táctiles de al menos 44 px.
- Foco visible en todos los controles (sección 2.1).
- Los mapas son ilustrativos y llevan `role="img"` con una etiqueta descriptiva.
- Mensajes de estado y de error con `role="alert"` cuando aparecen.

---

## 7. Responsive

- **Móvil (menos de 700 px):** tarjetas con padding de 18 px, banner de 240 px de alto, navegación del panel horizontal con desplazamiento.
- **Tableta (700 a 860 px):** grillas de dos columnas.
- **Escritorio:** navegación lateral del panel fija, resumen de la reserva a la derecha.
- Tablas anchas (servicios, clientes) se desplazan dentro de su contenedor, sin desplazar la página.

---

## 8. Iconos e imágenes

- Iconos de línea de 2 px de trazo, tamaños 16, 18 y 20 px.
- Iconos decorativos con `aria-hidden="true"`.
- Logo del negocio: archivo PNG, JPG, WebP o SVG de hasta 1 MB. Dónde se guarda (almacenamiento) queda por definir en la arquitectura.
- Formas decorativas del banner: solo CSS y SVG en línea, sin imágenes externas.

---

## 9. Decisiones abiertas

| Tema | Pregunta | Efecto si no se decide |
|---|---|---|
| Color de marca | ¿El negocio elige su color (PAN-11 lo pide) o el color es fijo por el sistema? El diseño usa `#2B3FD6` por defecto y solo lo cambia por un parámetro de demo. La base tiene `#0f766e` como valor por defecto. | Se usa el acento por defecto `#2B3FD6`. |
| Paso "Profesional" | ¿Se oculta en el MVP o se muestra deshabilitado? | Se implementa oculto, como indica D-24. |
| Etiquetas de cupo "Pocos cupos" y "Sin cupos" | No están en el PRD. ¿Se mantienen? | Se implementan solo "Sin cupos". |
| Vistas de semana y mes (PAN-02) | El diseño solo tiene vista de día. | Se implementa solo la vista de día; las vistas de semana y mes son recortables según PAN-02 y §4.3 del PRD. |
| Notas para el negocio | No hay campo en la tabla `cita` (ver PRD, PUB-05). | Se agrega el campo a `cita` o se quita del formulario. |
| Buffer por servicio (D-02) | No aparece en el diseño de servicios. | Se implementa sin campo de buffer, con valor 0. |
| Control de color de marca (PAN-11) | No aparece en Marca del negocio. | Ver la primera decisión de esta sección. |

---

## 10. Referencias

- [PRD.md](PRD.md): §5 (funcionalidades), §6 (flujos), §10 (decisiones D-xx).
- [TASKS-02.md](TASKS-02.md): Q-26 y las tareas de componentes T2.04 y T2.05.
- [TASKS-00.md](TASKS-00.md): tarea 4 (página pública), que depende de este documento.
- Diseño fuente: [Demo de reservas — Estudio Ébano](https://claude.ai/artifact/KhwQjUsva4C89DVUCuVgWg).
