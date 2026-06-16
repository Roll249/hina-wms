"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Package, KeyRound } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [mode, setMode] = useState<"pin" | "password">("pin");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeCode || !pin) {
      toast.error("Vui lòng nhập mã NV và PIN");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/pin-login", { employeeCode, pin });
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success("Đăng nhập thành công");
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success("Đăng nhập thành công");
      // Hard navigate để chắc chắn re-render lại toàn bộ layout
      // vì Next.js router.push không re-mount providers, dẫn đến
      // useAuthGuard có thể vẫn thấy isAuthenticated=false trong 1 frame.
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-700 to-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 text-white">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 backdrop-blur mb-3">
            <Package className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">Hina WMS</h1>
          <p className="text-sm text-primary-100">Hệ thống quản lý kho</p>
        </div>

        <Card padding="lg" className="shadow-xl">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-6">
            <button
              onClick={() => setMode("pin")}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === "pin" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600"
              }`}
            >
              PIN nhanh
            </button>
            <button
              onClick={() => setMode("password")}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === "password" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600"
              }`}
            >
              Email + MK
            </button>
          </div>

          {mode === "pin" ? (
            <form onSubmit={handlePinLogin} className="space-y-4">
              <Input
                label="Mã nhân viên"
                placeholder="VD: NV001"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                autoComplete="username"
                required
              />
              <Input
                label="PIN (4-6 số)"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                autoComplete="current-password"
                required
              />
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                <KeyRound className="h-4 w-4" />
                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
              <p className="text-xs text-center text-gray-500">
                Dành cho thiết bị kho chia sẻ. Nhập nhanh bằng PIN.
              </p>
            </form>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
              <Input
                label="Mật khẩu"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
              <p className="text-xs text-center text-gray-500">
                Dành cho admin/manager.
              </p>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-primary-200 mt-4">
          © 2026 Hina WMS · Kết nối với hina-e-comm
        </p>
      </div>
    </div>
  );
}
