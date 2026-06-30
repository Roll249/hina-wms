"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  FileBarChart,
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { formatNumber, formatDate } from "@/lib/utils";

type Tab = "inventory" | "movements" | "orders" | "top-products";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("inventory");
  
  // Date range
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const [fromDate, setFromDate] = useState(firstDay.toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0]);

  // Fetch summary
  const { data: summary } = useQuery({
    queryKey: ["reports", "summary"],
    queryFn: async () => {
      const { data } = await api.get("/reports/inventory-summary");
      return data;
    },
  });

  // Fetch movements
  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["reports", "movements", fromDate, toDate],
    queryFn: async () => {
      const { data } = await api.get(`/reports/movements?fromDate=${fromDate}&toDate=${toDate}&groupBy=day`);
      return data;
    },
    enabled: tab === "movements",
  });

  // Fetch orders report
  const { data: ordersReport = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["reports", "orders", fromDate, toDate],
    queryFn: async () => {
      const { data } = await api.get(`/reports/orders?fromDate=${fromDate}&toDate=${toDate}`);
      return data;
    },
    enabled: tab === "orders",
  });

  // Fetch top products
  const { data: topProducts = [], isLoading: loadingTopProducts } = useQuery({
    queryKey: ["reports", "top-products", fromDate, toDate],
    queryFn: async () => {
      const { data } = await api.get(`/reports/top-products?fromDate=${fromDate}&toDate=${toDate}&limit=20`);
      return data;
    },
    enabled: tab === "top-products",
  });

  const tabs = [
    { id: "inventory", label: "Tồn kho" },
    { id: "movements", label: "Biến động" },
    { id: "orders", label: "Đơn hàng" },
    { id: "top-products", label: "Bán chạy" },
  ] as const;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Báo cáo kho</h1>
        <Button variant="ghost" size="sm">
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2">
        <Card padding="sm" className="text-center">
          <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Package className="h-5 w-5 text-white" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(summary?.totalProducts ?? 0)}</p>
          <p className="text-xs text-gray-500">Sản phẩm</p>
        </Card>
        <Card padding="sm" className="text-center">
          <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(summary?.totalQuantity ?? 0)}</p>
          <p className="text-xs text-gray-500">Tổng tồn</p>
        </Card>
        <Card padding="sm" className="text-center">
          <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center mx-auto mb-2">
            <AlertTriangle className="h-5 w-5 text-white" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(summary?.lowStockCount ?? 0)}</p>
          <p className="text-xs text-gray-500">Tồn thấp</p>
        </Card>
        <Card padding="sm" className="text-center">
          <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center mx-auto mb-2">
            <Minus className="h-5 w-5 text-white" />
          </div>
          <p className="text-2xl font-bold">{formatNumber(summary?.outOfStockCount ?? 0)}</p>
          <p className="text-xs text-gray-500">Hết hàng</p>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
        <Calendar className="h-4 w-4 text-gray-500" />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        />
        <span className="text-gray-400">→</span>
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        />
      </div>

      {/* Content based on tab */}
      {tab === "inventory" && (
        <div className="space-y-3">
          <Card padding="md">
            <h3 className="font-semibold mb-3">Top sản phẩm tồn kho cao</h3>
            <div className="space-y-2">
              {summary?.topProducts?.slice(0, 10).map((p: any, i: number) => (
                <div key={p.productId} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-gray-500">{formatNumber(p.quantity)} items</p>
                    </div>
                  </div>
                  <p className="font-semibold text-purple-600">
                    {formatNumber(p.value)}đ
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === "movements" && (
        <div className="space-y-2">
          {(loadingMovements ? [] : movements).map((m: any) => {
            const net = m.received - m.shipped;
            return (
              <Card key={m.date} padding="sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${net >= 0 ? "bg-green-100" : "bg-red-100"}`}>
                      {net >= 0 ? (
                        <ArrowUpRight className="h-5 w-5 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{formatDate(m.date)}</p>
                      <p className="text-xs text-gray-500">
                        Nhập {formatNumber(m.received)} • Xuất {formatNumber(m.shipped)} • Điều chỉnh {formatNumber(m.adjusted)}
                      </p>
                    </div>
                  </div>
                  <p className={`font-semibold ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {net >= 0 ? "+" : ""}{formatNumber(net)}
                  </p>
                </div>
              </Card>
            );
          })}
          {loadingMovements && <div className="text-center py-8 text-gray-400">Đang tải...</div>}
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-2">
          {(loadingOrders ? [] : ordersReport).map((o: any) => (
            <Card key={o.date} padding="sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{formatDate(o.date)}</p>
                  <p className="text-xs text-gray-500">
                    {o.ordersCount} đơn • {o.itemsCount} sản phẩm
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{formatNumber(o.totalValue)}đ</p>
                  <p className="text-xs text-gray-500">
                    TB: {formatNumber(Math.round(o.avgOrderValue))}đ/đơn
                  </p>
                </div>
              </div>
            </Card>
          ))}
          {loadingOrders && <div className="text-center py-8 text-gray-400">Đang tải...</div>}
        </div>
      )}

      {tab === "top-products" && (
        <div className="space-y-2">
          {(loadingTopProducts ? [] : topProducts).map((p: any, i: number) => (
            <Card key={p.productId} padding="sm">
              <div className="flex items-center gap-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i === 0 ? "bg-yellow-100 text-yellow-700" :
                  i === 1 ? "bg-gray-100 text-gray-700" :
                  i === 2 ? "bg-orange-100 text-orange-700" :
                  "bg-gray-50 text-gray-500"
                }`}>
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.productCode}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatNumber(p.quantity)} đã bán</p>
                  <p className="text-xs text-gray-500">{formatNumber(p.revenue)}đ</p>
                </div>
              </div>
            </Card>
          ))}
          {loadingTopProducts && <div className="text-center py-8 text-gray-400">Đang tải...</div>}
        </div>
      )}
    </div>
  );
}
