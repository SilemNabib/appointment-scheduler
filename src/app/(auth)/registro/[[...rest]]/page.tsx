import { SignUp } from "@clerk/nextjs";

// Solo funciona con invitación: el modo de registro de la instancia es Restringido (ADR-06).
export default function Registro() {
  return <SignUp />;
}
