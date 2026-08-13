import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <div className="app-content animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
}
