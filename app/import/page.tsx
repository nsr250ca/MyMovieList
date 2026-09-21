import { AppShell } from "@/components/app-shell";
import { ImportClient } from "./import-client";

export default function ImportPage() {
  return (
    <AppShell>
      <div className="page-title">
        <div>
          <p className="eyebrow">Workbook importer</p>
          <h1>Review Excel entries</h1>
          <p>Parse the year sheets, inspect warnings, then commit approved entries to Supabase.</p>
        </div>
      </div>
      <ImportClient />
    </AppShell>
  );
}
