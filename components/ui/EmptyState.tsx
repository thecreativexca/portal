export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
        {title}
      </p>
      {hint && (
        <p className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">{hint}</p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
