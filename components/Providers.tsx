"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "react-hot-toast";
import NotificationWatcher from "@/components/NotificationWatcher";

interface Props {
  children: ReactNode;
}

export default function Providers({ children }: Props) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <NotificationWatcher />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#18181b",
              color: "#f4f4f5",
              border: "1px solid #27272a",
              borderRadius: "12px",
              fontSize: "14px",
            },
            success: {
              iconTheme: { primary: "#10b981", secondary: "#18181b" },
            },
            error: {
              iconTheme: { primary: "#ef4444", secondary: "#18181b" },
            },
          }}
        />
      </ThemeProvider>
    </SessionProvider>
  );
}
