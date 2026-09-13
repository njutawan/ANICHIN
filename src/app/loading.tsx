export default function Loading() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header skeleton */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="container-fluid flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg shimmer" />
            <div className="space-y-1">
              <div className="h-4 w-24 rounded shimmer" />
              <div className="h-2 w-16 rounded shimmer" />
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-20 rounded shimmer" />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full shimmer" />
            <div className="h-10 w-10 rounded-full shimmer" />
            <div className="h-8 w-48 rounded-full shimmer hidden md:block" />
          </div>
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="relative w-full" style={{ height: 'clamp(380px, 60vh, 600px)' }}>
        <div className="absolute inset-0 shimmer" />
        <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute bottom-0 inset-x-0 p-8">
          <div className="container-fluid space-y-3">
            <div className="h-8 w-64 rounded shimmer" />
            <div className="h-4 w-32 rounded shimmer" />
            <div className="flex gap-2">
              <div className="h-6 w-16 rounded shimmer" />
              <div className="h-6 w-20 rounded shimmer" />
            </div>
            <div className="h-3 w-full max-w-xl rounded shimmer" />
            <div className="h-3 w-3/4 max-w-xl rounded shimmer" />
            <div className="flex gap-2 mt-2">
              <div className="h-10 w-36 rounded shimmer" />
              <div className="h-10 w-28 rounded shimmer" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats bar skeleton */}
      <div className="container-fluid py-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg shimmer" />
        ))}
      </div>

      {/* Section skeletons */}
      <div className="container-fluid space-y-8 py-8">
        {Array.from({ length: 3 }).map((_, sectionIdx) => (
          <div key={sectionIdx}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-1.5 rounded-full shimmer" />
              <div className="space-y-1">
                <div className="h-5 w-40 rounded shimmer" />
                <div className="h-3 w-28 rounded shimmer" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="aspect-[2/3] rounded-lg shimmer" />
                  <div className="h-3 w-3/4 rounded shimmer" />
                  <div className="h-2.5 w-1/2 rounded shimmer" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer skeleton */}
      <div className="mt-auto border-t border-border">
        <div className="container-fluid py-6 space-y-4">
          <div className="h-6 w-48 rounded shimmer" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-20 rounded shimmer" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-3 w-full rounded shimmer" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
