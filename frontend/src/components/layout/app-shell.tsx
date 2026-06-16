"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSse } from "@/hooks/use-sse";
import { toast } from "sonner";

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AppShell({ children, title }: AppShellProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  // Subscribe SSE for global notifications
  useSse("/sse/stream", (msg) => {
    if (msg.type === "stock.changed") {
      toast.success("Cập nhật tồn kho", { duration: 2000 });
    } else if (msg.type === "shipment.handed_over") {
      toast.info("Đơn hàng đã bàn giao", { duration: 2000 });
    } else if (msg.type === "order.confirmed") {
      toast.info("Có đơn hàng mới cần xuất kho", { duration: 3000 });
    }
  });

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-primary-700 text-white shadow-sm sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">Hina WMS</h1>
            {title && (
              <>
                <span className="text-primary-300">/</span>
                <span className="text-sm">{title}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            {user?.employeeCode && (
              <div className="text-right hidden sm:block">
                <div className="text-xs text-primary-200">NV: {user.employeeCode}</div>
                {user.email && <div className="text-xs text-primary-300">{user.email}</div>}
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-primary-600">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-4">{children}</div>
      </main>
    </div>
  );
}
