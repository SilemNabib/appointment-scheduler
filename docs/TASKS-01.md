# Agenda de citas (SaaS) — Tareas de la Fase 1

| | |
|---|---|
| **Versión** | 0.1 (borrador) |
| **Fecha** | 2026-10-08 |
| **Fuentes** | [PRD.md](PRD.md) v0.7 · [ARCHITECTURE.md](ARCHITECTURE.md) v0.8 |

> El PRD manda en el **qué** y ARCHITECTURE en el **cómo**. Si una tarea contradice a alguno de los dos, se corrige la tarea. Lo que los documentos no definen está en [Preguntas](#preguntas) y cada tarea afectada lo cita con su ID (`Q-xx`).

## Fase 1: proyecto, esquema, Clerk, estructura multi-negocio y despliegue base

### Alcance

**Entra:**

- El proyecto Next.js desplegado en Cloudflare Workers con OpenNext, más las herramientas de calidad y de pruebas.
- El esquema completo de ARCH §18.2 con sus migraciones. Las sedes (D-16) y los empleados (D-17) entran **solo como modelo de datos**, sin interfaz.
- Las funciones de dominio que usa esta fase: resultado, tiempo, suscripción y slug.
- Los planes: catálogo, semilla `ilimitado`, función de acceso y auditoría (RN-25 a RN-27 y RN-30; Q-04).
- Clerk: ingreso, registro solo por invitación, vinculación en el primer ingreso, `requireMiembro`, `requireEscritura` y `requireSuperadmin` (PAN-01).
- El alta de negocios desde `/admin` (ADM-01, ADM-02 y F-11), incluida la creación de la "Sede principal" (Q-05), y el primer ingreso del dueño (F-05, pasos 1 y 2).
- El despliegue base en `*.workers.dev` (Q-06), con migraciones, semilla y el Cron Trigger conectado, todavía sin tareas.

**No entra:**

- La configuración de la sede principal, los servicios, los recursos, el horario y los bloqueos (Fase 2), ni la lista de verificación de F-05 (paso 3).
- La gestión de la suscripción: ADM-03, ADM-05, PAN-19, `aplicarVencimientos`, C-07 y C-08 (Q-04). Esta fase solo calcula el estado efectivo y bloquea la escritura.
- R2, los límites de frecuencia, Resend y los encabezados de seguridad: cada uno llega en la fase que lo usa.

**Criterio de salida:** T1.57, la verificación de punta a punta en el Worker desplegado.

### 1.A Proyecto y despliegue inicial

Desplegar un esqueleto el primer día es la mitigación del riesgo principal de ARCH §23 (incompatibilidades entre Next.js, OpenNext y Clerk).

* [x] T1.01: Crear el proyecto Next.js
   * Objetivo: Crear la app con App Router, TypeScript estricto, Tailwind, carpeta `src/` y alias `@/*`, fijando la versión de Next que soporta `@opennextjs/cloudflare` (ARCH §3: "se fija el día 1").
   * Archivos: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `.nvmrc`, `.gitignore`
   * Depende de: —
   * Refs: RNF-02, ARCH §3, §4, §23; Q-15
   * Aceptación:
      * `npm run build` y `npx tsc --noEmit` terminan sin errores, con `"strict": true` en `tsconfig.json`.
      * `next`, `react` y `react-dom` tienen versión exacta (sin `^` ni `~`), y `.nvmrc` fija la versión de Node.
      * `src/app/layout.tsx` declara `<html lang="es">`.

* [x] T1.02: Vitest y scripts de verificación
   * Objetivo: Configurar Vitest (proyecto `unit` sobre `tests/unit/`) con el alias `@` y con `server-only` reemplazado por un módulo vacío, y crear los scripts de la definición de terminado.
   * Archivos: `vitest.config.ts`, `tests/stubs/server-only.ts`, `package.json` (scripts `typecheck`, `lint`, `test` y `verificar`)
   * Depende de: T1.01
   * Refs: ARCH §3, §20
   * Aceptación:
      * `npm run verificar` ejecuta `tsc --noEmit`, `eslint .` y `vitest run`, y termina con código 0 (con `passWithNoTests` mientras no haya pruebas).
      * Una prueba temporal que importa un archivo con `import 'server-only'` pasa; se borra después.

* [x] T1.03: Reglas de dependencia entre capas
   * Objetivo: Hacer cumplir con `no-restricted-imports` las reglas de ARCH §4: `src/dominio/` no importa nada del proyecto fuera de sí mismo ni librerías de framework o de E/S, y `src/app/` y `src/componentes/` no importan `src/servidor/db/`. Las reglas cubren también las rutas relativas.
   * Archivos: `eslint.config.mjs`
   * Depende de: T1.02
   * Refs: ARCH §4
   * Aceptación:
      * `npm run lint` pasa sobre el proyecto.
      * Un archivo temporal en `src/dominio/` que importa `@/servidor/db/cliente`, `../servidor/…`, `next/headers`, `react`, `drizzle-orm`, `@neondatabase/serverless` o `@clerk/nextjs` hace fallar `npm run lint`; se borra después.
      * Un archivo temporal en `src/app/` que importa `@/servidor/db/…` hace fallar `npm run lint`; se borra después.

* [x] T1.04: Adaptador de Cloudflare (OpenNext)
   * Objetivo: Integrar `@opennextjs/cloudflare` y `wrangler` (versiones exactas) con un `wrangler.jsonc` basado en ARCH §21.2, reducido a lo que usa esta fase (sin R2, límites de frecuencia ni cron), y con la entrada propia `worker.ts`, que por ahora solo reexporta `fetch`.
   * Archivos: `open-next.config.ts`, `wrangler.jsonc`, `worker.ts`, `next.config.ts` (`initOpenNextCloudflareForDev()`), `cloudflare-env.d.ts` (generado con `wrangler types`), `package.json` (scripts `preview` y `cf-typegen`)
   * Depende de: T1.01
   * Refs: ARCH §3, §14.5, §21.1, §21.2
   * Aceptación:
      * `npm run preview` compila con OpenNext y sirve la página inicial en `http://localhost:8787`.
      * `wrangler.jsonc` tiene `"main": "worker.ts"`, `"compatibility_flags": ["nodejs_compat"]` y `"observability": { "enabled": true }`.
      * `npm run typecheck` pasa con `worker.ts` tipado como `ExportedHandler<CloudflareEnv>`.

* [x] T1.05: [manual] Cuenta de Cloudflare y acceso de wrangler
   * Objetivo: Tener la cuenta de Cloudflare con el subdominio `*.workers.dev` activo y `wrangler` autenticado en la máquina de desarrollo.
   * Archivos: —
   * Depende de: —
   * Refs: ARCH §2, §21.1
   * Aceptación:
      * `npx wrangler whoami` muestra la cuenta.
      * El Dashboard de Cloudflare muestra el subdominio `*.workers.dev` de la cuenta.

* [x] T1.06: Primer despliegue del esqueleto
   * Objetivo: Desplegar el esqueleto en `*.workers.dev` con un solo comando, para detectar el primer día las incompatibilidades entre Next, OpenNext y Workers.
   * Archivos: `package.json` (script `deploy`: `opennextjs-cloudflare build && opennextjs-cloudflare deploy`)
   * Depende de: T1.04, T1.05
   * Refs: RNF-09, ARCH §21.4, §23
   * Aceptación:
      * `npm run deploy` termina sin errores y `https://agenda-citas.<subdominio>.workers.dev/` responde 200.
      * El tamaño del Worker que informa `wrangler` queda anotado en el mensaje del commit. Si supera el límite del plan gratuito, la cuenta pasa a Workers Paid (ARCH §21.4).

### 1.B Base de datos: esquema y migraciones

Las tablas se declaran en `src/servidor/db/esquema.ts`, que debe producir exactamente el DDL de ARCH §18.2. Lo que Drizzle no expresa va en migraciones manuales creadas con `npx drizzle-kit generate --custom --name <nombre>` (ARCH §8). Cada tarea de esquema depende de la anterior para mantener lineal la cadena de migraciones de `drizzle-kit`.

**Criterios comunes de las tareas de esquema:**

- **E1.** `npm run db:generate` crea una sola migración nueva cuyo SQL coincide con ARCH §18.2 para las tablas de la tarea (tipos, `DEFAULT`, `CHECK`, FK, `UNIQUE` e índices). Un segundo `npm run db:generate` informa que no hay cambios.
- **E2.** `npm run db:migrate` aplica la migración en la rama `development`, y `npm run test:integracion` pasa (aplica la cadena completa en una rama efímera).

* [x] T1.07: [manual] Proyecto de Neon
   * Objetivo: Crear el proyecto de Neon en la región `aws-us-east-1`, con las ramas `production` (la predeterminada) y `development`, y una API key para crear las ramas efímeras de las pruebas.
   * Archivos: `.env.local` (no versionado)
   * Depende de: —
   * Refs: ARCH §8, §20, §21.1, §21.3; Q-07
   * Aceptación:
      * La consola de Neon muestra el proyecto en `aws-us-east-1` con las ramas `production` y `development`.
      * `.env.local` tiene `DATABASE_URL` (con *pooler*) y `DATABASE_URL_DIRECTA` de la rama `development`, más la API key y el ID del proyecto (Q-07). `NEON_PROJECT_ID` es el ID del proyecto (como `palabra-palabra-12345678`), no el `br-…` de una rama.
      * `select version()` responde con la cadena directa de `development` (con `psql` o con el SQL Editor de Neon).

* [x] T1.08: Plantilla de variables de entorno
   * Objetivo: Listar sin valores, en `.env.example`, todas las variables de ARCH §7.7 y §21.3, y asegurar que ningún archivo con secretos se versiona.
   * Archivos: `.env.example`, `.gitignore`
   * Depende de: T1.01
   * Refs: RNF-04, ARCH §7.7, §19.2, §21.3; Q-07
   * Aceptación:
      * `.env.example` contiene cada nombre de ARCH §7.7 y §21.3, más los de Q-07.
      * `git check-ignore .env.local .dev.vars .env.production.local` lista los tres archivos.

* [x] T1.09: Drizzle y clientes de Neon
   * Objetivo: Instalar `drizzle-orm`, `drizzle-kit` y `@neondatabase/serverless` (versiones exactas), configurar `drizzle-kit` (esquema, carpeta `drizzle/` y cadena directa) y crear `db()` por HTTP y `enTransaccion()` por WebSocket, como en ARCH §8.
   * Archivos: `drizzle.config.ts`, `src/servidor/db/cliente.ts`, `src/servidor/db/esquema.ts` (vacío), `package.json` (scripts `db:generate`, `db:migrate` y `db:check`)
   * Depende de: T1.02, T1.07, T1.08
   * Refs: D-07, ADR-02, ADR-03, ARCH §8
   * Aceptación:
      * `cliente.ts` empieza con `import 'server-only'`, usa `isolationLevel: 'read committed'` y crea y cierra el `Pool` dentro de cada transacción: ninguna variable de módulo lo guarda.
      * `drizzle.config.ts` usa `DATABASE_URL_DIRECTA` (sin *pooler*), y `npm run db:check` termina sin errores.

* [x] T1.10: Migración manual: dominios de claves de planes
   * Objetivo: Crear la primera migración, manual, con los dominios `clave_funcionalidad` y `clave_limite` idénticos a ARCH §18.2, para que existan antes que las tablas que los usan.
   * Archivos: `drizzle/0000_dominios.sql`, `drizzle/meta/`
   * Depende de: T1.09
   * Refs: ADR-11, ARCH §16.2, §18.2
   * Aceptación:
      * `npm run db:migrate` la aplica en `development` e `information_schema.domains` muestra los dos dominios.
      * `select 'no_existe'::clave_limite` falla por el `CHECK` del dominio.

* [x] T1.11: Pruebas de integración con rama efímera de Neon
   * Objetivo: Añadir el proyecto de Vitest `integracion` (`tests/integracion/`), cuyo `globalSetup` crea una rama a partir de `development` con la API de Neon, aplica las migraciones y la elimina al terminar.
   * Archivos: `vitest.config.ts`, `tests/integracion/global-setup.ts`, `tests/integracion/conexion.test.ts`, `package.json` (script `test:integracion`)
   * Depende de: T1.10
   * Refs: ARCH §8, §20 (párrafo final); Q-07
   * Aceptación:
      * `npm run test:integracion` pasa una prueba que ejecuta `select 1` con `db()` y con `enTransaccion()` sobre la rama efímera.
      * Al terminar, también cuando una prueba falla, la rama efímera ya no aparece en la consola de Neon.
      * `npm test` ejecuta los proyectos `unit` e `integracion`.

* [x] T1.12: Esquema: enums y tablas de planes
   * Objetivo: Declarar los 9 enums de ARCH §18.2, los dominios como `customType` de Drizzle y las tablas `plan`, `plan_funcionalidad` y `plan_limite`.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.11
   * Refs: RN-26, ADR-11, ARCH §17.2, §18.1, §18.2
   * Aceptación:
      * E1 y E2.
      * Los valores de cada enum siguen el orden de ARCH §18.2, y `plan_funcionalidad.funcionalidad` y `plan_limite.limite` usan los dominios, no `text`.

* [x] T1.13: Esquema: negocio y excepciones de plan
   * Objetivo: Declarar `negocio` (slug, marca, zona horaria, plan, suscripción y vencimiento), `negocio_funcionalidad` y `negocio_limite`.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.12
   * Refs: RN-02, RN-03, RN-04, RN-26, RN-31, ARCH §18.1, §18.2
   * Aceptación:
      * E1 y E2.
      * El SQL incluye el `CHECK` de formato y longitud del slug, los dos `CHECK` de vencimiento (`prueba` exige `fin_prueba`; `activa`, `pagado_hasta`) y `plan_id NOT NULL` sin valor por defecto. `actualizado_en` usa `$onUpdate`.

* [x] T1.14: Esquema: configuración, política de datos y miembros
   * Objetivo: Declarar `configuracion_negocio`, `politica_datos` y `miembro_negocio`.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.13
   * Refs: RN-08, RN-13, RN-21, RN-34, D-05, D-09, D-20, D-21, ARCH §7.4, §18.2
   * Aceptación:
      * E1 y E2.
      * Los valores por defecto de `configuracion_negocio` son 30, 120, 60, 24, 24, 3 y `'completada'` (D-09, D-20 y D-21), con `CHECK (granularidad_minutos IN (15, 30, 60))`.
      * `miembro_negocio.correo` es `UNIQUE` con `CHECK (correo = lower(correo))`, y `clerk_user_id` es `UNIQUE` y admite `NULL`.

* [x] T1.15: Esquema: sedes y recursos
   * Objetivo: Declarar `sede` y `recurso`, incluidos los campos de empleados (`foto_url`, `descripcion`, `correo` y `orden`), que no tienen interfaz en el MVP (D-17).
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.14
   * Refs: RN-06, RN-32, RN-33, D-16, D-17, ADR-15, ADR-16, ARCH §18.2
   * Aceptación:
      * E1 y E2.
      * `recurso` tiene `CHECK (capacidad >= 1)`, `CHECK (tipo <> 'profesional' OR capacidad = 1)`, `UNIQUE (id, negocio_id)`, `UNIQUE (id, sede_id)` y la FK compuesta `(sede_id, negocio_id)`.

* [x] T1.16: Esquema: catálogo de servicios y oferta por sede
   * Objetivo: Declarar `servicio`, `servicio_sede` y `servicio_sede_recurso`, cada una con su FK directa a `negocio` (ARCH §18.1).
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.15
   * Refs: RN-05, RN-06, RN-32, RN-33, D-02, ARCH §18.1, §18.2
   * Aceptación:
      * E1 y E2.
      * En `development`, un script SQL dentro de `BEGIN … ROLLBACK` que inserta plan, negocio, sede, recurso, servicio, `servicio_sede` y `servicio_sede_recurso`, y después borra el negocio, termina sin error (ARCH §18.1).

* [x] T1.17: Esquema: horario semanal y bloqueos
   * Objetivo: Declarar `horario_semanal`, con `recurso_id` opcional para el horario propio de un empleado (D-19), y `bloqueo`, cuyo alcance es el negocio, una sede o un recurso.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.16
   * Refs: RN-07, RN-32, D-19, ADR-12, ARCH §9, §18.2
   * Aceptación:
      * E1 y E2.
      * El SQL incluye `CHECK (dia_semana BETWEEN 1 AND 7)`, `CHECK (hora_fin > hora_inicio)`, `CHECK (fin > inicio)`, `CHECK (recurso_id IS NULL OR sede_id IS NOT NULL)` y el índice `horario_sede_idx`.

* [x] T1.18: Esquema: clientes
   * Objetivo: Declarar `cliente`, con sus restricciones de identidad y de anonimización.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.17
   * Refs: RN-18, RN-19, RN-24, S-14, ARCH §18.2
   * Aceptación:
      * E1 y E2.
      * El SQL incluye `UNIQUE (negocio_id, telefono_e164)`, el `CHECK` del formato E.164 y el índice único parcial `cliente_correo_uq … WHERE correo IS NOT NULL`.

* [x] T1.19: Esquema: citas y eventos
   * Objetivo: Declarar `cita` (instantánea, consentimiento, versiones, `recurso_elegido` y `reprogramaciones_cliente`) y `evento_cita`, con sus índices, salvo `cita_ocupacion_idx` (T1.21).
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.18
   * Refs: RN-01, RN-10, RN-12, RN-17, RN-33, RN-34, D-06, ADR-13, ARCH §6, §18.2
   * Aceptación:
      * E1 y E2.
      * El SQL incluye los cuatro `CHECK` y las seis FK compuestas de `cita`, y `evento_cita.id` es `GENERATED ALWAYS AS IDENTITY`.
      * En `development`, dentro de `BEGIN … ROLLBACK`, insertar una cita del negocio A con un servicio del negocio B falla por la FK compuesta (ARCH §6, defensa 2).

* [x] T1.20: Esquema: notificaciones y enlaces de calendario
   * Objetivo: Declarar `notificacion` y `enlace_calendario`, salvo el índice `enlace_calendario_vigente_uq` (T1.21).
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración en `drizzle/`
   * Depende de: T1.19
   * Refs: RN-20, RN-35, S-16, ARCH §14.1, §14.7, §18.2
   * Aceptación:
      * E1 y E2.
      * El SQL incluye `clave_idempotencia` `UNIQUE`, `CHECK ((tipo IN ('dueno_gracia', 'dueno_suspension')) = (cita_id IS NULL))` y el índice parcial `notificacion_cola_idx`.

* [x] T1.21: Migración manual: índices que Drizzle no expresa
   * Objetivo: Crear en una migración manual `cita_ocupacion_idx` (con `INCLUDE` y `WHERE estado <> 'cancelada'`) y `enlace_calendario_vigente_uq` (con `NULLS NOT DISTINCT` y `WHERE revocado_en IS NULL`). Si la versión fijada de Drizzle expresa alguno, ese se declara en el esquema.
   * Archivos: nueva migración manual en `drizzle/`
   * Depende de: T1.20
   * Refs: RN-35, D-06, ARCH §8, §18.2
   * Aceptación:
      * E2.
      * `pg_indexes` muestra en `development` las dos definiciones iguales a ARCH §18.2.
      * `npm run db:generate` informa que no hay cambios: Drizzle no intenta borrar los índices.

* [x] T1.22: Auditoría: tabla, función y triggers
   * Objetivo: Declarar `auditoria_admin` en Drizzle y crear, en una migración manual, la función `auditar_cambio()` y los seis triggers de ARCH §18.2.
   * Archivos: `src/servidor/db/esquema.ts`, nueva migración generada y nueva migración manual en `drizzle/`
   * Depende de: T1.21
   * Refs: RN-30, ADR-11, ARCH §16.4, §18.2
   * Aceptación:
      * E2.
      * `select tgname from pg_trigger where tgname like 'auditar_%'` devuelve los seis triggers en `development`.
      * `auditoria_admin.negocio_id` no tiene FK, para que el registro sobreviva al negocio.

* [x] T1.23: Pruebas del esquema: sedes y recursos
   * Objetivo: Probar las restricciones del modelo de sedes con datos mínimos creados por un ayudante de pruebas. El ayudante inserta el plan por SQL, porque la semilla llega en T1.30.
   * Archivos: `tests/integracion/fixtures.ts`, `tests/integracion/esquema/sedes.test.ts`
   * Depende de: T1.22
   * Refs: RN-06, RN-32, ARCH §20 (Sedes); Q-16
   * Aceptación (una prueba por caso; todas pasan):
      * Un `servicio_sede_recurso` con un recurso de otra sede se rechaza por FK (RN-32: un servicio no se ofrece en una sede con un recurso de otra; ARCH §20, Sedes).
      * Una `cita` con un servicio que su sede no ofrece se rechaza por FK (ARCH §20, Sedes).
      * Un recurso con capacidad 0 se rechaza (RN-06).

* [x] T1.24: Pruebas del esquema: modelo de empleados
   * Objetivo: Probar que el modelo de empleados (D-17) ya protege sus invariantes, aunque no tenga interfaz.
   * Archivos: `tests/integracion/esquema/empleados.test.ts`
   * Depende de: T1.23
   * Refs: RN-33, D-17, D-19, ARCH §20 (Modelo de empleados)
   * Aceptación (una prueba por caso; todas pasan):
      * Un recurso `profesional` con capacidad distinta de 1 se rechaza (RN-33; ARCH §20).
      * Un empleado de otra sede en `servicio_sede_recurso` se rechaza por FK (ARCH §20).
      * Un horario propio (`horario_semanal.recurso_id`) de un recurso de otra sede se rechaza por FK (ARCH §20).

### 1.C Dominio

Funciones puras que usa esta fase: sin E/S, sin Next y sin base de datos. Lo que depende del reloj recibe `ahora: Date` (ARCH §4). Cada función lleva su prueba unitaria en `tests/unit/dominio/`, en la misma tarea.

* [x] T1.25: Resultado y errores de negocio
   * Objetivo: Definir `Resultado<T, E>` (`{ ok: true, valor } | { ok: false, error }`) con sus constructores, el tipo `CodigoError` y la clase `ErrorNegocio`.
   * Archivos: `src/dominio/resultado.ts`, `tests/unit/dominio/resultado.test.ts`
   * Depende de: T1.03
   * Refs: ARCH §7.5, §18.4, §18.5; Q-01
   * Aceptación:
      * `CodigoError` incluye los 10 códigos de la tabla de ARCH §18.5, más `SLUG_NO_DISPONIBLE`, `CONFLICTO_VERSION`, `ANTES_DEL_INICIO` y `FRANJAS_SOLAPADAS` (ARCH §18.4).
      * La prueba unitaria verifica que los constructores producen las dos ramas y que `ErrorNegocio` expone su `codigo`.

* [x] T1.26: Tiempo: hora local y UTC
   * Objetivo: Implementar en `dominio/tiempo.ts`, con `@date-fns/tz`, la conversión de una fecha y hora local a UTC con la zona del negocio, y la de una fecha de vencimiento local inclusiva al instante que se guarda (las 00:00 locales del día siguiente) y de vuelta.
   * Archivos: `src/dominio/tiempo.ts`, `tests/unit/dominio/tiempo.test.ts`, `package.json` (`date-fns` y `@date-fns/tz`, versiones exactas)
   * Depende de: T1.03
   * Refs: RN-03, RN-31, ADR-12, ARCH §7.6, §9
   * Aceptación:
      * El 14-oct-2026 a las 7:00 a. m. en `America/Bogota` da `2026-10-14T12:00:00Z`, y a las 7:00 p. m. da `2026-10-15T00:00:00Z` (caso obligatorio de ARCH §9).
      * "Pagado hasta el 9 de octubre" da `2026-10-10T05:00:00Z`, y la conversión inversa devuelve `2026-10-09` (ARCH §7.6).
      * Los resultados no cambian si la suite corre con `TZ` distinta de Bogotá (RN-03: "aunque el dispositivo esté en otra zona horaria").

* [x] T1.27: Estado efectivo de la suscripción
   * Objetivo: Implementar `estadoEfectivo()` y `DIAS_GRACIA = 3` tal como ARCH §7.6.
   * Archivos: `src/dominio/suscripcion.ts`, `tests/unit/dominio/suscripcion.test.ts`
   * Depende de: T1.03
   * Refs: RN-04, RN-29, RN-31, D-13, ADR-14, ARCH §7.6, §20 (`dominio/suscripcion`)
   * Aceptación (para `prueba` con `finPrueba` y para `activa` con `pagadoHasta`):
      * `vence − 1 ms` da `al_dia`; `vence` da `en_gracia` con `suspendeEn = vence + 3 días`; `vence + 3 días − 1 ms` da `en_gracia`; y `vence + 3 días` da `suspendida` (ARCH §20).
      * Con vencimiento el 10-oct a las 00:00 hora de Bogotá, el 12-oct a las 23:59 da `en_gracia` y el 13-oct a las 00:00 da `suspendida` (RN-31).
      * Con `estadoSuscripcion = 'suspendida'`, da `suspendida` en cualquier instante (RN-04).

* [x] T1.28: Validación de slugs
   * Objetivo: Definir la lista `RESERVADOS` de ARCH §5 y `validarSlug()`, que distingue un formato inválido de un slug reservado.
   * Archivos: `src/dominio/slug.ts`, `tests/unit/dominio/slug.test.ts`
   * Depende de: T1.03
   * Refs: RN-02, ARCH §5; Q-01
   * Aceptación:
      * Cada uno de los 22 slugs de `RESERVADOS` se rechaza como reservado.
      * Se rechazan por formato: 2 y 41 caracteres, mayúsculas, `_`, guion al inicio, al final o doble, y `_next`. Se aceptan 3 y 40 caracteres y `optica-vision-2` (RN-02).

### 1.D Planes

El catálogo en código es la fuente de verdad (ARCH §16.2), y `src/servidor/planes/` es el único módulo que lee las tablas de planes y de excepciones (RN-25). PRD §12 no asigna los planes a ninguna fase, pero la Fase 1 los necesita para el alta (RN-26) y la Fase 2 para `max_services` (Q-04).

* [x] T1.29: Catálogo de funcionalidades y límites
   * Objetivo: Crear `FUNCIONALIDADES`, `LIMITES` y sus tipos exactamente como ARCH §16.2.
   * Archivos: `src/servidor/planes/catalogo.ts`, `tests/unit/planes/catalogo.test.ts`
   * Depende de: T1.02
   * Refs: RN-25, D-16, PRD §8.8, ARCH §16.2
   * Aceptación:
      * La prueba unitaria verifica las 6 funcionalidades con `porDefecto: false` y los 6 límites con `porDefecto: 0`, salvo `max_locations`, con 1 (PRD §8.8).
      * El archivo empieza con `import 'server-only'`.

* [x] T1.30: Semilla del plan `ilimitado`
   * Objetivo: Crear `sembrarPlanes()`, que genera desde el catálogo el plan `ilimitado` con todas las funcionalidades habilitadas y todos los límites en `NULL`, de forma idempotente y sin sobrescribir valores existentes. Se ejecuta con `npm run db:semilla` y en el `globalSetup` de las pruebas de integración.
   * Archivos: `src/servidor/planes/semilla.ts`, `scripts/semilla.ts`, `tests/integracion/global-setup.ts`, `package.json` (script `db:semilla`)
   * Depende de: T1.12, T1.29
   * Refs: RN-26, RN-27, ADR-11, ARCH §18.2 (Semilla); Q-01
   * Aceptación:
      * Ejecutar `npm run db:semilla` dos veces en `development` deja 1 fila en `plan`, 6 en `plan_funcionalidad` y 6 en `plan_limite`.
      * La rama efímera de las pruebas de integración ya tiene el plan `ilimitado`.

* [x] T1.31: Función de acceso a planes
   * Objetivo: Implementar `tieneFuncionalidad`, `limite` (`null` = ilimitado), `exigirCupo` y `listarPlanes`, con la resolución de ARCH §16.3 (excepción, plan y catálogo), que distingue "no hay fila" de "fila con `NULL`".
   * Archivos: `src/servidor/planes/acceso.ts`, `tests/integracion/planes/acceso.test.ts`
   * Depende de: T1.13, T1.25, T1.30
   * Refs: RN-25, RN-28, ARCH §16.3
   * Aceptación:
      * `exigirCupo` lanza `ErrorNegocio('LIMITE_PLAN')` cuando `usoActual >= límite` y no lanza cuando el límite es `null` (prueba de integración).
      * `listarPlanes()` devuelve `id`, `codigo` y `nombre`. El alta y la lista del admin la usan para no leer `plan` fuera del módulo.

* [x] T1.32: Lint: tablas de planes solo en su módulo
   * Objetivo: Impedir que el código fuera de `src/servidor/planes/` lea las tablas de planes y de excepciones, ya sea importando sus tablas del esquema o nombrándolas en SQL.
   * Archivos: `eslint.config.mjs`
   * Depende de: T1.03, T1.31
   * Refs: RN-25, ARCH §16.1; Q-14
   * Aceptación:
      * `npm run lint` pasa.
      * Un archivo temporal en `src/servidor/casos-uso/` que importa `planLimite` de `@/servidor/db/esquema` hace fallar el lint, igual que uno con ``sql`select * from negocio_limite` ``. Se borran después.

* [x] T1.33: Pruebas de planes: catálogo y semilla
   * Objetivo: Probar que la base de datos y la semilla coinciden con el catálogo.
   * Archivos: `tests/integracion/planes/catalogo-semilla.test.ts`
   * Depende de: T1.30
   * Refs: RN-26, ARCH §16.2, §20 (Planes); Q-03
   * Aceptación:
      * Las claves de los dominios `clave_funcionalidad` y `clave_limite`, leídas de `pg_constraint`, coinciden con `FUNCIONALIDADES` y `LIMITES` (ARCH §20, Planes).
      * Después de la semilla existe el plan `ilimitado`, con las 6 funcionalidades habilitadas y todos los límites en `NULL` (RN-26; Q-03).
      * Insertar un negocio sin `plan_id` falla (RN-26).

* [x] T1.34: Pruebas de planes: resolución
   * Objetivo: Probar el orden de resolución de la función de acceso.
   * Archivos: `tests/integracion/planes/resolucion.test.ts`
   * Depende de: T1.31
   * Refs: RN-25, RN-27, PRD §8.8, ARCH §16.3, §20 (Planes)
   * Aceptación:
      * Un negocio con el plan `ilimitado` y sin excepciones responde "habilitada" para cada funcionalidad e "ilimitado" (`null`) para cada límite (RN-27).
      * La excepción del negocio gana al plan; una excepción con `NULL` es ilimitada aunque el plan tenga un valor; y, sin excepción ni fila del plan, se usa el catálogo: deshabilitada, 0, y 1 para `max_locations` (ARCH §20 y §16.3; PRD §8.8).

* [x] T1.35: Pruebas de planes: auditoría
   * Objetivo: Probar que los triggers registran los cambios de plan, de suscripción y de excepciones.
   * Archivos: `tests/integracion/planes/auditoria.test.ts`
   * Depende de: T1.22, T1.30
   * Refs: RN-30, ADR-11, ARCH §16.4, §20 (Planes)
   * Aceptación:
      * Cambiar `plan_id`, `estado_suscripcion`, `fin_prueba` o `pagado_hasta` de un negocio deja una fila por cambio en `auditoria_admin`, con fecha, autor, `antes` y `despues` (RN-30).
      * Insertar, cambiar o borrar filas de `negocio_funcionalidad`, `negocio_limite`, `plan_funcionalidad` y `plan_limite` también queda registrado (ARCH §20, Planes).
      * Con `set_config('app.actor', 'user_prueba', true)` dentro de la transacción, el autor es `user_prueba`. Con SQL directo sin `app.actor`, el autor es el rol de la base de datos (RN-30: "aunque el cambio se haga con SQL directo").

### 1.E Autenticación y contexto del negocio

Clerk solo autentica; la pertenencia al negocio vive en `miembro_negocio` (ADR-05). El middleware solo protege rutas, y la autorización se repite en cada página, Server Action y ruta (ARCH §7.3). En las pruebas, `@clerk/nextjs/server` se simula con `vi.mock`.

* [x] T1.36: [manual] Instancia de desarrollo de Clerk
   * Objetivo: Configurar la instancia de desarrollo de Clerk según ARCH §7.2 y crear desde el Dashboard la cuenta del administrador del SaaS, porque el registro queda restringido a invitaciones.
   * Archivos: `.env.local` (no versionado)
   * Depende de: —
   * Refs: D-08, ADR-05, ADR-06, ADR-07, ARCH §7.2, §7.7
   * Aceptación:
      * El Dashboard muestra: identificador por correo, contraseña, verificación de correo obligatoria, modo de registro **Restringido**, sin proveedores sociales, y rutas `/login` y `/registro`.
      * `.env.local` tiene las variables de ARCH §7.7, y `SUPERADMIN_CLERK_USER_IDS` contiene el `user_…` del administrador, cuyo correo está verificado.

* [x] T1.37: Clerk y middleware
   * Objetivo: Instalar `@clerk/nextjs` y `@clerk/localizations` (versiones exactas) y proteger `/panel` y `/admin` con el middleware de ARCH §7.3. Si la versión de Next fijada en T1.01 es la 16, el archivo es `src/proxy.ts`.
   * Archivos: `src/middleware.ts` (o `src/proxy.ts`), `package.json`
   * Depende de: T1.04, T1.36
   * Refs: ARCH §7.1, §7.3, §7.7
   * Aceptación:
      * Sin sesión, `/panel` y `/admin` redirigen a `/login`, tanto con `npm run dev` como con `npm run preview` (Workers).
      * `/` responde 200, sin redirección.

* [x] T1.38: Páginas de ingreso y registro
   * Objetivo: Crear el layout del grupo `(auth)` con `<ClerkProvider localization={esES}>` y las páginas `/login` (`<SignIn/>`) y `/registro` (`<SignUp/>`).
   * Archivos: `src/app/(auth)/layout.tsx`, `src/app/(auth)/login/[[...rest]]/page.tsx`, `src/app/(auth)/registro/[[...rest]]/page.tsx`
   * Depende de: T1.37
   * Refs: PAN-01, RNF-01, ADR-06, ARCH §4, §7.2
   * Aceptación:
      * `/login` muestra el formulario de Clerk en español, y el administrador de T1.36 puede ingresar.
      * `/registro` sin invitación no permite crear una cuenta.
      * La página `/` no carga scripts de Clerk (pestaña Red del navegador), porque `<ClerkProvider>` no está en el layout raíz (ARCH §7.2).

* [x] T1.39: Repositorios de miembros y negocios
   * Objetivo: Crear los repositorios que usa la sesión: `miembros.porClerkId`, `miembros.vincular(correo, clerkUserId)` (`UPDATE … WHERE correo = … AND clerk_user_id IS NULL RETURNING`, que también fija `vinculado_en`), `negocios.suscripcion(negocioId)` y `negocios.resumen(negocioId)` (nombre y slug).
   * Archivos: `src/servidor/db/repositorios/miembros.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/repositorios/miembros.test.ts`
   * Depende de: T1.14
   * Refs: RN-01, ADR-05, ARCH §6 (defensa 1), §7.4; Q-01
   * Aceptación:
      * `vincular` guarda `clerk_user_id` y `vinculado_en` en un miembro pendiente. Una segunda llamada con el mismo correo y otro `clerkUserId` devuelve `null` y no cambia la fila (ARCH §7.4).
      * Toda función de `negocios.ts` recibe `negocioId` como primer parámetro (ARCH §6).

* [x] T1.40: `requireMiembro` y vinculación en el primer ingreso
   * Objetivo: Implementar `ContextoMiembro`, `requireMiembro` (memorizado por solicitud) y la vinculación por el correo principal verificado, como en ARCH §7.5.
   * Archivos: `src/servidor/auth/sesion.ts`, `tests/integracion/auth/require-miembro.test.ts`
   * Depende de: T1.27, T1.37, T1.39
   * Refs: RN-01, RN-04, ADR-05, ARCH §6, §7.4, §7.5
   * Aceptación:
      * Un usuario ya vinculado obtiene su `negocioId` y su `suscripcion`, calculada con `estadoEfectivo()`. Uno pendiente con el correo principal verificado queda vinculado en ese momento (ARCH §7.4).
      * Con el correo principal sin verificar, redirige a `/sin-acceso` y el miembro conserva `clerk_user_id` en `NULL` (ARCH §7.4: "Un correo sin verificar nunca da acceso").
      * Sin sesión, redirige a `/login`.

* [x] T1.41: `requireEscritura` y envoltorio de Server Actions
   * Objetivo: Implementar `requireEscritura`, que lanza `ErrorNegocio('NEGOCIO_SUSPENDIDO')` cuando el negocio está suspendido, y el envoltorio de Server Actions que convierte un `ErrorNegocio` en `{ ok: false, error }`.
   * Archivos: `src/servidor/auth/sesion.ts`, `src/servidor/accion.ts`, `tests/unit/servidor/accion.test.ts`
   * Depende de: T1.25, T1.40
   * Refs: RN-04, D-14, S-17, ARCH §7.5, §18.4; Q-01
   * Aceptación:
      * El envoltorio devuelve `{ ok: false, error: 'NEGOCIO_SUSPENDIDO' }` ante ese `ErrorNegocio` y relanza cualquier otro error, incluidos `redirect()` y `notFound()` de Next (prueba unitaria).
      * `requireEscritura` decide solo con `ctx.suscripcion.estado`, sin otra consulta, y su comentario documenta la excepción de S-17. Su prueba con un negocio suspendido está en T1.43.

* [x] T1.42: `requireSuperadmin`
   * Objetivo: Implementar `requireSuperadmin` con la lista `SUPERADMIN_CLERK_USER_IDS` (ADR-07). Responde 404 para no revelar que `/admin` existe.
   * Archivos: `src/servidor/auth/sesion.ts`, `tests/unit/servidor/require-superadmin.test.ts`
   * Depende de: T1.37
   * Refs: ADR-07, ARCH §5, §7.5
   * Aceptación (con `auth()` simulado):
      * Un `userId` de la lista pasa, aunque la variable tenga espacios junto a las comas.
      * Un `userId` fuera de la lista, la variable vacía o la falta de sesión llaman a `notFound()`.

* [x] T1.43: Pruebas de acceso según la suscripción
   * Objetivo: Probar cómo afecta el estado efectivo de la suscripción al acceso al panel, con negocios creados por el ayudante de pruebas.
   * Archivos: `tests/integracion/auth/suscripcion.test.ts`
   * Depende de: T1.30, T1.41
   * Refs: RN-04, RN-29, RN-31, D-14, ARCH §7.6, §20 (Suscripción)
   * Aceptación:
      * Con el negocio `suspendida` y el plan `ilimitado`, el dueño obtiene su contexto (conserva el acceso y puede consultar), pero `requireEscritura` rechaza con `NEGOCIO_SUSPENDIDO` y el envoltorio devuelve `{ ok: false, error: 'NEGOCIO_SUSPENDIDO' }` (RN-04, RN-29; ARCH §20, Suscripción).
      * Un negocio en `activa` cuyo `pagado_hasta` más 3 días ya pasó se trata como suspendido, aunque la columna siga en `activa` (RN-31: "aunque la tarea programada todavía no haya corrido").
      * Un negocio en gracia pasa `requireEscritura`, y su contexto trae `suspendeEn` (RN-31: "todo funciona").

### 1.F Alta de negocios y primer ingreso del dueño

Cubre ADM-01, ADM-02, F-11 y los pasos 1 y 2 de F-05. La invitación la envía Clerk; esta fase no usa Resend.

* [x] T1.44: Plantilla de la política de datos
   * Objetivo: Crear la plantilla de la política de tratamiento de datos (D-05) de la que sale la versión 1 de cada negocio, con las secciones que exige ARCH §19.3 y una marca visible de revisión legal pendiente.
   * Archivos: `src/servidor/politica-datos/plantilla.ts`
   * Depende de: T1.02
   * Refs: RN-17, RN-24, D-05, ARCH §19.3; Q-01, Q-10
   * Aceptación:
      * La plantilla (Markdown) tiene secciones para la finalidad, los derechos del titular, el carácter sensible de los datos de salud, el canal de atención y el tratamiento por proveedores fuera de Colombia (ARCH §19.3).
      * Nombra al negocio como responsable del tratamiento e incluye un aviso visible de que falta la revisión de un abogado (Q-10).

* [x] T1.45: Caso de uso `altaNegocio`
   * Objetivo: Implementar `altaNegocio`. Valida la entrada con Zod y `validarSlug`, resuelve el plan con `listarPlanes` y convierte el vencimiento con `dominio/tiempo`. Luego, en una sola transacción con `app.actor` igual al `clerk_user_id` del admin, crea el negocio, su configuración, la "Sede principal" con su dirección y teléfono, el recurso "Consultorio" (capacidad 1), la política v1 y el miembro pendiente. Devuelve un `Resultado` con los códigos de Q-09.
   * Archivos: `src/servidor/casos-uso/alta-negocio.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/alta-negocio.test.ts`
   * Depende de: T1.26, T1.28, T1.31, T1.39, T1.44
   * Refs: ADM-02, F-11, RN-02, RN-26, RN-31, RN-32, D-09, D-16, ARCH §7.6, §16.4, §18.4; Q-02, Q-05, Q-09, Q-11, Q-12
   * Aceptación:
      * Un alta válida crea, en una transacción, las seis filas de ARCH §18.4: el negocio con su plan, la configuración con los valores de D-09, la "Sede principal", el "Consultorio" con capacidad 1 en esa sede, la política v1 y el miembro con `clerk_user_id` en `NULL`.
      * "Pagado hasta 2026-10-09" con estado `activa` se guarda como `pagado_hasta = 2026-10-10T05:00:00Z` (ARCH §7.6).

* [x] T1.46: Invitación de Clerk tras el alta
   * Objetivo: Enviar la invitación de Clerk al correo del dueño **después** del `COMMIT` del alta, con `redirectUrl` hacia `/registro`.
   * Archivos: `src/servidor/auth/invitaciones.ts`, `src/servidor/casos-uso/alta-negocio.ts`, `tests/integracion/casos-uso/alta-negocio.test.ts`
   * Depende de: T1.37, T1.45
   * Refs: ADM-02, F-11, ADR-06, ARCH §7.1, §7.4, §18.4; Q-08
   * Aceptación (con `clerkClient` simulado):
      * Después de un alta correcta, `invitations.createInvitation` se llama una sola vez, con el correo del dueño y una `redirectUrl` que termina en `/registro`.
      * Si el alta falla (por ejemplo, con un slug repetido), no se llama.

* [x] T1.47: Caso de uso `listarNegocios`
   * Objetivo: Implementar el caso de uso de ADM-01: slug, nombre, código del plan (con `listarPlanes`), estado de suscripción, vencimiento como fecha local inclusiva y si está en gracia (con `estadoEfectivo`).
   * Archivos: `src/servidor/casos-uso/listar-negocios.ts`, `src/servidor/db/repositorios/negocios.ts`, `tests/integracion/casos-uso/listar-negocios.test.ts`
   * Depende de: T1.27, T1.45
   * Refs: ADM-01, RN-25, RN-31, ARCH §6, §7.6
   * Aceptación:
      * Un negocio dado de alta en `activa` con "pagado hasta 2026-10-09" aparece con vencimiento `2026-10-09`.
      * Un negocio con el vencimiento pasado hace un día aparece en gracia, con su fecha de suspensión; uno con más de 3 días aparece suspendido.

* [x] T1.48: `/admin`: layout y lista de negocios
   * Objetivo: Crear el layout de `(admin)` con `<ClerkProvider localization={esES}>` y `requireSuperadmin`, y la página `/admin` con la tabla de ADM-01 y el enlace "Nuevo negocio".
   * Archivos: `src/app/(admin)/layout.tsx`, `src/app/(admin)/admin/page.tsx`
   * Depende de: T1.38, T1.42, T1.47
   * Refs: ADM-01, ADR-07, ARCH §5, §7.2, §7.5
   * Aceptación:
      * El administrador ve en `/admin` la lista de negocios.
      * Si se quita su ID de `SUPERADMIN_CLERK_USER_IDS`, el mismo usuario recibe 404 en `/admin`.

* [x] T1.49: `/admin`: formulario de alta
   * Objetivo: Crear el formulario de alta (ADM-02, F-11) y su Server Action, que llama a `requireSuperadmin` y a `altaNegocio`, muestra el mensaje de cada código de error y vuelve a `/admin` si el alta sale bien.
   * Archivos: `src/app/(admin)/admin/negocios/nuevo/page.tsx`, `src/app/(admin)/admin/negocios/nuevo/acciones.ts`
   * Depende de: T1.46, T1.48
   * Refs: ADM-02, F-11, RN-02, RN-31, ARCH §7.6, §18.4; Q-02, Q-12
   * Aceptación:
      * El formulario pide slug, nombre, plan (opciones de `listarPlanes`), estado (`prueba` o `activa`), vencimiento como fecha local inclusiva, correo del dueño, y dirección y teléfono de la sede principal.
      * Un alta en local con un correo propio aparece en `/admin`, y el Dashboard de Clerk muestra la invitación pendiente.
      * El slug `admin` muestra "slug no disponible" y no crea nada.

* [x] T1.50: Panel: layout y primer ingreso del dueño
   * Objetivo: Crear el layout de `(panel)` con `<ClerkProvider localization={esES}>`, `requireMiembro` y un encabezado con el nombre del negocio (caso de uso `resumenNegocio`) y `<UserButton/>`, más una página `/panel` provisional. Configurar la redirección de Clerk tras ingresar o registrarse (Q-13).
   * Archivos: `src/app/(panel)/layout.tsx`, `src/app/(panel)/panel/page.tsx`, `src/servidor/casos-uso/resumen-negocio.ts`, `.env.example`
   * Depende de: T1.40, T1.49
   * Refs: PAN-01, F-05, ADR-05, ARCH §7.2, §7.4, §7.5; Q-13
   * Aceptación (manual, en local):
      * Al aceptar la invitación de T1.49, el dueño define su contraseña en `/registro`, llega a `/panel` y ve el nombre de su negocio. En la base, su miembro queda con `clerk_user_id` y `vinculado_en` (F-05, pasos 1 y 2; ARCH §7.4).
      * Desde `<UserButton/>`, el dueño cambia su contraseña y cierra sesión. Después, `/panel` redirige a `/login` (PAN-01).

* [x] T1.51: Página "sin acceso"
   * Objetivo: Crear `/sin-acceso`, a donde `requireMiembro` envía a un usuario válido sin negocio, con un mensaje y un botón para cerrar sesión.
   * Archivos: `src/app/(auth)/sin-acceso/page.tsx`
   * Depende de: T1.38, T1.50
   * Refs: ARCH §5 (slug reservado `sin-acceso`), §7.5; Q-01
   * Aceptación:
      * El administrador, que no tiene fila en `miembro_negocio`, termina en `/sin-acceso` al abrir `/panel`.
      * "Cerrar sesión" termina la sesión, y `/panel` vuelve a redirigir a `/login`.

* [x] T1.52: Pruebas del alta: slug
   * Objetivo: Probar las reglas del slug a través del caso de uso del alta.
   * Archivos: `tests/integracion/casos-uso/alta-negocio-slug.test.ts`
   * Depende de: T1.46
   * Refs: RN-02, ARCH §5, §18.4
   * Aceptación (el alta falla y no crea ninguna fila; RN-02):
      * con un slug repetido;
      * con un slug de `RESERVADOS`;
      * con un formato inválido (caracteres fuera de `a-z`, `0-9` y guiones, o fuera de 3 a 40 caracteres).

* [x] T1.53: Pruebas del alta: efectos
   * Objetivo: Probar lo que el alta deja creado según las reglas de sedes, planes y auditoría.
   * Archivos: `tests/integracion/casos-uso/alta-negocio-efectos.test.ts`
   * Depende de: T1.52
   * Refs: RN-26, RN-27, RN-30, RN-32, ARCH §20 (Sedes)
   * Aceptación:
      * El alta crea la "Sede principal" con el recurso "Consultorio" (RN-32; ARCH §20, Sedes).
      * No se puede dar de alta un negocio sin plan. Con el plan `ilimitado`, el negocio queda sin filas en `negocio_funcionalidad` ni `negocio_limite`, y la función de acceso responde "habilitada" e "ilimitado" (RN-26, RN-27).
      * El alta queda en `auditoria_admin` con el `clerk_user_id` del administrador como autor (RN-30).

### 1.G Despliegue base

* [x] T1.54: Ruta del cron y entrada `scheduled`
   * Objetivo: Crear la ruta interna del cron, que exige `Authorization: Bearer CRON_SECRET` y por ahora responde 204 sin hacer nada (sus tareas llegan en otras fases; Q-04), y conectar el Cron Trigger de cada 5 minutos con el manejador `scheduled` de `worker.ts` (ARCH §14.5).
   * Archivos: `src/app/api/interno/cron/route.ts`, `worker.ts`, `wrangler.jsonc` (`triggers.crons`), `.dev.vars` (no versionado)
   * Depende de: T1.04
   * Refs: RN-21, RN-31, ARCH §5, §14.4, §14.5, §21.2
   * Aceptación:
      * Con `npm run preview`, `POST /api/interno/cron` sin el encabezado o con otro secreto responde 401, y con `Bearer CRON_SECRET` responde 204.
      * Con `wrangler dev --test-scheduled`, `GET /__scheduled` hace que el Worker invoque la ruta, y el registro muestra la respuesta 204.

* [ ] T1.55: [manual] Secretos del Worker desplegado
   * Objetivo: Cargar en el Worker los secretos de esta fase y preparar las variables de build del despliegue.
   * Archivos: `.env.production.local` (no versionado)
   * Depende de: T1.06, T1.07, T1.36
   * Refs: RNF-04, ARCH §7.7, §19.2, §21.3; Q-06, Q-07
   * Aceptación:
      * `npx wrangler secret list` muestra `DATABASE_URL` (rama `production`, con *pooler*), `CLERK_SECRET_KEY` y `CRON_SECRET`.
      * `.env.production.local` tiene `DATABASE_URL_DIRECTA` de `production` y las variables `NEXT_PUBLIC_CLERK_*` de la instancia de Clerk que use el despliegue (Q-06).

* [ ] T1.56: Despliegue en un comando, con migraciones
   * Objetivo: Hacer que `npm run deploy` aplique las migraciones pendientes en `production` antes de compilar y desplegar (ARCH §21.4), y declarar `APP_URL` y `SUPERADMIN_CLERK_USER_IDS` en los `vars` de `wrangler.jsonc`.
   * Archivos: `package.json` (scripts `deploy`, `db:migrate:prod` y `db:semilla:prod`), `wrangler.jsonc`
   * Depende de: T1.30, T1.54, T1.55
   * Refs: RNF-09, ARCH §8, §21.3, §21.4; Q-07
   * Aceptación:
      * `npm run deploy` aplica todas las migraciones en `production` y despliega. Una segunda ejecución no encuentra migraciones pendientes.
      * `npm run db:semilla:prod` deja en `production` el plan `ilimitado`, con 6 funcionalidades y 6 límites.

* [ ] T1.57: [manual] Verificación de punta a punta
   * Objetivo: Comprobar en `*.workers.dev`, con Clerk y Neon reales, el recorrido completo de la fase. Es la mitigación del riesgo principal de ARCH §23 y el criterio de salida de la fase.
   * Archivos: —
   * Depende de: T1.51, T1.53, T1.56
   * Refs: ADM-01, ADM-02, F-05, F-11, PAN-01, ARCH §23
   * Aceptación:
      * El administrador entra, da de alta un negocio de prueba con un correo propio y lo ve en `/admin`. El dueño recibe la invitación, define su contraseña y ve su negocio en `/panel`.
      * Sin sesión, `/panel` redirige a `/login`; con la sesión del dueño, `/admin` responde 404.
      * Workers Logs muestra `POST /api/interno/cron` con respuesta 204 cada 5 minutos.

---

## Preguntas

Puntos que el PRD y ARCHITECTURE no definen. Mientras no haya respuesta, las tareas usan el supuesto indicado.

| ID | Pregunta | Supuesto mientras no se responda | Afecta a |
|---|---|---|---|
| Q-01 | ARCH §4 no ubica estos archivos: `src/dominio/resultado.ts`, `src/dominio/slug.ts`, `src/servidor/accion.ts`, `src/servidor/db/repositorios/*.ts`, `src/servidor/politica-datos/plantilla.ts`, `scripts/semilla.ts`, `src/app/(auth)/sin-acceso/page.tsx`, ni la división de `tests/` en `unit/` e `integracion/`. ¿Se aceptan esas rutas? | Las rutas indicadas. | T1.25, T1.28, T1.30, T1.39, T1.41, T1.44, T1.51 |
| Q-02 | ARCH §3 dice que los formularios usan los mismos esquemas Zod que el servidor, pero un módulo con `import 'server-only'` no se puede importar desde un componente de cliente. ¿Dónde viven los esquemas compartidos? | En la Fase 1, el formulario del admin valida solo en el servidor y el esquema vive en el caso de uso. | T1.45, T1.49 |
| Q-03 | El criterio de RN-26 dice "los 5 límites en `NULL`", pero desde la v0.5 el catálogo tiene 6 (se sumó `max_locations`). | Son 6, como en PRD §8.8 y ARCH §18.2. Conviene corregir RN-26. | T1.33 |
| Q-04 | PRD §12 no asigna a ninguna fase: la función de acceso a planes (RN-25 a RN-30); la gestión de la suscripción (ADM-03, PAN-19, `aplicarVencimientos`, C-07 y C-08); ADM-05; ni `aplicarAsistenciaPorDefecto` (D-21). ¿En qué fase entra cada uno? | Los planes y el estado efectivo de la suscripción entran en la Fase 1. Se propone: ADM-03 y PAN-19 en la Fase 2; `aplicarVencimientos`, C-07, C-08, `aplicarAsistenciaPorDefecto` y ADM-05 en la Fase 6, junto al cron y los correos. Todo debe estar antes del día 18 (primer cliente en producción). | Alcance, §1.D, T1.54 |
| Q-05 | La Fase 2 empieza con "Sede principal", pero RN-32 y F-11 la crean en el alta. | La creación va en la Fase 1, dentro del alta. La Fase 2 cubre su configuración (PAN-11, PAN-13 y PAN-14). | Alcance, T1.45 |
| Q-06 | La instancia de producción de Clerk necesita un dominio propio, que llega en la Fase 9 (días 17 y 18). ¿Con qué instancia funciona el despliegue base? | `*.workers.dev` usa la instancia de desarrollo hasta la Fase 9. | T1.55, T1.57 |
| Q-07 | ARCH §21.3 no lista las credenciales de la API de Neon para las ramas efímeras de las pruebas, ni dónde vive la cadena directa de `production` para migrar al desplegar. | `NEON_API_KEY` y `NEON_PROJECT_ID` en `.env.local`, y `DATABASE_URL_DIRECTA` de `production` en `.env.production.local`. | T1.07, T1.08, T1.11, T1.55, T1.56 |
| Q-08 | ¿Qué pasa si la invitación de Clerk falla después del `COMMIT` del alta? El negocio queda creado sin invitación, y ADM no define cómo reenviarla. | El alta queda hecha y el formulario muestra el error de la invitación. Falta decidir cómo reenviarla (¿un botón en `/admin`?). | T1.46 |
| Q-09 | ARCH §18.4 da a `altaNegocio` los errores `SLUG_NO_DISPONIBLE` y `DATOS_INVALIDOS`, sin decir cuál corresponde a cada caso. Tampoco define qué pasa si el correo del dueño ya pertenece a otro negocio (`miembro_negocio.correo` es único en todo el sistema, ARCH §7.8). | Slug reservado o repetido: `SLUG_NO_DISPONIBLE`. Formato de slug inválido, plan inexistente o correo del dueño ya usado: `DATOS_INVALIDOS`. | T1.45, T1.49 |
| Q-10 | ¿Quién redacta la plantilla de la política de datos (D-05), que debe revisar un abogado (ARCH §19.3), y para cuándo? ¿Qué datos del negocio incluye (nombre, NIT, dirección, correo de contacto)? | Texto provisional que solo incluye el nombre del negocio y avisa que falta la revisión legal. Debe estar aprobado antes de la Fase 4 (página pública, RN-17). | T1.44 |
| Q-11 | `negocio.correo_contacto`, que es el `reply_to` de los correos de citas (ARCH §14.3), no aparece en ADM-02 ni en PAN-11. ¿Se pide en el alta, se usa el del dueño o se configura en el panel? | El alta lo deja en `NULL`. Se decide antes de la Fase 6. | T1.45 |
| Q-12 | F-11 dice que el alta recibe la dirección y el teléfono de la sede principal, pero ADM-02 no los lista. | Campos opcionales en el formulario de alta. | T1.45, T1.49 |
| Q-13 | ARCH §7.7 no fija adónde va el usuario después de ingresar o registrarse (`NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` y `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`). | Ambas a `/panel`. El administrador, que no es miembro de ningún negocio, termina en `/sin-acceso` y entra a `/admin` por la URL. | T1.50 |
| Q-14 | RN-25 menciona una "búsqueda en la integración continua", pero ARCH no define un sistema de CI ni desde dónde se despliega. | Verificación local con `npm run verificar` y despliegue desde la máquina del desarrollador. ¿Se quiere CI (por ejemplo, GitHub Actions), y desde qué fase? | T1.32, T1.56 |
| Q-15 | Ningún documento define qué muestra la raíz `tuapp.com/` (¿página del SaaS, redirección?). | Una página provisional mínima. | T1.01 |
| Q-16 | ARCH §20 (Sedes) incluye "`max_locations` limita las sedes activas", pero `guardarSede` es de la interfaz posterior (D-16). ¿Se prueba en el MVP? | Se pospone hasta que exista `guardarSede`. La Fase 1 prueba solo la parte de las sedes que depende del esquema y del alta. | T1.23 |
