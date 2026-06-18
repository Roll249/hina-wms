import api from '../api';

// ===== Types =====
export type OrderSource = 'WEB' | 'WMS' | 'ADMIN_WEB';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string | null;
  productCode: string;
  productName: string;
  variantName?: string | null;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discountAmount?: number;
  taxAmount?: number;
}

export interface OrderCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
  role?: string;
  isActive?: boolean;
}

export interface OrderShipment {
  id: string;
  shipmentNumber: string;
  status: string;
  pickedAt?: string | null;
  packedAt?: string | null;
  handedOverAt?: string | null;
  carrierName?: string | null;
  trackingNumber?: string | null;
  warehouse?: { id: string; code: string; name: string };
  pickedBy?: { id: string; employeeCode: string; user: { name: string } };
  items?: any[];
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  customerId: string;
  wholesaleCustomerId?: string | null;
  customer?: OrderCustomer;
  shippingAddress: any;
  items: Pick<OrderItem, 'id'>[];
  itemCount?: number;
  subtotal: number;
  total: number;
  status: OrderStatus;
  source: OrderSource;
  isHiddenFromWeb: boolean;
  paymentMethod?: string;
  paymentStatus?: string;
  paidAt?: string | null;
  customerNote?: string | null;
  createdAt: string;
  updatedAt: string;
  shipment?: { id: string; status: string; shipmentNumber: string } | null;
}

export interface OrderDetail extends OrderListItem {
  items: OrderItem[];
  statusHistory?: Array<{
    id: string;
    status: string;
    note?: string;
    changedBy?: string;
    createdAt: string;
  }>;
  shipment?: OrderShipment | null;
}

export interface ListOrdersParams {
  source?: OrderSource;
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface ListOrdersResponse {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateOrderPayload {
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  customerNote?: string;
  items: Array<{ productId: string; variantId?: string; quantity: number }>;
}

export interface UpdateStatusPayload {
  status: OrderStatus;
  note?: string;
}

export interface CustomerListItem {
  id: string;
  wholesaleCustomerId: string;
  userId?: string;
  displayName?: string;
  email?: string | null;
  phone?: string | null;
  businessName?: string;
  ico?: string | null;
  dic?: string | null;
  taxId?: string | null;
  isManualOrderCustomer: boolean;
  defaultDeliveryAddressId?: string | null;
  defaultCompanyAddressId?: string | null;
  addresses?: Array<{
    id: string;
    type: string;
    name: string;
    phone: string;
    street: string;
    ward?: string;
    district?: string;
    city: string;
    province: string;
    isDefault: boolean;
  }>;
}

export interface ProductSearchResult {
  id: string;
  productCode: string;
  sku: string;
  name: string;
  basePrice: number;
  available: number;
  imageUrl?: string | null;
  variants?: Array<{
    id: string;
    sku: string;
    name: string;
    basePrice: number;
    attributes?: any;
  }>;
}

// ===== Orders =====
export async function listAdminOrders(params: ListOrdersParams = {}): Promise<ListOrdersResponse> {
  const { data } = await api.get('/admin/orders', { params });
  return data;
}

export async function getAdminOrder(id: string): Promise<OrderDetail> {
  const { data } = await api.get(`/admin/orders/${id}`);
  return data;
}

export async function createAdminOrder(payload: CreateOrderPayload): Promise<OrderDetail> {
  const { data } = await api.post('/admin/orders', payload);
  return data;
}

export async function updateOrderStatus(id: string, payload: UpdateStatusPayload): Promise<OrderDetail> {
  const { data } = await api.patch(`/admin/orders/${id}/status`, payload);
  return data;
}

export async function searchProductsForAdminOrder(q: string): Promise<ProductSearchResult[]> {
  const { data } = await api.get('/admin/orders/search-products', { params: { q } });
  return data;
}

// ===== Customers =====
export async function searchCustomers(params: { search?: string; limit?: number } = {}): Promise<CustomerListItem[]> {
  const { data } = await api.get('/customers', { params });
  return data;
}

export async function createManualCustomer(payload: {
  name: string;
  businessId?: string;
  taxId?: string;
  dic?: string;
  deliveryAddress: {
    name: string;
    phone: string;
    street: string;
    ward?: string;
    district?: string;
    city: string;
    province: string;
    country?: string;
    postalCode?: string;
  };
  companyAddress?: any;
}): Promise<CustomerListItem> {
  const { data } = await api.post('/customers', payload);
  return data;
}
