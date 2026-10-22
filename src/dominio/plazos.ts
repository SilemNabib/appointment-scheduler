// Plazos de las acciones sobre una cita (RN-13, RN-16, RN-34; ARCH §4 y §18.3). Son
// comparaciones de instantes con el `ahora` inyectado: no dependen de ninguna zona
// horaria (RN-03). Esta fase trae la regla de la asistencia; los plazos del cliente
// (RN-13 y RN-34) llegan con la gestión por link en la Fase 6.

/**
 * RN-16: el dueño marca la asistencia desde el instante del inicio (`ahora ≥ inicio`),
 * nunca antes. El borde está incluido (ARCH §20: "en el instante exacto del borde").
 */
export function puedeMarcarAsistencia(inicio: Date, ahora: Date): boolean {
  return ahora.getTime() >= inicio.getTime();
}
