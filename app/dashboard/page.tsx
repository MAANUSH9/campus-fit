import WeeklyInsightsPanel from "./WeeklyInsightsPanel";

export default function DashboardPage() {
  return (
    <main className="dashboard-shell">
      <section className="dashboard-header">
        <p className="eyebrow">Campus Fit / This week</p>
        <h1>Your weekly signals</h1>
        <p className="intro">Small adjustments, grounded in the way you actually train.</p>
      </section>
      <WeeklyInsightsPanel />
    </main>
  );
}