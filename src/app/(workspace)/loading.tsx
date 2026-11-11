export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace" className="loading-state">
      <div className="skeleton heading-skeleton" />
      <div className="metric-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton metric-skeleton" />
        ))}
      </div>
      <div className="skeleton panel-skeleton" />
      <span className="sr-only">Loading your workspace…</span>
    </div>
  );
}
