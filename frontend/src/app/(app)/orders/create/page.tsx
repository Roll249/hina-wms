"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  X,
  Package,
  CheckCircle2,
  Phone,
  User,
  MapPin,
  StickyNote,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";

type ProductResult = {
  id: string;
  productCode: string;
  sku: string;
  name: string;
  basePrice: number;
  available: number;
  imageUrl: string | null;
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    basePrice: number;
    attributes: any;
  }>;
};

type CartItem = {
  productId: string;
  variantId?: string;
  productName: string;
  variantName?: string;
  productCode: string;
  unitPrice: number;
  quantity: number;
  available: number;
};

export default function CreateOrderPage() {
  const router = useRouter();

  // Form KH
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  // Search sản phẩm
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Search sản phẩm (debounce)
  useEffect(() => {
    if (!query || query.length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/admin/orders/search-products?q=${encodeURIComponent(query)}`);
        setResults(data);
      } catch (err) {
        toast.error("Lỗi tìm sản phẩm");
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Click outside to close
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const addToCart = (product: ProductResult, variant?: ProductResult["variants"][number]) => {
    const productId = variant ? variant.id : product.id;
    const parentId = product.id;
    const productName = variant ? `${product.name} - ${variant.name}` : product.name;
    const unitPrice = variant ? variant.basePrice : product.basePrice;
    const available = product.available;

    setCart((prev) => {
      const existing = prev.find((c) => c.productId === productId);
      if (existing) {
        return prev.map((c) =>
          c.productId === productId
            ? { ...c, quantity: Math.min(c.quantity + 1, available) }
            : c,
        );
      }
      return [
        ...prev,
        {
          productId: parentId,
          variantId: variant?.id,
          productName,
          variantName: variant?.name,
          productCode: variant?.sku ?? product.sku,
          unitPrice,
          quantity: 1,
          available,
        },
      ];
    });
    setQuery("");
    setResults([]);
    setShowResults(false);
    toast.success(`Đã thêm ${productName}`);
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.productId === productId
            ? { ...c, quantity: Math.max(1, Math.min(c.quantity + delta, c.available)) }
            : c,
        ),
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  };

  const total = cart.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const totalItems = cart.reduce((sum, it) => sum + it.quantity, 0);

  const handleSubmit = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !customerAddress.trim()) {
      toast.error("Vui lòng nhập tên, SĐT, địa chỉ khách hàng");
      return;
    }
    if (cart.length === 0) {
      toast.error("Chưa có sản phẩm trong đơn");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post("/admin/orders", {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        shippingAddress: customerAddress.trim(),
        customerNote: customerNote.trim() || undefined,
        items: cart.map((c) => ({
          productId: c.productId,
          variantId: c.variantId,
          quantity: c.quantity,
        })),
      });

      toast.success(`Đã tạo đơn ${data.orderNumber}`);
      router.push(`/orders/${data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Lỗi tạo đơn hàng");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 pb-32">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tạo đơn từ kho</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Dành cho khách mua trực tiếp / đặt qua điện thoại (offline)
        </p>
      </div>

      {/* Thông tin khách hàng */}
      <Card padding="md">
        <h2 className="font-semibold text-gray-900 mb-3">Thông tin khách hàng</h2>
        <div className="space-y-2.5">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Họ tên khách hàng"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              placeholder="Số điện thoại"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="relative">
            <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
            <textarea
              placeholder="Địa chỉ giao hàng"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              rows={2}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <StickyNote className="absolute left-3 top-3 h-4 w-4 text-gray-400 pointer-events-none" />
            <textarea
              placeholder="Ghi chú (tùy chọn)"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              rows={2}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </Card>

      {/* Search sản phẩm */}
      <Card padding="md">
        <h2 className="font-semibold text-gray-900 mb-3">Thêm sản phẩm</h2>
        <div className="relative" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Tìm theo mã SP, SKU hoặc tên..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
            className="pl-9"
          />

          {showResults && (searching || results.length > 0) && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
              {searching ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Đang tìm...
                </div>
              ) : (
                results.map((p) => (
                  <div key={p.id} className="border-b border-gray-100 last:border-0">
                    <button
                      onClick={() => addToCart(p)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 text-left"
                      disabled={p.available <= 0}
                    >
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <code className="text-[10px] text-gray-500 font-mono">{p.productCode}</code>
                          <span className="text-xs text-primary-600 font-semibold">
                            {formatNumber(p.basePrice)}₫
                          </span>
                        </div>
                      </div>
                      <Badge variant={p.available > 0 ? "success" : "danger"}>
                        Tồn: {p.available}
                      </Badge>
                    </button>
                    {p.variants.length > 0 && (
                      <div className="bg-gray-50/50">
                        {p.variants.map((v) => (
                          <button
                            key={v.id}
                            onClick={() => addToCart(p, v)}
                            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-gray-100 text-left text-xs"
                          >
                            <span className="text-gray-700 truncate">
                              ↳ {v.name}
                              <code className="ml-2 text-[10px] text-gray-500 font-mono">{v.sku}</code>
                            </span>
                            <span className="text-primary-600 font-semibold">
                              {formatNumber(v.basePrice)}₫
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Cart */}
      {cart.length > 0 && (
        <Card padding="md">
          <h2 className="font-semibold text-gray-900 mb-3">
            Đơn hàng ({cart.length} SP, {totalItems} món)
          </h2>
          <div className="divide-y divide-gray-100">
            {cart.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.productName}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <code className="text-[10px] text-gray-500 font-mono">
                      {item.productCode}
                    </code>
                    <span className="text-xs text-primary-600">
                      {formatNumber(item.unitPrice)}₫
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateQty(item.productId, -1)}
                    disabled={item.quantity <= 1}
                    className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center disabled:opacity-40"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-semibold">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(item.productId, 1)}
                    disabled={item.quantity >= item.available}
                    className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 flex items-center justify-center disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => removeItem(item.productId)}
                  className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t-2 border-gray-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Tổng cộng</span>
            <span className="text-xl font-bold text-primary-600">
              {formatNumber(total)}₫
            </span>
          </div>
        </Card>
      )}

      {/* Sticky bottom button */}
      <div className="fixed bottom-16 left-0 right-0 px-3 pb-2 pt-2 bg-gradient-to-t from-white via-white to-transparent">
        <Button
          onClick={handleSubmit}
          disabled={submitting || cart.length === 0}
          size="lg"
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Đang tạo...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Tạo đơn {total > 0 && `· ${formatNumber(total)}₫`}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
