'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getAdminOrder, updateOrderStatus, type OrderDetail, type OrderStatus } from '@/lib/api/admin-orders';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  PENDING: { label: 'Chờ xác nhận', bg: 'bg-yellow-100', text: 'text-yellow-800' },
  CONFIRMED: { label: 'Đã xác nhận', bg: 'bg-blue-100', text: 'text-blue-800' },
  PROCESSING: { label: 'Đang xử lý', bg: 'bg-indigo-100', text: 'text-indigo-800' },
  DELIVERED: { label: 'Đã giao', bg: 'bg-green-100', text: 'text-green-800' },
  COMPLETED: { label: 'Hoàn tất', bg: 'bg-green-200', text: 'text-green-900' },
  CANCELLED: { label: 'Đã hủy', bg: 'bg-red-100', text: 'text-red-800' },
  REFUNDED: { label: 'Hoàn tiền', bg: 'bg-orange-100', text: 'text-orange-800' },
};

const SOURCE_LABELS: Record<string, string> = {
  WEB: '🌐 Web',
  WMS: '📦 WMS',
  ADMIN_WEB: '⚙️ Admin',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getAdminOrder(params.id);
      setOrder(data);
    } catch (e: any) {
      toast.error('Lỗi tải đơn: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) load();
  }, [params.id]);

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!order) return;
    if (!confirm(`Đổi trạng thái đơn ${order.orderNumber} sang "${STATUS_LABELS[newStatus]?.label}"?`)) {
      return;
    }
    try {
      const updated = await updateOrderStatus(order.id, { status: newStatus, note: 'Cập nhật từ WMS' });
      setOrder(updated);
      toast.success('Đã cập nhật trạng thái');
    } catch (e: any) {
      toast.error('Lỗi: ' + (e?.response?.data?.message || e?.message));
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Đang tải...</div>;
  }
  if (!order) {
    return <div className="p-6 text-center text-red-600">Không tìm thấy đơn hàng</div>;
  }

  const statusInfo = STATUS_LABELS[order.status] ?? { label: order.status, bg: 'bg-gray-100', text: 'text-gray-800' };
  const ship = order.shippingAddress as any;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-500 hover:text-gray-700 mb-1"
          >
            ← Quay lại
          </button>
          <h1 className="text-2xl font-bold text-gray-900 font-mono">{order.orderNumber}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tạo lúc {new Date(order.createdAt).toLocaleString('vi-VN')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
            {statusInfo.label}
          </span>
          <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
            {SOURCE_LABELS[order.source] ?? order.source}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Customer + Items */}
        <div className="lg:col-span-2 space-y-4">
          {/* Customer */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Khách hàng</h2>
            <div className="space-y-1.5 text-sm">
              <div><span className="text-gray-500">Tên:</span> <strong>{ship?.name ?? '-'}</strong></div>
              <div><span className="text-gray-500">SĐT:</span> {ship?.phone ?? '-'}</div>
              <div><span className="text-gray-500">Địa chỉ:</span> {ship?.address ?? '-'}</div>
              {order.customerNote && (
                <div><span className="text-gray-500">Ghi chú:</span> {order.customerNote}</div>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Sản phẩm ({order.items.length})</h2>
            <div className="divide-y divide-gray-100">
              {order.items.map((it) => (
                <div key={it.id} className="py-2.5 flex items-center gap-3">
                  {it.imageUrl && (
                    <img
                      src={it.imageUrl}
                      alt={it.productName}
                      className="w-12 h-12 object-cover rounded border border-gray-200"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{it.productName}</div>
                    {it.variantName && (
                      <div className="text-xs text-gray-500">{it.variantName}</div>
                    )}
                    <div className="text-xs text-gray-500 font-mono">{it.productCode}</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-gray-900">{it.quantity} × {it.unitPrice.toLocaleString('vi-VN')}đ</div>
                    <div className="font-semibold text-gray-900">{it.totalPrice.toLocaleString('vi-VN')}đ</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Tạm tính</span>
                <span>{order.subtotal.toLocaleString('vi-VN')}đ</span>
              </div>
              <div className="flex justify-between font-bold text-base text-gray-900">
                <span>Tổng cộng</span>
                <span>{order.total.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          </div>

          {/* Status History */}
          {order.statusHistory && order.statusHistory.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Lịch sử trạng thái</h2>
              <div className="space-y-2 text-sm">
                {order.statusHistory.map((h) => {
                  const info = STATUS_LABELS[h.status] ?? { label: h.status, bg: 'bg-gray-100', text: 'text-gray-800' };
                  return (
                    <div key={h.id} className="flex items-start gap-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${info.bg} ${info.text}`}>
                        {info.label}
                      </span>
                      <div className="flex-1">
                        {h.note && <div className="text-gray-700">{h.note}</div>}
                        <div className="text-xs text-gray-500">
                          {new Date(h.createdAt).toLocaleString('vi-VN')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Shipment + Actions */}
        <div className="space-y-4">
          {/* Actions */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Thao tác</h2>
            <div className="space-y-2">
              {order.status === 'PENDING' && (
                <button
                  onClick={() => handleStatusChange('CONFIRMED')}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Xác nhận đơn
                </button>
              )}
              {order.status === 'CONFIRMED' && (
                <button
                  onClick={() => handleStatusChange('PROCESSING')}
                  className="w-full px-3 py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                >
                  Bắt đầu xử lý
                </button>
              )}
              {order.status === 'PROCESSING' && (
                <button
                  onClick={() => handleStatusChange('DELIVERED')}
                  className="w-full px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                >
                  Đã giao hàng
                </button>
              )}
              {order.status === 'DELIVERED' && (
                <button
                  onClick={() => handleStatusChange('COMPLETED')}
                  className="w-full px-3 py-2 bg-green-700 text-white rounded text-sm hover:bg-green-800"
                >
                  Hoàn tất đơn
                </button>
              )}
              {['PENDING', 'CONFIRMED', 'PROCESSING'].includes(order.status) && (
                <button
                  onClick={() => handleStatusChange('CANCELLED')}
                  className="w-full px-3 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                >
                  Hủy đơn
                </button>
              )}
            </div>
          </div>

          {/* Shipment */}
          {order.shipment && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Phiếu xuất kho</h2>
              <div className="space-y-1.5 text-sm">
                <div className="font-mono text-blue-600 font-medium">
                  {order.shipment.shipmentNumber}
                </div>
                <div><span className="text-gray-500">Kho:</span> {order.shipment.warehouse?.name ?? '-'}</div>
                <div><span className="text-gray-500">Trạng thái:</span> {order.shipment.status}</div>
                {order.shipment.pickedBy && (
                  <div><span className="text-gray-500">NV Pick:</span> {order.shipment.pickedBy.user.name} ({order.shipment.pickedBy.employeeCode})</div>
                )}
                {order.shipment.carrierName && (
                  <div><span className="text-gray-500">ĐVVC:</span> {order.shipment.carrierName}</div>
                )}
                {order.shipment.trackingNumber && (
                  <div><span className="text-gray-500">Mã vận đơn:</span> {order.shipment.trackingNumber}</div>
                )}
                <Link
                  href="/ship"
                  className="inline-block mt-2 text-xs text-blue-600 hover:underline"
                >
                  Xem chi tiết phiếu xuất →
                </Link>
              </div>
            </div>
          )}

          {/* Payment */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="font-semibold text-gray-900 mb-3">Thanh toán</h2>
            <div className="space-y-1.5 text-sm">
              <div><span className="text-gray-500">Phương thức:</span> {order.paymentMethod ?? '-'}</div>
              <div><span className="text-gray-500">Trạng thái:</span> {order.paymentStatus ?? '-'}</div>
              {order.paidAt && (
                <div><span className="text-gray-500">Đã thanh toán:</span> {new Date(order.paidAt).toLocaleString('vi-VN')}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
