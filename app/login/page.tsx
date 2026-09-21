import { Suspense } from "react";
import { SetupWarning } from "@/components/setup-warning";
import { getPublicEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv();

  if (!supabaseUrl || !supabasePublishableKey) {
    return <SetupWarning />;
  }

  return (
    <div className="auth-shell">
      <section className="card auth-card">
        <p className="eyebrow">Private archive</p>
        <h1>Sign in to your movie journal</h1>
        <p className="muted">
          Your watched entries, title matches, and notes stay scoped to your Supabase user.
        </p>
        <Suspense fallback={<p className="muted">Loading sign-in form...</p>}>
          <LoginForm />
        </Suspense>
      </section>
    </div>
  );
}
