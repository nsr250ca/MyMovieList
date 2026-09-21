import { AppShell } from "@/components/app-shell";
import { AddWatchForm } from "./watch-form";

export default function NewWatchPage() {
  return (
    <AppShell>
      <div className="page-title">
        <div>
          <p className="eyebrow">New entry</p>
          <h1>Add watched movie</h1>
          <p>Add future watches without touching the old workbook.</p>
        </div>
      </div>
      <AddWatchForm />
    </AppShell>
  );
}
