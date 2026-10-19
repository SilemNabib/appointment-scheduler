# Agenda de citas (SaaS)

## Cómo leer TASKS-##

### Formato de cada tarea

```markdown
* [ ] T1.01: Nombre corto
   * Objetivo: qué deja hecho, en una o dos frases.
   * Archivos: rutas según ARCH §4.
   * Depende de: tareas que deben estar terminadas antes (o "—").
   * Refs: reglas (RN), decisiones (D), funcionalidades del PRD y secciones de ARCH.
   * Aceptación: 2 o 3 criterios verificables con un comando o una comprobación concreta.
```

| Marca | Significado |
|---|---|
| `[ ]` / `[x]` | Tarea pendiente / terminada |
| `T<fase>.<nn>` | ID de la tarea: número de fase y orden dentro de ella. Las tareas se hacen en orden. |
| `[manual]` | Paso que no es código (consolas de Neon, Clerk, Cloudflare o Resend). No genera commit: se cierra cuando se cumple su aceptación. |
| `Q-xx` | Pregunta abierta de este documento ([Preguntas](#preguntas)). La tarea usa el supuesto indicado allí. |
| `E1`, `E2` | Criterios comunes de las tareas de esquema ([§1.B](#1b-base-de-datos-esquema-y-migraciones)). |

### Definición de terminado (global)

Una tarea de código está terminada cuando:

1. Cumple todos sus criterios de aceptación.
2. Después de aplicarla, pasan sin errores:
   - `npm run typecheck` (`tsc --noEmit`);
   - `npm run lint`;
   - `npm test`: todas las pruebas existentes, unitarias y, desde T1.11, de integración contra una rama efímera de Neon.

   Los tres se ejecutan juntos con `npm run verificar` (T1.02). Antes de T1.02, basta con `npx tsc --noEmit` y `npm run build`.
3. Queda en un solo commit revisable cuyo mensaje empieza con su ID (por ejemplo, `T1.07: …`).

Las pruebas siguen la estructura de `src/`: `tests/unit/…` para las unitarias y `tests/integracion/…` para las de integración (Q-01). Toda función pura de `src/dominio/` lleva su prueba unitaria en la misma tarea. Las tareas de prueba que cierran cada módulo solo contienen casos de ARCH §20 y de los criterios de aceptación de las RN; cada caso cita su origen.

## Índice de fases

Cada bloque del plan de entrega (PRD §12) es una fase.

| Fase | Días | Entrega (PRD §12) | Estado |
|---|---|---|---|
| [1](TASKS-01.md#fase-1-proyecto-esquema-clerk-estructura-multi-negocio-y-despliegue-base) | 1–2 | Proyecto, esquema, Clerk, estructura multi-negocio y despliegue base | **Terminada**: [TASKS-01](TASKS-01.md) (T1.01–T1.57) |
| [2](TASKS-02.md#fase-2-sede-principal-servicios-por-sede-recursos-horario-semanal-bloqueos-y-configuración) | 3–4 | Sede principal, servicios por sede, recursos, horario semanal, bloqueos y configuración | **Desarrollada**: [TASKS-02](TASKS-02.md) (T2.01–T2.42) |
| [3](TASKS-03.md#fase-3-motor-de-disponibilidad-y-reserva-transaccional) | 5–7 | Motor de disponibilidad y reserva transaccional (con pruebas) | **Desarrollada**: [TASKS-03](TASKS-03.md) (T3.01–T3.33) |
| 4 | 8–9 | Página pública de reservas | Pendiente. Requiere el diseño de Claude Design en `docs/DESIGN.md` (Q-26 de TASKS-02). |
| 5 | 10–11 | Panel: calendario y citas manuales | Pendiente |
| 6 | 12–13 | Correos, recordatorios, links de gestión, invitaciones de calendario y enlace de suscripción del dueño | Pendiente. Incluye crear la cuenta de Resend `[manual]`; `aplicarVencimientos`, C-07, C-08, `aplicarAsistenciaPorDefecto` y ADM-05 (Q-04 de TASKS-01); el botón "Reenviar invitación" en `/admin` (Q-08 de TASKS-01); y el recálculo de los recordatorios pendientes (Q-23 de TASKS-02). |
| 7 | 14 | Clientes (RN-18) | Pendiente. La identidad (RN-18, RN-19) pasó a la Fase 3 (Q-27 de TASKS-03); quedan PAN-09, `editarCliente` y `suprimirCliente`. |
| 8 | 15–16 | Pruebas de casos límite y límite de frecuencia | Pendiente. Incluye la integración continua con GitHub Actions (Q-14 de TASKS-01). |
| 9 | 17–18 | Dominio, carga de datos y prueba con el cliente | Pendiente. Incluye la instancia de producción de Clerk (Q-06 de TASKS-01), la redacción definitiva y la revisión legal de la política de datos, y quién las hace (Q-10 de TASKS-01), qué muestra la raíz `/` (Q-15 de TASKS-01) y si la cuenta pasa a Workers Paid según el CPU medido (Q-36 de TASKS-03). |
| 10 | 19–20 | Colchón | Pendiente. Sin tareas planificadas: el PRD lo da por consumido y, ante un imprevisto, se aplica el recorte de PRD §4.3. |

El trabajo del MVP que PRD §12 no asignaba a ninguna fase quedó repartido en la columna "Estado" (Q-04 de TASKS-01).

---
