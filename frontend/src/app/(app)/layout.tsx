"use client";

import { AppShell } from "@/components/layout/app-shell";
import { BottomNav } from "@/components/layout/bottom-nav";
import { useAuthGuard } from "@/app/providers";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthGuard();

  if (!isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Đang chuyển trang...</div>
      </div>
    );
  }

  return (
    <AppShell>
      {children}
      <BottomNav />
    </AppShell>
  );
}
