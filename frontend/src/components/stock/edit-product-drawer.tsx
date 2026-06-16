"use client";

import { useState, useEffect, useMemo } from "react";
import { Save, Loader2, History as HistoryIcon, X, Tag } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import {
  useProductDetail,
  useEditProduct,
  useProductHistory,
  useCategories,
  useClassifyProduct,
} from "@/hooks/use-stock";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface EditProductDrawerProps {
  productId: string | null;
  open: boolean;
  onClose: () => void;
}

const EDITABLE_FIELDS = [
  { key: "name", label: "Tên sản phẩm", type: "text" as const },
  { key: "productCode", label: "Mã sản phẩm (productCode)", type: "text" as const, sensitive: true },
  { key: "sku", label: "SKU", type: "text" as const, sensitive: true },
  { key: "description", label: "Mô tả", type: "textarea" as const },
  { key: "shortDesc", label: "Mô tả ngắn", type: "text" as const },
  { key: "basePrice", label: "Giá bán (VND)", type: "number" as const },
  { key: "weight", label: "Khối lượng (gram)", type: "number" as const },
  { key: "taxRate", label: "Thuế suất (0.21 = 21%)", type: "number" as const },
  { key: "supplierCode", label: "Mã nhà cung cấp", type: "text" as const },
  { key: "metaTitle", label: "Meta title (SEO)", type: "text" as const },
  { key: "metaDesc", label: "Meta description (SEO)", type: "textarea" as const },
];

export function EditProductDrawer({ productId, open, onClose }: EditProductDrawerProps) {
  const { data: product, isLoading } = useProductDetail(open ? productId : null);
  const { data: categories = [] } = useCategories();
  const { data: history = [] } = useProductHistory(open ? productId : null);
  const editMutation = useEditProduct();
  const classifyMutation = useClassifyProduct();

  const [tab, setTab] = useState<"edit" | "history" | "classify">("edit");
  const [form, setForm] = useState<Record<string, any>>({});
  const [original, setOriginal] = useState<Record<string, any>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // Khi load product xong → prefill form
  useEffect(() => {
    if (!product) return;
    const seed: Record<string, any> = {};
    for (const f of EDITABLE_FIELDS) {
      let val = (product as any)[f.key];
      if (val !== null && val !== undefined) {
        // Decimal từ Prisma trả về string → chuyển về number/string phù hợp
        if (f.type === "number" && typeof val === "string") {
          val = val;
        }
        seed[f.key] = val;
      }
    }
    setForm(seed);
    setOriginal(seed);
    setSelectedCategoryId(product.categoryId);
  }, [product?.id]);

  // Tính các field thay đổi
  const changes = useMemo(() => {
    const result: Array<{ key: string; label: string; oldVal: any; newVal: any }> = [];
    for (const f of EDITABLE_FIELDS) {
      const oldVal = original[f.key];
      const newVal = form[f.key];
      if (newVal === undefined) continue;
      const same = String(oldVal ?? "") === String(newVal ?? "");
      if (!same) {
        result.push({ key: f.key, label: f.label, oldVal, newVal });
      }
    }
    return result;
  }, [form, original]);

  const handleSave = () => {
    if (!productId) return;
    if (changes.length === 0) {
      toast.info("Không có thay đổi nào");
      return;
    }
    setShowConfirm(true);
  };

  const confirmSave = async () => {
    setShowConfirm(false);
    if (!productId) return;
    const patch: Record<string, any> = {};
    for (const c of changes) {
      let val: any = form[c.key];
      // Convert number fields
      const fieldDef = EDITABLE_FIELDS.find((f) => f.key === c.key);
      if (fieldDef?.type === "number" && val !== "" && val !== null && val !== undefined) {
        val = Number(val);
      } else if (val === "") {
        val = null;
      }
      patch[c.key] = val;
    }
    try {
      const res = await editMutation.mutateAsync({ id: productId, patch });
      toast.success(`Đã sửa ${res.changed} trường`);
      setTab("history");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Sửa thất bại");
    }
  };

  const handleClassify = async () => {
    if (!productId || !selectedCategoryId) return;
    try {
      const res = await classifyMutation.mutateAsync({
        productId,
        categoryId: selectedCategoryId,
      });
      toast.success(
        res.isDefaultCategory
          ? "Đã reset về chưa phân loại"
          : "Đã phân loại sản phẩm",
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Phân loại thất bại");
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg">
        {isLoading || !product ? (
          <div className="p-8 text-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
            Đang tải...
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="border-b px-4 bg-white sticky top-0 z-10">
              <div className="flex gap-1">
                <TabButton
                  active={tab === "edit"}
                  onClick={() => setTab("edit")}
                  icon={<Save className="h-4 w-4" />}
                  label="Sửa"
                  badge={changes.length > 0 ? changes.length : undefined}
                />
                <TabButton
                  active={tab === "classify"}
                  onClick={() => setTab("classify")}
                  icon={<Tag className="h-4 w-4" />}
                  label="Phân loại"
                  badge={product.isClassified ? undefined : "Mới"}
                />
                <TabButton
                  active={tab === "history"}
                  onClick={() => setTab("history")}
                  icon={<HistoryIcon className="h-4 w-4" />}
                  label="Lịch sử"
                  badge={history.length || undefined}
                />
              </div>
            </div>

            {/* Body */}
            <div className="p-4">
              {/* Header info */}
              <div className="mb-4 pb-3 border-b">
                <div className="flex items-start gap-3">
                  {product.images?.[0] && (
                    <img
                      src={product.images[0].url}
                      alt=""
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-mono">
                      {product.productCode} · SKU: {product.sku}
                    </p>
                    <p className="font-semibold text-gray-900 line-clamp-2">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs">
                      <span className="text-gray-500">
                        Tồn: <b className="text-gray-900">{product.inventory?.quantity ?? 0}</b>
                      </span>
                      {product.isClassified ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                          Đã phân loại
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                          Chưa phân loại
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Edit tab */}
              {tab === "edit" && (
                <div className="space-y-3">
                  {EDITABLE_FIELDS.map((f) => {
                    const changed = changes.find((c) => c.key === f.key);
                    return (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {f.label}
                          {f.sensitive && (
                            <span className="ml-1 text-orange-600">(cẩn thận)</span>
                          )}
                          {changed && (
                            <span className="ml-2 text-xs text-blue-600 font-normal">
                              (đã sửa)
                            </span>
                          )}
                        </label>
                        {f.type === "textarea" ? (
                          <textarea
                            value={form[f.key] ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, [f.key]: e.target.value })
                            }
                            rows={2}
                            className={cn(
                              "input w-full",
                              changed && "border-blue-500 ring-1 ring-blue-200",
                            )}
                          />
                        ) : (
                          <input
                            type={f.type}
                            value={form[f.key] ?? ""}
                            onChange={(e) =>
                              setForm({ ...form, [f.key]: e.target.value })
                            }
                            className={cn(
                              "input w-full",
                              changed && "border-blue-500 ring-1 ring-blue-200",
                            )}
                          />
                        )}
                        {changed && (
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            Cũ: <span className="line-through">{String(changed.oldVal ?? "—")}</span>
                            {" → "}
                            Mới: <b className="text-blue-600">{String(changed.newVal ?? "—")}</b>
                          </p>
                        )}
                      </div>
                    );
                  })}

                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {changes.length === 0
                        ? "Chưa có thay đổi"
                        : `Sẽ lưu ${changes.length} thay đổi`}
                    </span>
                    <button
                      onClick={handleSave}
                      disabled={changes.length === 0 || editMutation.isPending}
                      className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {editMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      <Save className="h-4 w-4" />
                      Lưu thay đổi
                    </button>
                  </div>
                </div>
              )}

              {/* Classify tab */}
              {tab === "classify" && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Chọn category để gán sản phẩm vào. Gán vào category khác mặc định
                    sẽ đánh dấu sản phẩm là <b>"Đã phân loại"</b> và hiển thị trong kho.
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Category hiện tại
                    </label>
                    <p className="text-sm">
                      {product.category?.name ?? "—"}
                      {product.isClassified ? (
                        <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          Đã phân loại
                        </span>
                      ) : (
                        <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                          Chưa phân loại
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Chọn category mới
                    </label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="input w-full"
                    >
                      <option value="">-- Chọn category --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.productCount} sp)
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleClassify}
                    disabled={
                      !selectedCategoryId ||
                      selectedCategoryId === product.categoryId ||
                      classifyMutation.isPending
                    }
                    className="w-full px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {classifyMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <Tag className="h-4 w-4" />
                    Phân loại sản phẩm
                  </button>
                </div>
              )}

              {/* History tab */}
              {tab === "history" && (
                <div className="space-y-2">
                  {history.length === 0 ? (
                    <p className="text-center text-gray-500 py-8">
                      Chưa có lịch sử sửa
                    </p>
                  ) : (
                    history.map((h) => (
                      <div
                        key={h.id}
                        className="p-3 border rounded-lg bg-gray-50 space-y-2"
                      >
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>
                            {h.userEmail ?? "—"} ({h.userRole ?? "—"})
                          </span>
                          <span>{new Date(h.createdAt).toLocaleString("vi-VN")}</span>
                        </div>
                        {h.changes &&
                          Object.entries(h.changes).map(([field, [oldV, newV]]) => (
                            <div key={field} className="text-xs">
                              <b className="text-gray-700">{field}:</b>{" "}
                              <span className="line-through text-gray-500">
                                {String(oldV ?? "—")}
                              </span>{" "}
                              →{" "}
                              <b className="text-blue-600">
                                {String(newV ?? "—")}
                              </b>
                            </div>
                          ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={showConfirm}
        title="Xác nhận sửa sản phẩm"
        message={`Bạn sắp sửa ${changes.length} trường của sản phẩm "${product?.name}".\n\nThay đổi sẽ được lưu vào lịch sử (AuditLog).`}
        confirmText="Lưu thay đổi"
        onConfirm={confirmSave}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2",
        active
          ? "border-primary-600 text-primary-700"
          : "border-transparent text-gray-600 hover:text-gray-900",
      )}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span
          className={cn(
            "ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
            active
              ? "bg-primary-100 text-primary-700"
              : "bg-gray-200 text-gray-700",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
