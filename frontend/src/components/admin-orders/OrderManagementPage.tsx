'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OrderListPage } from '@/components/admin-orders/OrderListPage';
import { CustomerSearch, type OrderFormCustomer } from '@/components/admin-orders/CustomerSearch';
import { ProductSearch, type CartItem } from '@/components/admin-orders/ProductSearch';
import { AddressManager } from '@/components/admin-orders/AddressManager';
import { DiscountModal } from '@/components/admin-orders/DiscountModal';
import { createAdminOrder } from '@/lib/api/admin-orders';
import { formatNumber } from '@/lib/utils';
import { toast } from 'sonner';

type PaymentMethod = 'COD' | 'CASH' | 'BANK_TRANSFER';

const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  COD: 'COD (Nhận hàng trả tiền)',
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
};

function formatCurrency(amount: number): string {
  return formatNumber(amount);
}

export function OrderManagementPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Create form state
  const [orderNumber, setOrderNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [customer, setCustomer] = useState<OrderFormCustomer | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addressRequiredMessage, setAddressRequiredMessage] = useState<string | null>(null);

  // Product cart
  const [items, setItems] = useState<CartItem[]>([]);

  // Discount
  const [discountPct, setDiscountPct] = useState('');
  const [discountFixed, setDiscountFixed] = useState('');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);

  // Submission
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate totals
  const orderSubtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
  }, [items]);

  const discountAmount = useMemo(() => {
    if (discountPct) {
      const pct = Number.parseFloat(discountPct);
      if (Number.isFinite(pct) && pct > 0 && orderSubtotal > 0) {
        return (pct / 100) * orderSubtotal;
      }
    }
    if (discountFixed) {
      const fixed = Number.parseFloat(discountFixed);
      if (Number.isFinite(fixed) && fixed > 0 && orderSubtotal > 0) {
        return Math.min(fixed, orderSubtotal);
      }
    }
    return 0;
  }, [discountPct, discountFixed, orderSubtotal]);

  const orderTotal = useMemo(() => {
    return Math.max(0, orderSubtotal - discountAmount);
  }, [orderSubtotal, discountAmount]);

  // Sync discount when percentage changes
  useEffect(() => {
    const pct = Number.parseFloat(discountPct);
    if (Number.isFinite(pct) && pct > 0 && orderSubtotal > 0) {
      setDiscountFixed(((pct / 100) * orderSubtotal).toFixed(0));
    }
  }, [discountPct, orderSubtotal]);

  // Cart handlers
  const handleAddItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (entry) => entry.productId === item.productId && entry.variantId === item.variantId,
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        const existing = updated[existingIdx]!;
        updated[existingIdx] = {
          ...existing,
          stock: item.stock ?? existing.stock ?? null,
          quantity: existing.quantity + 1,
          totalPrice: (existing.quantity + 1) * existing.unitPrice,
        };
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const handleRemoveItem = useCallback((productId: string, variantId?: string | null) => {
    const normalizedVariantId = variantId ?? null;
    setItems((prev) =>
      prev.filter((item) => !(item.productId === productId && (item.variantId ?? null) === normalizedVariantId)),
    );
  }, []);

  const handleUpdateQuantity = useCallback((productId: string, variantId: string | undefined, quantity: number) => {
    if (quantity < 1) return;
    const normalizedVariantId = variantId ?? null;
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId && (item.variantId ?? null) === normalizedVariantId
          ? { ...item, quantity, totalPrice: quantity * item.unitPrice }
          : item,
      ),
    );
  }, []);

  // Customer handlers
  const handleCustomerSelect = useCallback((selectedCustomer: OrderFormCustomer | null) => {
    setCustomer(selectedCustomer);
    setSelectedAddressId(null);
    setAddressRequiredMessage(null);
  }, []);

  const handleCustomerChange = useCallback(() => {
    setCustomer(null);
    setSelectedAddressId(null);
    setAddressRequiredMessage(null);
  }, []);

  const handleAddressChange = useCallback((addressId: string | null) => {
    setSelectedAddressId(addressId);
    setAddressRequiredMessage(addressId ? null : 'Vui lòng chọn địa chỉ giao hàng');
  }, []);

  // Discount handlers
  const handleDiscountPctChange = useCallback((value: string) => {
    setDiscountPct(value);
  }, []);

  const handleDiscountFixedChange = useCallback((value: string) => {
    setDiscountFixed(value);
  }, []);

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!customer) {
      toast.error('Vui lòng chọn khách hàng');
      return;
    }
    if (items.length === 0) {
      toast.error('Vui lòng thêm sản phẩm');
      return;
    }
    if (!selectedAddressId) {
      setAddressRequiredMessage('Vui lòng chọn địa chỉ giao hàng');
      toast.error('Vui lòng chọn địa chỉ giao hàng');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await createAdminOrder({
        customerName: customer.displayName,
        customerPhone: '',
        shippingAddress: selectedAddressId,
        items: items.map((item) => ({
          productId: item.productId,
          variantId: item.variantId ?? undefined,
          quantity: item.quantity,
        })),
      });

      toast.success(`Đã tạo đơn hàng ${result.orderNumber}`);
      // Reset form
      setCustomer(null);
      setItems([]);
      setSelectedAddressId(null);
      setDiscountPct('');
      setDiscountFixed('');
      setOrderNumber('');
      setPaymentMethod('COD');
      // Switch to list tab
      setActiveTab('list');
      // Refresh the list (OrderListPage will reload)
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Lỗi tạo đơn hàng';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [customer, items, selectedAddressId]);

  const isFormValid = Boolean(customer && items.length > 0 && selectedAddressId);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý đơn hàng</h1>
          <p className="text-sm text-gray-500 mt-1">Tạo và theo dõi đơn hàng</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'list' | 'create')}>
        <TabsList className="bg-gray-100">
          <TabsTrigger value="list" className="data-[state=active]:bg-white data-[state=active]:text-primary-600 data-[state=active]:shadow-sm">
            📋 Danh sách
          </TabsTrigger>
          <TabsTrigger value="create" className="data-[state=active]:bg-white data-[state=active]:text-primary-600 data-[state=active]:shadow-sm">
            ➕ Tạo đơn
          </TabsTrigger>
        </TabsList>

        {/* List Tab */}
        <TabsContent value="list">
          <OrderListPage />
        </TabsContent>

        {/* Create Tab */}
        <TabsContent value="create">
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Order Header */}
            <Card padding="md">
              <h2 className="font-semibold text-gray-900 mb-4">Thông tin đơn hàng</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã đơn hàng (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="Để trống để tự động tạo"
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phương thức thanh toán
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Card>

            {/* Main Content - Two Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column - Customer */}
              <div className="space-y-4">
                <Card padding="md">
                  <CustomerSearch
                    onSelect={handleCustomerSelect}
                    onChangeCustomer={handleCustomerChange}
                    selectedCustomer={customer}
                  />
                </Card>

                {/* Address Manager - shown when customer is selected */}
                {customer && customer.userId && (
                  <Card padding="md">
                    <AddressManager
                      userId={customer.userId}
                      selectedAddressId={selectedAddressId}
                      onSelectedAddressChange={handleAddressChange}
                      required={true}
                      requiredMessage={addressRequiredMessage}
                    />
                  </Card>
                )}
              </div>

              {/* Right Column - Products */}
              <Card padding="md">
                <ProductSearch
                  items={items}
                  onAddItem={handleAddItem}
                  onRemoveItem={handleRemoveItem}
                  onUpdateQuantity={handleUpdateQuantity}
                />
              </Card>
            </div>

            {/* Order Summary */}
            {items.length > 0 && (
              <Card padding="md">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Tạm tính ({items.length} sản phẩm)</span>
                    <span className="font-medium">{formatCurrency(orderSubtotal)}₫</span>
                  </div>

                  {discountAmount > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600">
                      <span>Giảm giá</span>
                      <span className="font-medium">-{formatCurrency(discountAmount)}₫</span>
                    </div>
                  )}

                  <div className="border-t pt-3 flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-900">Tổng cộng</span>
                    <span className="text-xl font-bold text-primary-600">{formatCurrency(orderTotal)}₫</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsDiscountModalOpen(true)}
                    >
                      🏷️ Giảm giá
                    </Button>
                    {discountAmount > 0 && (
                      <Badge variant="success" className="text-xs">
                        -{formatCurrency(discountAmount)}₫
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="lg"
                    disabled={!isFormValid || loading}
                    onClick={() => void handleSubmit()}
                  >
                    {loading ? '⏳ Đang tạo...' : `✅ Tạo đơn hàng${orderTotal > 0 ? ` · ${formatCurrency(orderTotal)}₫` : ''}`}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Discount Modal */}
      <DiscountModal
        open={isDiscountModalOpen}
        onClose={() => setIsDiscountModalOpen(false)}
        subtotal={orderSubtotal}
        discountPct={discountPct}
        discountFixed={discountFixed}
        onDiscountPctChange={handleDiscountPctChange}
        onDiscountFixedChange={handleDiscountFixedChange}
      />
    </div>
  );
}
