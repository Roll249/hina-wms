"use client";

import { useState } from "react";
import { Save, Loader2, X } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { useCategories, useBulkEditProducts } from "@/hooks/use-stock";
import { toast } from "sonner";

export type BulkEditField =
  | "categoryId"
  | "isClassified"
  | "basePrice"
  | "taxRate"
  | "visibility"
  | "showPriceToGuest"
  | "showPriceToRetail"
  | "showPriceToWholesale";

export type BulkEditOp = {
  field: BulkEditField;
  mode: "set" | "increase" | "decrease";
  value: number | string | boolean;
};

interface BulkEditDrawerProps {
  productIds: string[];
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const FIELD_DEFS: Array<{
  key: BulkEditField;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: Array<{ value: string; label: string }>;
  help?: string;
  allowPercent?: boolean;
  allowAbsolute?: boolean;
}> = [
  {
    key: "categoryId",
    label: "Category",
    type: "select",
    help: "Di chuyển sản phẩm sang category khác",
  },
  {
    key: "isClassified",
    label: "Trạng thái phân loại",
    type: "boolean",
    help: "true = đã phân loại (hiện trong kho), false = chưa phân loại",
  },
  {
    key: "basePrice",
    label: "Giá bán (VND)",
    type: "number",
    help: "Set giá mới, hoặc tăng/giảm theo % (0.1=10%) hoặc số tuyệt đối",
    allowPercent: true,
    allowAbsolute: true,
  },
  {
    key: "taxRate",
    label: "Thuế suất VAT",
    type: "number",
    help: "0.21 = 21%, tăng/giảm theo phần trăm",
    allowPercent: true,
    allowAbsolute: true,
  },
  {
    key: "visibility",
    label: "Visibility",
    type: "select",
    options: [
      { value: "PUBLIC", label: "PUBLIC - Hiện mọi nơi" },
      { value: "RETAIL", label: "RETAIL - Khách lẻ" },
      { value: "WHOLESALE", label: "WHOLESALE - Bán sỉ" },
      { value: "HIDDEN", label: "HIDDEN - Ẩn" },
    ],
    help: "Mức hiển thị của sản phẩm",
  },
  {
    key: "showPriceToGuest",
    label: "Hiện giá cho khách vãng lai",
    type: "boolean",
  },
  {
    key: "showPriceToRetail",
    label: "Hiện giá cho khách lẻ",
    type: "boolean",
  },
  {
    key: "showPriceToWholesale",
    label: "Hiện giá cho bán sỉ",
    type: "boolean",
  },
];

const NUMBER_FIELDS: BulkEditField[] = ["basePrice", "taxRate"];

export function BulkEditDrawer({
  productIds,
  open,
  onClose,
  onSuccess,
}: BulkEditDrawerProps) {
  const { data: categories = [] } = useCategories();
  const bulkEdit = useBulkEditProducts();

  const [ops, setOps] = useState<BulkEditOp[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field đang chỉnh (1 ô input duy nhất)
  const [activeField, setActiveField] = useState<BulkEditField>("basePrice");
  const [activeMode, setActiveMode] = useState<"set" | "increase" | "decrease">("set");
  const [activeValue, setActiveValue] = useState<string>("");

  const handleAdd = () => {
    setError(null);
    const def = FIELD_DEFS.find((f) => f.key === activeField);
    if (!def) return;

    // Validate value
    let value: any;
    if (def.type === "boolean") {
      value = activeValue === "true";
      if (!activeValue) {
        setError("Chọn true/false");
        return;
      }
    } else if (def.type === "number") {
      const num = Number(activeValue);
      if (!activeValue || isNaN(num)) {
        setError("Nhập số hợp lệ");
        return;
      }
      value = num;
    } else {
      // select
      if (!activeValue) {
        setError("Chọn giá trị");
        return;
      }
      value = activeValue;
    }

    // Kiểm tra duplicate field
    if (ops.some((o) => o.field === activeField)) {
      setError(`Field "${def.label}" đã được thêm vào. Hãy xóa trước khi thêm lại.`);
      return;
    }

    setOps([...ops, { field: activeField, mode: activeMode, value }]);
    setActiveValue("");
  };

  const handleRemove = (field: BulkEditField) => {
    setOps(ops.filter((o) => o.field !== field));
  };

  const handleApply = () => {
    if (ops.length === 0) {
      toast.error("Chưa có thao tác nào");
      return;
    }
    setShowConfirm(true);
  };

  const confirmApply = async () => {
    setShowConfirm(false);
    try {
      const res = await bulkEdit.mutateAsync({ productIds, operations: ops });
      toast.success(
        `Đã sửa ${res.changed}/${res.total} sản phẩm. ${res.records.length} bản ghi được cập nhật.`
      );
      setOps([]);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Lỗi bulk edit");
    }
  };

  const activeDef = FIELD_DEFS.find((f) => f.key === activeField);
  const supportsNumber = activeDef && NUMBER_FIELDS.includes(activeField);

  // Nếu mở mới mà chưa có op thì reset
  if (open && ops.length === 0 && error) {
    setError(null);
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="md">
        <div className="p-4 border-b bg-white sticky top-0 z-10 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Sửa hàng loạt</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {productIds.length} sản phẩm sẽ bị ảnh hưởng
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Thêm operation */}
          <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
            <h3 className="text-sm font-medium text-gray-900">Thêm thao tác</h3>

            {/* Field */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Field
              </label>
              <select
                value={activeField}
                onChange={(e) => {
                  setActiveField(e.target.value as BulkEditField);
                  setActiveValue("");
                  setActiveMode("set");
                  setError(null);
                }}
                className="input w-full text-sm"
              >
                {FIELD_DEFS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              {activeDef?.help && (
                <p className="text-[10px] text-gray-500 mt-1">{activeDef.help}</p>
              )}
            </div>

            {/* Mode (chỉ với number fields) */}
            {supportsNumber && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Cách áp dụng
                </label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveMode("set")}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border ${
                      activeMode === "set"
                        ? "bg-primary-500 text-white border-primary-500"
                        : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    = Gán giá trị
                  </button>
                  <button
                    onClick={() => setActiveMode("increase")}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border ${
                      activeMode === "increase"
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    + Tăng
                  </button>
                  <button
                    onClick={() => setActiveMode("decrease")}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border ${
                      activeMode === "decrease"
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    − Giảm
                  </button>
                </div>
                {activeMode !== "set" && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Nhập số: 0.1 = 10%, hoặc số tuyệt đối (vd: 50000)
                  </p>
                )}
              </div>
            )}

            {/* Value input */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Giá trị
              </label>
              {activeDef?.type === "select" ? (
                <select
                  value={activeValue}
                  onChange={(e) => setActiveValue(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="">-- Chọn --</option>
                  {activeDef.key === "categoryId"
                    ? categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.productCount})
                        </option>
                      ))
                    : activeDef.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                </select>
              ) : activeDef?.type === "boolean" ? (
                <select
                  value={activeValue}
                  onChange={(e) => setActiveValue(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="">-- Chọn --</option>
                  <option value="true">true (Đã phân loại / Có)</option>
                  <option value="false">false (Chưa / Không)</option>
                </select>
              ) : (
                <input
                  type="number"
                  step="any"
                  value={activeValue}
                  onChange={(e) => setActiveValue(e.target.value)}
                  placeholder={
                    activeMode === "set"
                      ? "Giá trị mới"
                      : activeMode === "increase"
                        ? "Số tăng (vd: 0.1 = 10%, hoặc 50000)"
                        : "Số giảm (vd: 0.1 = 10%, hoặc 50000)"
                  }
                  className="input w-full text-sm"
                />
              )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              onClick={handleAdd}
              className="w-full px-3 py-1.5 rounded bg-primary-500 text-white text-sm font-medium hover:bg-primary-600"
            >
              + Thêm vào danh sách
            </button>
          </div>

          {/* Danh sách ops đã thêm */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              Sẽ áp dụng ({ops.length})
            </h3>
            {ops.length === 0 ? (
              <p className="text-xs text-gray-500 italic py-2">
                Chưa có thao tác nào
              </p>
            ) : (
              <div className="space-y-1.5">
                {ops.map((op) => {
                  const def = FIELD_DEFS.find((f) => f.key === op.field);
                  let displayValue = String(op.value);
                  if (op.field === "categoryId") {
                    const cat = categories.find((c) => c.id === op.value);
                    displayValue = cat ? cat.name : String(op.value);
                  }
                  const modeLabel =
                    op.mode === "set"
                      ? "="
                      : op.mode === "increase"
                        ? "+"
                        : "−";
                  return (
                    <div
                      key={op.field}
                      className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs"
                    >
                      <span className="font-medium text-blue-900">
                        {def?.label || op.field}
                      </span>
                      <span className="text-blue-600 font-mono">
                        {modeLabel}
                      </span>
                      <span className="flex-1 font-mono text-blue-900 truncate">
                        {displayValue}
                      </span>
                      <button
                        onClick={() => handleRemove(op.field)}
                        className="text-red-500 hover:text-red-700 p-0.5"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Apply button */}
          <div className="pt-2 border-t flex justify-between items-center">
            <span className="text-xs text-gray-500">
              Áp dụng cho {productIds.length} SP
            </span>
            <button
              onClick={handleApply}
              disabled={ops.length === 0 || bulkEdit.isPending}
              className="px-4 py-2 rounded bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
            >
              {bulkEdit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Áp dụng
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showConfirm}
        title="Xác nhận sửa hàng loạt"
        message={`Bạn sắp sửa ${ops.length} trường trên ${productIds.length} sản phẩm. Hành động này sẽ được ghi vào lịch sử và KHÔNG thể hoàn tác hàng loạt.\n\nCác thao tác:\n${ops
          .map((op) => {
            const def = FIELD_DEFS.find((f) => f.key === op.field);
            return `• ${def?.label || op.field} ${op.mode === "set" ? "=" : op.mode === "increase" ? "+" : "−"} ${op.value}`;
          })
          .join("\n")}`}
        confirmText="Áp dụng ngay"
        onConfirm={confirmApply}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
