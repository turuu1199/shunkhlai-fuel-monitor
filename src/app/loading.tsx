export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-4">
      <div className="bg-muted h-10 animate-pulse rounded-md" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="bg-muted h-20 animate-pulse rounded-xl" />)}
      </div>
      <div className="bg-muted h-[55vh] animate-pulse rounded-xl" />
    </div>
  );
}
