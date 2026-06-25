"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Package,
  Plus,
  ClipboardCheck,
  X,
  Check,
  AlertTriangle,
  Search,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Play,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import api from "@/lib/api";
import { formatNumber, formatDate } from "@/lib/utils";

type StocktakeStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

type Stocktake = {
  id: string;
  stocktakeNumber: string;
  name: string;
  note?: string;
  status: StocktakeStatus;
  itemCount: number;
  adjustmentCount: number;
  totalDifference: number;
  createdAt: string;
  createdBy: { name?: string; email: string };
};

const statusConfig: Record<StocktakeStatus, { label: string; color: string; icon: any }> = {
  DRAFT: { label: "Nháp", color: "bg-gray-100 text-gray-700", icon: FileText },
  IN_PROGRESS: { label: "Đang kiểm", color: "bg-blue-100 text-blue-700", icon: Clock },
  COMPLETED: { label: "Hoàn thành", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  CANCELLED: { label: "Đã hủy", color: "bg-red-100 text-red-700", icon: XCircle },
};

export default function StocktakePage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newNote, setNewNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch stocktakes
  const { data: stocktakes = [], isLoading } = useQuery<Stocktake[]>({
    queryKey: ["stocktake"],
    queryFn: async () => {
      const { data } = await api.get("/stocktake");
      return data.items;
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post("/stocktake", {
        name: newName,
        note: newNote,
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Đã tạo phiếu kiểm kê");
      setShowCreate(false);
      setNewName("");
      setNewNote("");
      qc.invalidateQueries({ queryKey: ["stocktake"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Lỗi tạo phiếu");
    },
  });

  // Start mutation
  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/stocktake/${id}/start`);
      return data;
    },
    onSuccess: () => {
      toast.success("Đã bắt đầu kiểm kê");
      qc.invalidateQueries({ queryKey: ["stocktake"] });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(`/stocktake/${id}/cancel`);
      return data;
    },
    onSuccess: () => {
      toast.success("Đã hủy phiếu kiểm kê");
      qc.invalidateQueries({ queryKey: ["stocktake"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/stocktake/${id}`);
    },
    onSuccess: () => {
      toast.success("Đã xóa phiếu kiểm kê");
      qc.invalidateQueries({ queryKey: ["stocktake"] });
    },
  });

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kiểm kê kho</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Tạo phiếu mới
        </Button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/stocktake/scan">
          <Card padding="md" className="hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
                <ClipboardCheck className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Kiểm kê nhanh</h3>
                <p className="text-xs text-gray-500">Quét mã vạch</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/stocktake/full">
          <Card padding="md" className="hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
                <Package className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold">Kiểm kê toàn kho</h3>
                <p className="text-xs text-gray-500">Chọn category</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card padding="md" className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Tạo phiếu kiểm kê</h2>
              <button onClick={() => setShowCreate(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Tên phiếu</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="VD: Kiểm kê tháng 6/2026"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Ghi chú</label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
                  rows={3}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreate(false)}
                  className="flex-1"
                >
                  Hủy
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!newName || createMutation.isPending}
                  className="flex-1"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Tạo"
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-700">Lịch sử kiểm kê</h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : stocktakes.length === 0 ? (
          <Card padding="md" className="text-center text-gray-500">
            Chưa có phiếu kiểm kê nào
          </Card>
        ) : (
          stocktakes.map((st) => {
            const config = statusConfig[st.status];
            const StatusIcon = config.icon;
            return (
              <Card key={st.id} padding="sm" className="hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between">
                  <Link href={`/stocktake/${st.id}`} className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${config.color} rounded-lg flex items-center justify-center`}>
                        <StatusIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{st.stocktakeNumber}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${config.color}`}>
                            {config.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{st.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatDate(st.createdAt)} • {st.itemCount} items
                        </p>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-1">
                    {st.status === "DRAFT" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startMutation.mutate(st.id)}
                          disabled={startMutation.isPending}
                        >
                          <Play className="h-4 w-4 text-blue-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Xóa phiếu này?")) {
                              deleteMutation.mutate(st.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </>
                    )}
                    {st.status === "IN_PROGRESS" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm("Hủy phiếu này?")) {
                            cancelMutation.mutate(st.id);
                          }
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        <XCircle className="h-4 w-4 text-orange-600" />
                      </Button>
                    )}
                    {st.status === "COMPLETED" && st.totalDifference !== 0 && (
                      <Badge variant={st.totalDifference > 0 ? "success" : "destructive"}>
                        {st.totalDifference > 0 ? "+" : ""}{formatNumber(st.totalDifference)}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
