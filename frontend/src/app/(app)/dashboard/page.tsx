"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PackageOpen,
  PackageMinus,
  AlertTriangle,
  TrendingUp,
  Plus,
  ShoppingCart,
  FileInput,
  Truck,
  Layers,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import api from "@/lib/api";
import { formatNumber } from "@/lib/utils";

type DashboardStats = {
  totalSkus: number;
  totalInventory: number;
  lowStockCount: number;
  pendingShipments: number;
  ordersToday: number;
  receiptsToday: number;
  shipmentsToday: number;
};

export default function DashboardPage() {
  // Lấy cảnh báo tồn thấp
  const { data: lowStock = [] } = useQuery({
    queryKey: ["low-stock"],
    queryFn: async () => {
      const { data } = await api.get("/stock/alerts/low-stock");
      return data;
    },
  });

  // Lấy stats tổng quan
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data } = await api.get("/orders/dashboard-stats");
      return data;
    },
    refetchInterval: 30_000,
  });

  const kpis = [
    {
      label: "Tổng SKU",
      value: stats?.totalSkus ?? 0,
      icon: Layers,
      color: "bg-blue-500",
      href: "/stock",
    },
    {
      label: "Tồn kho",
      value: stats?.totalInventory ?? 0,
      icon: TrendingUp,
      color: "bg-purple-500",
      href: "/stock",
    },
    {
      label: "Đơn offline hôm nay",
      value: stats?.ordersToday ?? 0,
      icon: ShoppingCart,
      color: "bg-amber-500",
      href: "/orders/create",
    },
    {
      label: "Phiếu xuất chờ",
      value: stats?.pendingShipments ?? 0,
      icon: PackageMinus,
      color: "bg-orange-500",
      href: "/ship",
    },
    {
      label: "Phiếu nhập hôm nay",
      value: stats?.receiptsToday ?? 0,
      icon: FileInput,
      color: "bg-green-500",
      href: "/receive",
    },
    {
      label: "Phiếu xuất hôm nay",
      value: stats?.shipmentsToday ?? 0,
      icon: Truck,
      color: "bg-indigo-500",
      href: "/ship",
    },
  ];

  const tiles = [
    {
      href: "/receive",
      title: "Nhập kho",
      desc: "Quét mã / nhập tay / upload file",
      icon: PackageOpen,
      color: "bg-green-500",
    },
    {
      href: "/ship",
      title: "Xuất kho",
      desc: "Pick theo đơn hàng",
      icon: PackageMinus,
      color: "bg-blue-500",
    },
    {
      href: "/stock",
      title: "Tồn kho",
      desc: "Tra cứu tồn thời gian thực",
      icon: TrendingUp,
      color: "bg-purple-500",
    },
    {
      href: "/history",
      title: "Lịch sử",
      desc: "Nhập/xuất/điều chỉnh",
      icon: AlertTriangle,
      color: "bg-gray-700",
    },
  ];

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tổng quan kho</h1>
        <Link
          href="/orders/create"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Tạo đơn
        </Link>
      </div>

      {/* KPI cards - 3 cột x 2 hàng */}
      <div className="grid grid-cols-3 gap-2">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Link key={k.label} href={k.href}>
              <Card padding="sm" className="hover:shadow-md transition-shadow">
                <div className={`w-8 h-8 ${k.color} rounded-lg flex items-center justify-center mb-1.5`}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-xs text-gray-500 leading-tight">{k.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {formatNumber(k.value)}
                </p>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* 4 nút chính */}
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
