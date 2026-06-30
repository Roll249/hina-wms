'use client';

import { useState, useEffect } from 'react';
import { MapPin, Plus, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import api from '@/lib/api';
import { toast } from 'sonner';

export type CustomerAddress = {
  id: string;
  type: string;
  name: string;
  phone: string;
  street: string;
  ward?: string;
  district?: string;
  city: string;
  province: string;
  country?: string;
  postalCode?: string;
  isDefault?: boolean;
  contactPerson?: string;
  businessPhone?: string;
};

type AddressForm = {
  name: string;
  phone: string;
  street: string;
  ward: string;
  district: string;
  city: string;
  province: string;
  country: string;
  postalCode: string;
};

type Props = {
  userId: string;
  selectedAddressId: string | null;
  onSelectedAddressChange: (addressId: string | null) => void;
  required?: boolean;
  requiredMessage?: string | null;
};

const EMPTY_FORM: AddressForm = {
  name: '',
  phone: '',
  street: '',
  ward: '',
  district: '',
  city: '',
  province: '',
  country: 'Vietnam',
  postalCode: '',
};

export function AddressManager({ userId, selectedAddressId, onSelectedAddressChange, required = false, requiredMessage }: Props) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAddresses();
  }, [userId]);

  async function loadAddresses() {
    setLoading(true);
    try {
      const { data } = await api.get(`/customers/${userId}/addresses`);
      setAddresses(data);
      // Auto-select default address if none selected
      if (!selectedAddressId && data.length > 0) {
        const defaultAddr = data.find((a: CustomerAddress) => a.isDefault) ?? data[0];
        onSelectedAddressChange(defaultAddr?.id ?? null);
      }
    } catch {
      toast.error('Lỗi tải địa chỉ');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddAddress() {
    if (!form.name.trim() || !form.phone.trim() || !form.street.trim() || !form.city.trim()) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post(`/customers/${userId}/addresses`, {
        ...form,
        type: 'DELIVERY',
        isDefault: addresses.length === 0,
      });
      setAddresses((prev) => [...prev, data]);
      onSelectedAddressChange(data.id);
      setShowAddForm(false);
      setForm(EMPTY_FORM);
      toast.success('Đã thêm địa chỉ');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi thêm địa chỉ');
    } finally {
      setSaving(false);
    }
  }

  function handleFormChange(field: keyof AddressForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const formatAddress = (addr: CustomerAddress) => {
    const parts = [addr.street, addr.ward, addr.district, addr.city, addr.province].filter(Boolean);
    return parts.join(', ');
  };

  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Địa chỉ giao hàng</label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAddForm(true)}
        >
          + Thêm địa chỉ
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Đang tải...</p>
      ) : addresses.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa có địa chỉ nào</p>
      ) : (
        <div className="space-y-2">
          {addresses.map((addr) => {
            const isSelected = addr.id === selectedAddressId;
            return (
              <div
                key={addr.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectedAddressChange(addr.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectedAddressChange(addr.id); }}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <div className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">{addr.name}</p>
                    {addr.isDefault && <Badge variant="info" className="text-xs">Mặc định</Badge>}
                  </div>
                  <p className="text-xs text-gray-600">{addr.phone}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate">{formatAddress(addr)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {required && requiredMessage && !selectedAddressId && (
        <p className="text-xs text-red-500">{requiredMessage}</p>
      )}

      <Modal open={showAddForm} onClose={() => setShowAddForm(false)} title="Thêm địa chỉ mới" size="md">
        <div className="p-4 space-y-4">
          <Input
            label="Tên người nhận *"
            value={form.name}
            onChange={(e) => handleFormChange('name', e.target.value)}
            placeholder="Nguyễn Văn A"
          />
          <Input
            label="Số điện thoại *"
            value={form.phone}
            onChange={(e) => handleFormChange('phone', e.target.value)}
            placeholder="0901234567"
            type="tel"
          />
          <Input
            label="Địa chỉ (số nhà, đường) *"
            value={form.street}
            onChange={(e) => handleFormChange('street', e.target.value)}
            placeholder="123 Đường ABC, Phường XYZ"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phường/Xã"
              value={form.ward}
              onChange={(e) => handleFormChange('ward', e.target.value)}
              placeholder="Phường 1"
            />
            <Input
              label="Quận/Huyện"
              value={form.district}
              onChange={(e) => handleFormChange('district', e.target.value)}
              placeholder="Quận 1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Thành phố/Tỉnh *"
              value={form.city}
              onChange={(e) => handleFormChange('city', e.target.value)}
              placeholder="TP Hồ Chí Minh"
            />
            <Input
              label="Tỉnh/Thành"
              value={form.province}
              onChange={(e) => handleFormChange('province', e.target.value)}
              placeholder="Việt Nam"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAddForm(false)} className="flex-1">
              Hủy
            </Button>
            <Button onClick={() => void handleAddAddress()} className="flex-1">
              {saving ? 'Đang lưu...' : 'Thêm địa chỉ'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
