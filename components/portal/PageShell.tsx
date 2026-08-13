"use client";

export default function PageShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`portal-page animate-fade-in ${className}`}>
      {children}
    </div>
  );
}
