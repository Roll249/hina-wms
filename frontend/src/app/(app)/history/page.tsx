"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { PackageOpen, PackageMinus, History } from "lucide-react";
import api from "@/lib/api";

const RECEIPT_STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" | "gray" }> = {
  DRAFT: { label: "Nháp", variant: "gray" },
  CONFIRMED: { label: "Đã nhập", variant: "success" },
  CANCELLED: { label: "Hủy", variant: "danger" },
};

const SHIP_STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" | "gray" }> = {
  PENDING: { label: "Chờ pick", variant: "warning" },
  PICKING: { label: "Đang pick", variant: "info" },
  PICKED: { label: "Đã pick", variant: "info" },
  HANDED_OVER: { label: "Đã giao", variant: "success" },
  CANCELLED: { label: "Hủy", variant: "danger" },
};

const MOVEMENT_TYPE_LABELS: Record<string, { label: string; variant: "default" | "success" | "warning" | "danger" | "info" | "gray"; isIn: boolean }> = {
  GOODS_RECEIPT: { label: "Nhập kho", variant: "success", isIn: true },
  ORDER_SHIPMENT: { label: "Xuất đơn", variant: "warning", isIn: false },
  STOCKTAKE_ADJUST: { label: "Kiểm kê", variant: "info", isIn: true },
  PRODUCT_CREATED: { label: "Tạo SP", variant: "info", isIn: true },
  STOCK_INITIALIZED: { label: "Khởi tạo", variant: "info", isIn: true },
  STOCK_DEDUCTED_ORDER: { label: "Bán hàng", variant: "warning", isIn: false },
  STOCK_RESTORED_ORDER_CANCEL: { label: "Hoàn đơn", variant: "success", isIn: true },
  STOCK_RESERVED: { label: "Đặt trước", variant: "info", isIn: false },
  STOCK_RELEASED: { label: "Hủy đặt", variant: "info", isIn: true },
  STOCK_ADJUSTED_MANUAL: { label: "Điều chỉnh", variant: "info", isIn: true },
  STOCK_SET_MANUAL: { label: "Set tồn", variant: "info", isIn: true },
};

export default function HistoryPage() {
  const [tab, setTab] = useState("receipts");

  return (
    <div className="space-y-3 pb-20">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <History className="h-6 w-6" /> Lịch sử
      </h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="receipts">Phiếu nhập</TabsTrigger>
          <TabsTrigger value="shipments">Phiếu xuất</TabsTrigger>
          <TabsTrigger value="movements">Biến động</TabsTrigger>
        </TabsList>

        <TabsContent value="receipts">
          <ReceiptsList />
        </TabsContent>
        <TabsContent value="shipments">
          <ShipmentsList />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReceiptsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["receipts-list"],
    queryFn: async () => {
      const { data } = await api.get("/receipts?pageSize=50");
      return data;
    },
  });

  if (isLoading) return <p className="text-center py-8 text-gray-500">Đang tải...</p>;

  return (
    <div className="space-y-2">
      {data?.items?.map((r: any) => (
        <Card key={r.id} padding="sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-sm text-primary-600">{r.receiptNumber}</span>
            <Badge variant={RECEIPT_STATUS[r.status]?.variant || "gray"}>
              {RECEIPT_STATUS[r.status]?.label || r.status}
            </Badge>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>{r.warehouse?.name}</span>
            <span>{r.itemCount} SP • {formatNumber(r.totalQuantity)} sp</span>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{r.receivedBy?.user?.fullName || r.receivedBy?.employeeCode}</span>
            <span>{formatDateTime(r.createdAt)}</span>
          </div>
        </Card>
      ))}
      {data?.items?.length === 0 && (
        <p className="text-center text-gray-500 py-8">Chưa có phiếu nhập nào</p>
      )}
    </div>
  );
}

function ShipmentsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["shipments-list"],
    queryFn: async () => {
      const { data } = await api.get("/shipments?pageSize=50");
      return data;
    },
  });

  if (isLoading) return <p className="text-center py-8 text-gray-500">Đang tải...</p>;

  return (
    <div className="space-y-2">
      {data?.items?.map((s: any) => (
        <Card key={s.id} padding="sm">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-sm text-primary-600">{s.shipmentNumber}</span>
            <Badge variant={SHIP_STATUS[s.status]?.variant || "gray"}>
              {SHIP_STATUS[s.status]?.label || s.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-700">Đơn: {s.orderNumber}</p>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{s.warehouse?.name}</span>
            <span>{s.itemCount} SP • {formatDateTime(s.createdAt)}</span>
          </div>
          {s.carrierName && (
            <p className="text-xs text-gray-500 mt-1">
              {s.carrierName} {s.trackingNumber && `• ${s.trackingNumber}`}
            </p>
          )}
        </Card>
      ))}
      {data?.items?.length === 0 && (
        <p className="text-center text-gray-500 py-8">Chưa có phiếu xuất nào</p>
      )}
    </div>
  );
}

function MovementsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data } = await api.get("/stock/movements?pageSize=50");
      return data;
    },
  });

  if (isLoading) return <p className="text-center py-8 text-gray-500">Đang tải...</p>;

  return (
    <div className="space-y-2">
      {data?.items?.map((m: any) => {
        const meta = MOVEMENT_TYPE_LABELS[m.type] || { label: m.type, variant: "gray" as const, isIn: m.quantity > 0 };
        return (
          <Card key={m.id} padding="sm">
            <div className="flex items-center justify-between mb-1">
              <Badge variant={meta.variant}>{meta.label}</Badge>
              <span
                className={`text-sm font-bold ${
                  m.quantity > 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {m.quantity > 0 ? "+" : ""}
                {m.quantity}
              </span>
            </div>
            <p className="text-sm text-gray-700 line-clamp-1">
              {m.productName || m.productCode}
            </p>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span className="font-mono">{m.productCode}</span>
              <span>{formatDateTime(m.createdAt)}</span>
            </div>
            {m.reference && (
              <p className="text-xs text-gray-400 mt-1 font-mono">{m.reference}</p>
            )}
            {m.staff && (
              <p className="text-xs text-gray-500 mt-1">NV: {m.staff.fullName || m.staff.employeeCode}</p>
            )}
          </Card>
        );
      })}
      {data?.items?.length === 0 && (
        <p className="text-center text-gray-500 py-8">Chưa có biến động nào</p>
      )}
    </div>
  );
}
