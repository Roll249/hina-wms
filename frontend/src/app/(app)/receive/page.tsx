"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Keyboard, FileUp, Check, Trash2, Plus } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/scanner/barcode-scanner";
import { useProductLookup } from "@/hooks/use-stock";
import { ScanResult } from "@/hooks/use-scanner";
import api from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Tab = "scan" | "manual" | "file";

interface ReceiptItem {
  productCode: string;
  productName?: string;
  receivedQuantity: number;
  unitCost?: number;
}

export default function ReceivePage() {
  const [tab, setTab] = useState<Tab>("scan");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scanQty, setScanQty] = useState(1);
  const [manualCode, setManualCode] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const qc = useQueryClient();

  const { data: scannedProduct } = useProductLookup(scannedCode);

  // Tạo phiếu nhập (lazy - tạo khi cần)
  const createReceipt = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/receipts", { source: tab.toUpperCase() });
      return data;
    },
    onSuccess: (data) => {
      setReceiptId(data.id);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Không tạo được phiếu");
    },
  });

  const ensureReceipt = async () => {
    if (receiptId) return receiptId;
    const data = await createReceipt.mutateAsync();
    return data.id;
  };

  // Thêm item vào phiếu
  const addItem = useMutation({
    mutationFn: async (item: ReceiptItem) => {
      const id = await ensureReceipt();
      const { data } = await api.post("/receipts/items", {
        receiptId: id,
        productCode: item.productCode,
        receivedQuantity: item.receivedQuantity,
        unitCost: item.unitCost,
      });
      return data;
    },
    onSuccess: (_data, variables) => {
      setItems((prev) => [...prev, variables]);
      toast.success(`Đã thêm: ${variables.productCode} x${variables.receivedQuantity}`);
      setScannedCode(null);
      setScanQty(1);
      setManualCode("");
      setManualQty(1);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Thêm thất bại");
    },
  });

  // Xác nhận phiếu
  const confirmReceipt = useMutation({
    mutationFn: async () => {
      if (!receiptId) throw new Error("Chưa có phiếu");
      const { data } = await api.patch(`/receipts/${receiptId}/confirm`);
      return data;
    },
    onSuccess: () => {
      toast.success("Đã xác nhận phiếu nhập - Tồn kho đã cập nhật!");
      setItems([]);
      setReceiptId(null);
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["low-stock"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Xác nhận thất bại");
    },
  });

  const handleScan = useCallback((result: ScanResult) => {
    setScannedCode(result.text);
    setScanQty(1);
  }, []);

  const handleAddScanned = () => {
    if (!scannedCode) return;
    addItem.mutate({
      productCode: scannedCode,
      productName: scannedProduct?.name,
      receivedQuantity: scanQty,
    });
  };

  const handleAddManual = () => {
    if (!manualCode) return;
    addItem.mutate({
      productCode: manualCode,
      receivedQuantity: manualQty,
    });
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // File upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<any>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows: BulkRow[] = results.data
          .filter((r) => r.upc || r.code || r.productCode)
          .map((r) => ({
            upc: (r.upc || r.code || r.productCode || "").toString().trim(),
            name: r.name,
            quantity: Number(r.stock || r.quantity || r.qty || 0),
            unitCost: r.price ? Number(r.price) : undefined,
          }))
          .filter((r) => r.upc && r.quantity > 0);

        if (rows.length === 0) {
          toast.error("File không có dòng hợp lệ. Cần cột: upc/code, stock/quantity");
          return;
        }

        try {
          const id = await ensureReceipt();
          const { data } = await api.post("/receipts/import", {
            receiptId: id,
            items: rows.map((r) => ({
              productCode: r.upc,
              productName: r.name,
              receivedQuantity: r.quantity,
              unitCost: r.unitCost,
            })),
          });
          toast.success(`Đã import ${data.totalItems} sản phẩm (${data.totalErrors} lỗi)`);
          qc.invalidateQueries({ queryKey: ["stock"] });
        } catch (err: any) {
          toast.error(err.response?.data?.message || "Import thất bại");
        }
      },
      error: () => toast.error("Không đọc được file CSV"),
    });
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Nhập kho</h1>
        {items.length > 0 && (
          <Badge variant="info">{items.length} sản phẩm</Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        {[
          { key: "scan", label: "Quét mã", icon: Camera },
          { key: "manual", label: "Nhập tay", icon: Keyboard },
          { key: "file", label: "Upload file", icon: FileUp },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key as Tab)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md flex items-center justify-center gap-1.5",
                tab === t.key ? "bg-white text-primary-600 shadow-sm" : "text-gray-600",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "scan" && (
        <Card padding="md" className="space-y-4">
          <BarcodeScanner onScan={handleScan} />

          {scannedCode && (
            <div className="border-t pt-4">
              {scannedProduct ? (
                <div className="space-y-3">
                  <div className="flex gap-3">
                    {scannedProduct.imageUrl && (
                      <img
                        src={scannedProduct.imageUrl}
                        alt=""
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-xs text-gray-500">{scannedProduct.productCode}</p>
                      <p className="font-medium text-gray-900 line-clamp-2">{scannedProduct.name}</p>
                      <p className="text-sm text-gray-500">
                        Tồn hiện tại: <span className="font-semibold">{formatNumber(scannedProduct.quantity)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => setScanQty((q) => Math.max(1, q - 1))}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min={1}
                      value={scanQty}
                      onChange={(e) => setScanQty(Math.max(1, Number(e.target.value)))}
                      className="text-center text-lg font-semibold"
                    />
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={() => setScanQty((q) => q + 1)}
                    >
                      +
                    </Button>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleAddScanned}
                      disabled={addItem.isPending}
                      className="ml-auto"
                    >
                      <Plus className="h-4 w-4" /> Thêm
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-red-600">Không tìm thấy: {scannedCode}</p>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {tab === "manual" && (
        <Card padding="md" className="space-y-3">
          <Input
            label="Mã sản phẩm / SKU"
            placeholder="Nhập mã hoặc scan"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value.toUpperCase())}
            autoFocus
          />
          <Input
            label="Số lượng"
            type="number"
            min={1}
            value={manualQty}
            onChange={(e) => setManualQty(Math.max(1, Number(e.target.value)))}
          />
          <Button
            variant="primary"
            size="lg"
            onClick={handleAddManual}
            disabled={!manualCode || addItem.isPending}
            className="w-full"
          >
            <Plus className="h-4 w-4" /> Thêm vào phiếu
          </Button>
        </Card>
      )}

      {tab === "file" && (
        <Card padding="md" className="space-y-3">
          <p className="text-sm text-gray-600">
            Upload file CSV với các cột: <code className="bg-gray-100 px-1">upc</code>,
            <code className="bg-gray-100 px-1 ml-1">name</code>,
            <code className="bg-gray-100 px-1 ml-1">stock</code>,
            <code className="bg-gray-100 px-1 ml-1">price</code> (tùy chọn)
          </p>
          <a
            href="/api/template/receipt-csv"
            className="text-sm text-primary-600 hover:underline"
          >
            Tải template CSV mẫu
          </a>
          <label className="block">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary-50 file:text-primary-600 hover:file:bg-primary-100"
            />
          </label>
          <p className="text-xs text-gray-500">
            Mỗi dòng = 1 sản phẩm. Tối đa 5000 dòng/lần.
          </p>
        </Card>
      )}

      {/* Danh sách items đã thêm */}
      {items.length > 0 && (
        <Card padding="md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Phiếu nhập ({items.length})</h2>
            <Button
              variant="primary"
              onClick={() => confirmReceipt.mutate()}
              disabled={confirmReceipt.isPending}
            >
              <Check className="h-4 w-4" />
              Hoàn tất
            </Button>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 py-2 border-b border-gray-100 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-gray-500">{item.productCode}</p>
                  {item.productName && (
                    <p className="text-sm text-gray-700 truncate">{item.productName}</p>
                  )}
                </div>
                <span className="text-lg font-semibold text-primary-500">
                  ×{item.receivedQuantity}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(idx)}
                  className="text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

interface BulkRow {
  upc: string;
  name?: string;
  quantity: number;
  unitCost?: number;
}
