"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Download,
  FileSpreadsheet,
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import api from "@/lib/api";

type Tab = "export" | "import" | "adjust";

export default function ImportExportPage() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("export");
  const [uploadType, setUploadType] = useState<"products" | "receipt" | "adjust">("products");

  // Fetch categories for filter
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await api.get("/stock/categories");
      return data;
    },
  });

  // Export inventory
  const exportInventory = useMutation({
    mutationFn: async () => {
      const { data } = await api.get("/import-export/inventory?includeOutOfStock=true");
      return data;
    },
    onSuccess: (data) => {
      // Convert to CSV and download
      if (data.length === 0) {
        toast.warning("Không có dữ liệu để export");
        return;
      }
      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(","),
        ...data.map((row: any) => headers.map((h) => `"${row[h] ?? ''}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã export inventory");
    },
    onError: () => {
      toast.error("Lỗi export");
    },
  });

  // Export products
  const exportProducts = useMutation({
    mutationFn: async () => {
      const { data } = await api.get("/import-export/products");
      return data;
    },
    onSuccess: (data) => {
      if (data.length === 0) {
        toast.warning("Không có dữ liệu để export");
        return;
      }
      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(","),
        ...data.map((row: any) => headers.map((h) => `"${row[h] ?? ''}"`).join(",")),
      ].join("\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã export products");
    },
    onError: () => {
      toast.error("Lỗi export");
    },
  });

  // Import products
  const importProducts = useMutation({
    mutationFn: async (data: any[]) => {
      const res = await api.post("/import-export/products", data);
      return res.data;
    },
    onSuccess: (result) => {
      toast.success(
        <div>
          <p>Đã import:</p>
          <p>Tạo mới: {result.created}</p>
          <p>Cập nhật: {result.updated}</p>
          {result.errors.length > 0 && (
            <p className="text-red-500">Lỗi: {result.errors.length}</p>
          )}
        </div>
      );
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi import");
    },
  });

  // Import receipt
  const importReceipt = useMutation({
    mutationFn: async ({ items, note }: { items: any[]; note?: string }) => {
      const res = await api.post("/import-export/receipt", { items, note });
      return res.data;
    },
    onSuccess: () => {
      toast.success("Đã tạo phiếu nhập");
      qc.invalidateQueries({ queryKey: ["receipts"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi tạo phiếu nhập");
    },
  });

  // Bulk adjust
  const bulkAdjust = useMutation({
    mutationFn: async (data: any[]) => {
      const res = await api.post("/import-export/stock-adjust", data);
      return res.data;
    },
    onSuccess: (result) => {
      toast.success(
        <div>
          <p>Đã điều chỉnh: {result.adjusted} sản phẩm</p>
          {result.errors.length > 0 && (
            <p className="text-red-500">Lỗi: {result.errors.length}</p>
          )}
        </div>
      );
      qc.invalidateQueries({ queryKey: ["stock"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi điều chỉnh");
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        
        if (type === "products") {
          importProducts.mutate(rows);
        } else if (type === "receipt") {
          importReceipt.mutate({ items: rows, note: `Import từ file: ${file.name}` });
        } else if (type === "adjust") {
          bulkAdjust.mutate(rows);
        }
      } catch (err) {
        toast.error("Lỗi đọc file");
      }
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    const rows = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim().replace(/"/g, ""));
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });
      rows.push(row);
    }
    
    return rows;
  };

  const tabs = [
    { id: "export", label: "Export", icon: Download },
    { id: "import", label: "Import", icon: Upload },
    { id: "adjust", label: "Điều chỉnh", icon: Package },
  ] as const;

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Import / Export</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Export Tab */}
      {tab === "export" && (
        <div className="space-y-4">
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="h-7 w-7 text-green-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Export Inventory</h3>
                <p className="text-sm text-gray-500">Tải về danh sách tồn kho (CSV)</p>
              </div>
              <Button
                variant="outline"
                onClick={() => exportInventory.mutate()}
                disabled={exportInventory.isPending}
              >
                {exportInventory.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Export
              </Button>
            </div>
          </Card>

          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="h-7 w-7 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Export Products</h3>
                <p className="text-sm text-gray-500">Tải về danh sách sản phẩm (CSV)</p>
              </div>
              <Button
                variant="outline"
                onClick={() => exportProducts.mutate()}
                disabled={exportProducts.isPending}
              >
                {exportProducts.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}
                Export
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Import Tab */}
      {tab === "import" && (
        <div className="space-y-4">
          <Card padding="md">
            <h3 className="font-semibold mb-3">Import Products</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload file CSV với các cột: name, sku, productCode, categoryName, basePrice, quantity
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => handleFileUpload(e, "products")}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={importProducts.isPending}
            >
              <Upload className="h-4 w-4 mr-1" />
              Chọn file CSV
            </Button>
          </Card>

          <Card padding="md">
            <h3 className="font-semibold mb-3">Import Receipt</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload file CSV với các cột: productCode, quantity, unitCost, note
            </p>
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              id="receipt-upload"
              onChange={(e) => handleFileUpload(e, "receipt")}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("receipt-upload")?.click()}
              disabled={importReceipt.isPending}
            >
              <Upload className="h-4 w-4 mr-1" />
              Chọn file CSV
            </Button>
          </Card>
        </div>
      )}

      {/* Adjust Tab */}
      {tab === "adjust" && (
        <div className="space-y-4">
          <Card padding="md">
            <h3 className="font-semibold mb-3">Bulk Adjust Stock</h3>
            <p className="text-sm text-gray-500 mb-4">
              Upload file CSV với các cột: productCode, newQuantity, reason
            </p>
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              id="adjust-upload"
              onChange={(e) => handleFileUpload(e, "adjust")}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("adjust-upload")?.click()}
              disabled={bulkAdjust.isPending}
            >
              <Upload className="h-4 w-4 mr-1" />
              Chọn file CSV
            </Button>
          </Card>

          <Card padding="md">
            <h3 className="font-semibold mb-2">Template</h3>
            <p className="text-sm text-gray-500 mb-3">Tải template để import đúng format</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const { data } = await api.get("/import-export/template/stock");
                  const headers = Object.keys(data[0]);
                  const csv = [
                    headers.join(","),
                    ...data.map((row: any) => headers.map((h) => `"${row[h] ?? ''}"`).join(","))
                  ].join("\n");
                  downloadCSV(csv, "template-stock.csv");
                }}
              >
                <FileDown className="h-4 w-4 mr-1" />
                Template điều chỉnh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const { data } = await api.get("/import-export/template/products");
                  const headers = Object.keys(data[0]);
                  const csv = [
                    headers.join(","),
                    ...data.map((row: any) => headers.map((h) => `"${row[h] ?? ''}"`).join(","))
                  ].join("\n");
                  downloadCSV(csv, "template-products.csv");
                }}
              >
                <FileDown className="h-4 w-4 mr-1" />
                Template products
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
