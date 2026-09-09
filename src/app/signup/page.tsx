import { SignupForm } from "@/components/auth/signup-form";

export const metadata = {
  title: "Creează-ți afacerea — Programări online",
};

export default function SignupPage() {
  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Creează-ți afacerea</h1>
      <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
        Configurează-ți pagina de programări în câteva minute.
      </p>
      <SignupForm />
    </div>
  );
}
