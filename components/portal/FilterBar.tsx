"use client";

export default function FilterBar({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`portal-filter-bar ${className}`}>{children}</div>;
}
