import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { listAdminOrders, type OrderListItem, type OrderSource, type ListOrdersParams } from '@/lib/api/admin-orders';
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

const SOURCE_LABELS: Record<OrderSource, { label: string; bg: string; text: string }> = {
  WEB: { label: '🌐 Web', bg: 'bg-sky-100', text: 'text-sky-800' },
  WMS: { label: '📦 WMS', bg: 'bg-purple-100', text: 'text-purple-800' },
  ADMIN_WEB: { label: '⚙️ Admin', bg: 'bg-slate-100', text: 'text-slate-800' },
};

const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ pick',
  PICKING: 'Đang pick',
  PICKED: 'Đã pick',
  PACKING: 'Đang đóng gói',
  PACKED: 'Đã đóng gói',
  HANDED_OVER: 'Đã bàn giao',
  CANCELLED: 'Đã hủy',
};

export function OrderListPage() {
  const router = useRouter();
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ListOrdersParams>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await listAdminOrders({ ...filters, page, pageSize });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: any) {
      toast.error('Lỗi tải đơn hàng: ' + (e?.response?.data?.message || e?.message));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, JSON.stringify(filters)]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng</h1>
          <p className="text-sm text-gray-500 mt-1">Tổng cộng {total} đơn</p>
        </div>
        <Link
          href="/orders/create"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
        >
          <span>➕</span> Tạo đơn mới
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Tìm theo mã đơn, tên, SĐT..."
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={filters.source ?? ''}
            onChange={(e) => setFilters({ ...filters, source: (e.target.value as OrderSource) || undefined })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả nguồn</option>
            <option value="WMS">📦 WMS (Kho tạo)</option>
            <option value="WEB">🌐 Web (Khách đặt)</option>
            <option value="ADMIN_WEB">⚙️ Admin Web</option>
          </select>
          <select
            value={filters.status ?? ''}
            onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả trạng thái</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setFilters({});
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50"
          >
            Xóa bộ lọc
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Chưa có đơn hàng nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Mã đơn</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3">Nguồn</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Xuất kho</th>
                  <th className="px-4 py-3 text-right">Tổng tiền</th>
                  <th className="px-4 py-3">Ngày tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((o) => {
                  const statusInfo = STATUS_LABELS[o.status] ?? { label: o.status, bg: 'bg-gray-100', text: 'text-gray-800' };
                  const sourceInfo = SOURCE_LABELS[o.source] ?? { label: o.source, bg: 'bg-gray-100', text: 'text-gray-800' };
                  return (
                    <tr
                      key={o.id}
                      onClick={() => router.push(`/orders/${o.id}`)}
                      className="hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-mono text-blue-600 font-medium">
                        {o.orderNumber}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {typeof o.shippingAddress === 'object' ? o.shippingAddress?.name : '-'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {typeof o.shippingAddress === 'object' ? o.shippingAddress?.phone : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sourceInfo.bg} ${sourceInfo.text}`}>
                          {sourceInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {o.shipment ? (
                          <span className="text-xs text-gray-700">
                            {SHIPMENT_STATUS_LABELS[o.shipment.status] ?? o.shipment.status}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {o.total.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(o.createdAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Trang {page} / {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              ← Trước
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              Sau →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
