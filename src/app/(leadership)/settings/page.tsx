import { DigestActions } from "@/components/DigestActions";
import { listObservations } from "@/server/repositories/observations";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const observations = await listObservations();
  const hasData = observations.length > 0;
  const demoCount = observations.filter((observation) => observation.source === "demo").length;
  const liveCount = observations.length - demoCount;

  return (
    <div className="command-page space-y-5">
      <header className="command-shell-header">
        <p className="command-label">Settings</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.01em] text-command-ink md:text-4xl">
          Admin controls
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-command-soft md:text-base">
          Demo data, refresh, and destructive corpus controls live here, not on leadership surfaces.
        </p>
      </header>

      <section className="command-panel">
        <p className="command-label">Corpus management</p>
        <h2 className="mt-2 text-lg font-semibold text-command-ink">{liveCount} live · {demoCount} demo records</h2>
        <div className="command-admin-controls mt-5 rounded-[8px] border border-command-border bg-white/[0.035] p-4">
          <DigestActions hasData={hasData} />
        </div>
      </section>
    </div>
  );
}
