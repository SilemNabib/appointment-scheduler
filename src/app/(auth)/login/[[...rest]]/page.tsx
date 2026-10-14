import { SignIn } from "@clerk/nextjs";

// La ruta comodín deja que <SignIn/> maneje sus pasos internos (verificación, recuperación…).
export default function Login() {
  return <SignIn />;
}
