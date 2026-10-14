import "server-only";

// Plantilla de la política de tratamiento de datos (D-05; ARCH §19.3). El alta crea
// con ella la versión 1 de cada negocio, que el dueño podrá editar (PAN-17). Es
// Markdown y se muestra sin HTML crudo (ARCH §19.2).
//
// PROVISIONAL (Q-10): falta la revisión de un abogado, que debe aprobarla antes de la
// Fase 4 (página pública, RN-17). Por ahora solo usa el nombre del negocio.

/** Aviso visible al inicio de la política mientras no tenga revisión legal (Q-10). */
export const AVISO_REVISION_PENDIENTE =
  "**Borrador pendiente de revisión legal.** Este texto es provisional y todavía no lo ha revisado un abogado.";

/** Escapa los caracteres con significado en Markdown, para que el nombre se lea tal cual. */
function textoPlano(texto: string): string {
  return texto.replace(/[\\`*_{}[\]()<>#+\-.!|~]/g, "\\$&");
}

/** Contenido de la versión 1 de la política de un negocio. */
export function politicaInicial(nombreNegocio: string): string {
  const negocio = textoPlano(nombreNegocio.trim());
  return `> ${AVISO_REVISION_PENDIENTE}

# Política de tratamiento de datos personales de ${negocio}

## Responsable del tratamiento

${negocio} es el **responsable del tratamiento** de los datos personales que entregas al reservar una cita, según la Ley 1581 de 2012 y sus decretos reglamentarios. La plataforma de reservas que usa ${negocio} actúa como **encargada del tratamiento**: trata los datos por cuenta de ${negocio} y solo para los fines de esta política.

## Datos que se recogen

Al reservar se piden tu nombre, apellido, teléfono y correo electrónico, junto con el servicio, la sede, la fecha y la hora de la cita. Se guarda también la versión de esta política que aceptaste y la fecha y hora de la aceptación.

## Finalidad

Tus datos se usan para:

- agendar, confirmar, recordar, reprogramar y cancelar tus citas;
- identificarte como cliente y contactarte por teléfono o correo sobre tus citas;
- llevar el historial de citas de ${negocio}.

No se usan para publicidad ni se venden a terceros.

## Datos sensibles: salud

El servicio que reservas puede revelar información sobre tu salud, que la ley considera un **dato sensible**. No estás obligado a autorizar el tratamiento de datos sensibles. Si los entregas, ${negocio} los tratará solo para atender tu cita, con medidas de seguridad reforzadas, y no los usará para otros fines. La plataforma de reservas no guarda historias clínicas.

## Derechos del titular

Como titular de los datos tienes derecho a:

- conocer, actualizar y rectificar tus datos;
- solicitar prueba de la autorización que otorgaste;
- ser informado sobre el uso que se ha dado a tus datos;
- revocar la autorización y solicitar la supresión de tus datos, cuando no exista un deber legal o contractual de conservarlos;
- acceder gratuitamente a tus datos;
- presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley.

## Canal de atención

Para ejercer tus derechos, o para cualquier consulta o reclamo sobre tus datos, comunícate directamente con ${negocio} por los medios de contacto que publica en su página de reservas. ${negocio} responderá las consultas en un máximo de 10 días hábiles y los reclamos en un máximo de 15 días hábiles, según la Ley 1581 de 2012.

## Proveedores fuera de Colombia

Para funcionar, la plataforma de reservas usa proveedores de tecnología que procesan y almacenan datos fuera de Colombia, principalmente en los Estados Unidos:

- **Cloudflare**: alojamiento de la aplicación;
- **Neon**: base de datos;
- **Resend**: envío de correos;
- **Clerk**: inicio de sesión del personal del negocio (no trata los datos de los clientes).

Estos proveedores tratan los datos solo para prestar su servicio y con medidas de seguridad acordes con su función.

## Vigencia

Esta política rige desde su publicación. Si cambia, cada reserva guarda la versión que aceptaste en ese momento.
`;
}
