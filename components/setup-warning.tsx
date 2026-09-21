import Link from "next/link";

export function SetupWarning({ message }: { message?: string }) {
  return (
    <div className="auth-shell">
      <section className="card auth-card warning">
        <p className="eyebrow">Setup needed</p>
        <h1>Connect Supabase before using the app</h1>
        <p className="muted">
          {message ??
            "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart the dev server."}
        </p>
        <p className="muted">
          Run the migration in <code>supabase/migrations</code> before importing the workbook.
        </p>
        <Link className="ghost-button" href="/">
          Back home
        </Link>
      </section>
    </div>
  );
}
