'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { searchCustomers, type CustomerListItem } from '@/lib/api/admin-orders';

export type OrderFormCustomer = {
  id: string;
  userId?: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  businessName?: string;
};

type Props = {
  onSelect: (customer: OrderFormCustomer | null) => void;
  onChangeCustomer?: () => void;
  selectedCustomer?: OrderFormCustomer | null;
};

export function CustomerSearch({ onSelect, onChangeCustomer, selectedCustomer }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showDropdown) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      const wrapper = wrapperRef.current;
      if (wrapper && !wrapper.contains(target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showDropdown]);

  async function performSearch(value: string) {
    setLoading(true);
    try {
      const res = await searchCustomers({ search: value, limit: 10 });
      setResults(res);
      setShowDropdown(true);
    } catch {
      setResults([]);
      setShowDropdown(false);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void performSearch(value);
    }, 300);
  }

  function handleSelect(customer: CustomerListItem | null) {
    if (!customer) {
      setQuery('');
      setResults([]);
      setShowDropdown(false);
      onSelect(null);
      return;
    }
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    onSelect({
      id: customer.id,
      userId: customer.userId,
      displayName: customer.businessName || customer.displayName || customer.email || 'Khách hàng',
      email: customer.email || null,
      phone: customer.phone || null,
      businessName: customer.businessName || undefined,
    });
  }

  function handleRemoveCustomer() {
    onSelect(null);
  }

  if (selectedCustomer && selectedCustomer.id) {
    return (
      <div className="flex flex-col gap-sm">
        <label className="text-sm font-medium text-gray-700">Khách hàng</label>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-sm">
            <User className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {selectedCustomer.displayName}
              </p>
              {selectedCustomer.businessName && selectedCustomer.businessName !== selectedCustomer.displayName && (
                <p className="text-xs text-gray-600 truncate">{selectedCustomer.businessName}</p>
              )}
              {selectedCustomer.phone && (
                <p className="text-xs text-gray-500">{selectedCustomer.phone}</p>
              )}
            </div>
            {onChangeCustomer && (
              <div className="flex shrink-0 items-center gap-sm">
                <button
                  type="button"
                  onClick={onChangeCustomer}
                  className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
                >
                  Đổi
                </button>
                <button
                  type="button"
                  onClick={handleRemoveCustomer}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                >
                  Xóa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-sm">
      <label htmlFor="customer-search" className="text-sm font-medium text-gray-700">
        Tìm khách hàng
      </label>
      <div ref={wrapperRef} className="flex gap-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            id="customer-search"
            type="search"
            placeholder="Tìm theo tên, SĐT, email..."
            value={query}
            onChange={(event) => handleSearchChange(event.target.value)}
            onFocus={() => void performSearch(query)}
            className="h-10 w-full pl-10 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />

          {showDropdown && results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
              {results.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelect(customer)}
                  className="flex w-full flex-col gap-1 border-b border-gray-100 px-4 py-3 text-left last:border-b-0 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {customer.businessName || customer.displayName || customer.email || 'Khách hàng'}
                    </span>
                    {customer.isManualOrderCustomer && (
                      <Badge variant="info" className="text-xs">Thủ công</Badge>
                    )}
                  </div>
                  {customer.email && (
                    <span className="text-xs text-gray-500">{customer.email}</span>
                  )}
                  {customer.phone && (
                    <span className="text-xs text-gray-500">📞 {customer.phone}</span>
                  )}
                  {customer.ico && (
                    <span className="text-xs text-gray-400">MST: {customer.ico}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm">
          + Tạo mới
        </Button>
      </div>
      {loading && <p className="text-xs text-gray-500">Đang tìm...</p>}
    </div>
  );
}
