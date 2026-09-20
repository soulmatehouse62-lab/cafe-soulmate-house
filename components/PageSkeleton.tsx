// Route-level loading placeholder. Deliberately NOT used as a root app/loading.tsx:
// a root Suspense boundary stalls same-page search-param navigations (the live
// History filters) while a text input keeps focus.
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-3 w-24 rounded-full bg-cream-200" />
      <div className="h-9 w-56 rounded-xl bg-cream-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 rounded-3xl bg-cream-100" />
        ))}
      </div>
      <div className="h-48 rounded-3xl bg-cream-100" />
    </div>
  );
}
