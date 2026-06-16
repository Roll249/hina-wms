"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Truck, Play } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";
import api from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ScanResult } from "@/hooks/use-scanner";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "warning" | "success" | "info" | "gray" }> = {
  PENDING: { label: "Chờ pick", variant: "warning" },
  PICKING: { label: "Đang pick", variant: "info" },
  PICKED: { label: "Đã pick", variant: "info" },
  PACKED: { label: "Đã đóng gói", variant: "info" },
  HANDED_OVER: { label: "Đã bàn giao", variant: "success" },
  CANCELLED: { label: "Đã hủy", variant: "gray" },
};

export default function ShipPage() {
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [carrierName, setCarrierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const qc = useQueryClient();

  // Lấy danh sách shipments
  const { data: shipmentsData } = useQuery({
    queryKey: ["shipments"],
    queryFn: async () => {
      const { data } = await api.get("/shipments?pageSize=50");
      return data;
    },
  });

  // Chi tiết shipment đang chọn
  const { data: shipmentDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["shipment", selectedShipment],
    queryFn: async () => {
      if (!selectedShipment) return null;
      const { data } = await api.get(`/shipments/${selectedShipment}`);
      return data;
    },
    enabled: !!selectedShipment,
  });

  const startPick = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/shipments/${id}/start`);
      return data;
    },
    onSuccess: () => {
      refetchDetail();
      qc.invalidateQueries({ queryKey: ["shipments"] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message),
  });

  const pickItem = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number }) => {
      const { data } = await api.post(`/shipments/${selectedShipment}/pick`, {
        itemId, pickedQuantity: qty,
      });
      return data;
    },
    onSuccess: () => {
      refetchDetail();
    },
    onError: (err: any) => toast.error(err.response?.data?.message),
  });

  const completePick = useMutation({
    mutationFn: async () => {
      const { data } = await api.patch(`/shipments/${selectedShipment}/complete-pick`);
      return data;
    },
    onSuccess: () => {
      toast.success("Hoàn tất pick!");
      refetchDetail();
      qc.invalidateQueries({ queryKey: ["shipments"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message),
  });

  const handover = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/shipments/handover", {
        shipmentId: selectedShipment,
        carrierName,
        trackingNumber,
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Đã bàn giao cho carrier");
      setSelectedShipment(null);
      setCarrierName("");
      setTrackingNumber("");
      qc.invalidateQueries({ queryKey: ["shipments"] });
    },
    onError: (err: any) => toast.error(err.response?.data?.message),
  });

  const handleScan = (result: ScanResult) => {
    if (!shipmentDetail) return;
    const item = shipmentDetail.items.find(
      (it: any) => it.productCode === result.text && it.pickedQuantity < it.orderQuantity,
    );
    if (item) {
      pickItem.mutate({ itemId: item.id, qty: 1 });
      toast.success(`Đã pick ${item.productCode}`);
    } else {
      toast.error(`Không tìm thấy sản phẩm "${result.text}" trong picklist`);
    }
    setScannerOpen(false);
  };

  if (selectedShipment && shipmentDetail) {
    return (
      <div className="space-y-3 pb-20">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setSelectedShipment(null)}>
            ← Quay lại
          </Button>
          <Badge variant={STATUS_LABELS[shipmentDetail.status]?.variant || "gray"}>
            {STATUS_LABELS[shipmentDetail.status]?.label || shipmentDetail.status}
          </Badge>
        </div>

        <Card padding="md">
          <h1 className="font-bold text-lg">{shipmentDetail.shipmentNumber}</h1>
          <p className="text-sm text-gray-500">Đơn: {shipmentDetail.orderNumber}</p>
          <p className="text-xs text-gray-400 mt-1">
            Kho: {shipmentDetail.warehouse.name} • Tạo lúc: {formatDateTime(shipmentDetail.createdAt)}
          </p>
        </Card>

        {/* Action bar */}
        {shipmentDetail.status === "PENDING" && (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => startPick.mutate(shipmentDetail.id)}
            disabled={startPick.isPending}
          >
            <Play className="h-4 w-4" /> Bắt đầu pick
          </Button>
        )}

        {shipmentDetail.status === "PICKING" && (
          <>
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => setScannerOpen(!scannerOpen)}
            >
              {scannerOpen ? "Đóng camera" : "Bật camera quét"}
            </Button>
            {scannerOpen && <BarcodeScanner onScan={handleScan} />}
          </>
        )}

        {/* Picklist */}
        <div className="space-y-2">
          {shipmentDetail.items.map((item: any) => {
            const done = item.pickedQuantity >= item.orderQuantity;
            return (
              <Card key={item.id} padding="sm" className={cn(done && "bg-green-50 border-green-200")}>
                <div className="flex items-center gap-3">
                  {item.product?.images?.[0]?.url && (
                    <img src={item.product.images[0].url} alt="" className="w-12 h-12 object-cover rounded" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-gray-500">{item.productCode}</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{item.productName}</p>
                    <p className="text-xs text-gray-500">
                      Pick: <span className={cn("font-semibold", done ? "text-green-600" : "text-blue-600")}>
                        {item.pickedQuantity}/{item.orderQuantity}
                      </span>
                    </p>
                  </div>
                  {done ? (
                    <Badge variant="success"><Check className="h-3 w-3 mr-0.5" />Xong</Badge>
                  ) : shipmentDetail.status === "PICKING" ? (
                    <Button size="sm" onClick={() => pickItem.mutate({ itemId: item.id, qty: 1 })}>
                      +1
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>

        {shipmentDetail.status === "PICKING" && (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => completePick.mutate()}
            disabled={completePick.isPending}
          >
            <Check className="h-4 w-4" /> Hoàn tất pick
          </Button>
        )}

        {(shipmentDetail.status === "PICKED" || shipmentDetail.status === "PACKED") && (
          <Card padding="md" className="space-y-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Truck className="h-4 w-4" /> Bàn giao cho carrier
            </h3>
            <Input
              label="Tên hãng vận chuyển"
              placeholder="VD: J&T, GHN, Shopee Express..."
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
            />
            <Input
              label="Mã vận đơn (tùy chọn)"
              placeholder="Tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => handover.mutate()}
              disabled={!carrierName || handover.isPending}
            >
              Xác nhận bàn giao
            </Button>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-20">
      <h1 className="text-2xl font-bold text-gray-900">Xuất kho</h1>
      <p className="text-sm text-gray-600">
        Danh sách đơn hàng cần pick. Cập nhật real-time từ hina-e-comm.
      </p>

      <div className="space-y-2">
        {shipmentsData?.items?.map((s: any) => (
          <Card
            key={s.id}
            padding="md"
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedShipment(s.id)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono text-sm text-gray-900">{s.shipmentNumber}</span>
              <Badge variant={STATUS_LABELS[s.status]?.variant || "gray"}>
                {STATUS_LABELS[s.status]?.label || s.status}
              </Badge>
            </div>
            <p className="text-sm text-gray-700">Đơn: {s.orderNumber}</p>
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{s.warehouse?.name}</span>
              <span>{s.itemCount} SP • {formatDateTime(s.createdAt)}</span>
            </div>
          </Card>
        ))}

        {shipmentsData?.items?.length === 0 && (
          <Card padding="lg" className="text-center text-gray-500">
            <p>Chưa có đơn hàng cần xuất</p>
            <p className="text-xs mt-1">Đơn sẽ tự động xuất hiện khi có order mới</p>
          </Card>
        )}
      </div>
    </div>
  );
}
