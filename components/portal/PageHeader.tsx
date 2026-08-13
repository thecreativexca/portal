"use client";

export default function PageHeader({
  title,
  description,
  badge,
  actions,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="portal-page-header">
      <div className="portal-page-header-main">
        <h1>{title}</h1>
        {(description || badge) && (
          <p className="portal-page-header-desc">
            {description}
            {badge}
          </p>
        )}
      </div>
      {actions && <div className="portal-page-header-actions">{actions}</div>}
    </div>
  );
}
