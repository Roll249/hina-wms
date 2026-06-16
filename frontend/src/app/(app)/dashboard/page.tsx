"use client";

import { useQuery } from "@tanstack/react-query";
import { PackageOpen, PackageMinus, AlertTriangle, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import api from "@/lib/api";
import { formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  // Lấy cảnh báo tồn thấp
  const { data: lowStock = [] } = useQuery({
    queryKey: ["low-stock"],
    queryFn: async () => {
      const { data } = await api.get("/stock/alerts/low-stock");
      return data;
    },
  });

  // Đếm shipment cần xử lý
  const { data: pendingShipments } = useQuery({
    queryKey: ["shipments", "PENDING"],
    queryFn: async () => {
      const { data } = await api.get("/shipments?status=PENDING&pageSize=1");
      return data;
    },
  });

  // Đếm phiếu nhập hôm nay
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: todayReceipts } = useQuery({
    queryKey: ["receipts", "today"],
    queryFn: async () => {
      const { data } = await api.get(
        `/receipts?fromDate=${today.toISOString()}&pageSize=1`,
      );
      return data;
    },
  });

  const tiles = [
    {
      href: "/receive",
      title: "Nhập kho",
      desc: "Quét mã / nhập tay / upload file",
      icon: PackageOpen,
      color: "bg-green-500",
      badge: todayReceipts?.total ? `${todayReceipts.total} phiếu hôm nay` : null,
    },
    {
      href: "/ship",
      title: "Xuất kho",
      desc: "Pick theo đơn hàng",
      icon: PackageMinus,
      color: "bg-blue-500",
      badge: pendingShipments?.total ? `${pendingShipments.total} đơn chờ` : null,
    },
    {
      href: "/stock",
      title: "Tồn kho",
      desc: "Tra cứu tồn thời gian thực",
      icon: TrendingUp,
      color: "bg-purple-500",
      badge: null,
    },
    {
      href: "/history",
      title: "Lịch sử",
      desc: "Nhập/xuất/điều chỉnh",
      icon: AlertTriangle,
      color: "bg-gray-700",
      badge: null,
    },
  ];

  return (
    <div className="space-y-4 pb-20">
      <h1 className="text-2xl font-bold text-gray-900">Tổng quan kho</h1>

      {/* 4 nút chính - mobile-first grid */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link key={tile.href} href={tile.href}>
              <Card padding="md" className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className={`w-12 h-12 ${tile.color} rounded-xl flex items-center justify-center mb-2`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="font-semibold text-gray-900">{tile.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{tile.desc}</p>
                {tile.badge && (
                  <Badge variant="warning" className="mt-2">{tile.badge}</Badge>
                )}
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Cảnh báo tồn thấp */}
      {lowStock.length > 0 && (
        <Card padding="md" className="border-l-4 border-yellow-400">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <h2 className="font-semibold text-gray-900">
              Cảnh báo tồn thấp ({lowStock.length})
            </h2>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {lowStock.slice(0, 10).map((item: any) => (
              <div key={item.inventoryId} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                <span className="text-gray-700 truncate flex-1">{item.name}</span>
                <span className="text-gray-500 ml-2 font-mono text-xs">{item.productCode}</span>
                <span className={`ml-2 font-semibold ${item.available <= 0 ? "text-red-600" : "text-yellow-600"}`}>
                  {formatNumber(item.available)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
