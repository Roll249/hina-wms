"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PackageOpen, PackageMinus, BarChart3, History } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Tổng quan", icon: Home },
  { href: "/receive",   label: "Nhập kho", icon: PackageOpen },
  { href: "/ship",      label: "Xuất kho", icon: PackageMinus },
  { href: "/stock",     label: "Tồn kho",  icon: BarChart3 },
  { href: "/history",   label: "Lịch sử",  icon: History },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white shadow-lg">
      <div className="mx-auto max-w-7xl px-2">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 px-3 min-w-[64px] transition-colors",
                  isActive ? "text-primary-600" : "text-gray-500 hover:text-gray-700",
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "fill-primary-100")} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
