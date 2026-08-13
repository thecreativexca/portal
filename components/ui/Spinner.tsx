export default function Spinner({
  className = "h-8 w-8 border-4",
}: {
  className?: string;
}) {
  return (
    <div className="flex items-center justify-center py-10">
      <div
        className={`animate-spin rounded-full border-indigo-600 border-t-transparent dark:border-indigo-400 ${className}`}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
