'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, Package } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { searchProductsForAdminOrder, type ProductSearchResult } from '@/lib/api/admin-orders';
import { formatNumber } from '@/lib/utils';

export type CartItem = {
  productId: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  productCode: string;
  sku?: string | null;
  stock?: number | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  basePrice: number;
  attributes?: any;
};

type Props = {
  items: CartItem[];
  onAddItem: (item: CartItem) => void;
  onRemoveItem: (productId: string, variantId?: string | null) => void;
  onUpdateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  onSearchCatalog?: () => void;
};

function getProductImageUrl(product: ProductSearchResult): string | null {
  return product.imageUrl ?? null;
}

export function ProductSearch({ items, onAddItem, onRemoveItem, onUpdateQuantity, onSearchCatalog }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQuantityDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        const key = `${item.productId}-${item.variantId ?? 'none'}`;
        if (prev[key] !== undefined) {
          next[key] = prev[key];
        }
      }
      return next;
    });
  }, [items]);

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
      const res = await searchProductsForAdminOrder(value);
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

  function handleSearchFocus() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void performSearch(query);
  }

  function handleAdd(product: ProductSearchResult, variant?: ProductVariant) {
    const productId = variant ? variant.id : product.id;
    const parentId = product.id;
    const productName = variant ? `${product.name} - ${variant.name}` : product.name;
    const unitPrice = variant ? variant.basePrice : product.basePrice;
    const stock = product.available;
    const sku = variant?.sku ?? product.sku;
    const productCode = variant?.sku ?? product.productCode;

    onAddItem({
      productId: parentId,
      variantId: variant?.id,
      productName,
      variantName: variant?.name,
      productCode,
      sku,
      stock,
      quantity: 1,
      unitPrice,
      totalPrice: unitPrice,
    });
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  }

  function subtotal(): number {
    return items.reduce((sum, item) => sum + item.totalPrice, 0);
  }

  function handleQuantityChange(item: CartItem, value: string) {
    if (!/^\d*$/.test(value)) return;
    const key = `${item.productId}-${item.variantId ?? 'none'}`;
    setQuantityDrafts((prev) => ({ ...prev, [key]: value }));
    if (value === '') return;
    const parsedQuantity = Number.parseInt(value, 10);
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 1) return;
    onUpdateQuantity(item.productId, item.variantId ?? undefined, parsedQuantity);
  }

  function handleQuantityBlur(item: CartItem) {
    const key = `${item.productId}-${item.variantId ?? 'none'}`;
    const draftValue = quantityDrafts[key];
    if (draftValue === undefined) return;
    if (draftValue === '') {
      setQuantityDrafts((prev) => ({ ...prev, [key]: String(item.quantity) }));
      return;
    }
    const parsedQuantity = Number.parseInt(draftValue, 10);
    if (Number.isNaN(parsedQuantity) || parsedQuantity < 1) {
      setQuantityDrafts((prev) => ({ ...prev, [key]: String(item.quantity) }));
      return;
    }
    setQuantityDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-sm">
        <div className="flex items-center justify-between gap-sm">
          <label htmlFor="product-search" className="text-sm font-medium text-gray-700">
            Thêm sản phẩm
          </label>
          {onSearchCatalog && (
            <Button type="button" variant="secondary" size="sm" onClick={onSearchCatalog}>
              🔍 Tìm trong catalog
            </Button>
          )}
        </div>
        <div ref={wrapperRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              id="product-search"
              type="search"
              placeholder="Tìm theo mã SP, SKU hoặc tên..."
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={handleSearchFocus}
              className="h-10 w-full pl-10 pr-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {showDropdown && results.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-[400px] w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {results.map((product) => (
                <div key={product.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAdd(product)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleAdd(product);
                      }
                    }}
                    className="flex cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-3 transition-colors hover:bg-gray-50 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100 flex items-center justify-center">
                        {getProductImageUrl(product) ? (
                          <img src={getProductImageUrl(product)!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Package className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {product.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="text-[10px] text-gray-500 font-mono">{product.productCode}</code>
                          <span className="text-xs text-primary-600 font-semibold">
                            {formatNumber(product.basePrice)}₫
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={product.available > 0 ? 'success' : 'danger'} className="text-xs">
                        Tồn: {product.available}
                      </Badge>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleAdd(product);
                        }}
                      >
                        + Thêm
                      </Button>
                    </div>
                  </div>
                  {product.variants && product.variants.length > 0 && (
                    <div className="bg-gray-50/50">
                      {product.variants.map((variant) => (
                        <div
                          key={variant.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleAdd(product, variant)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleAdd(product, variant);
                            }
                          }}
                          className="flex cursor-pointer items-center justify-between border-b border-gray-100 px-4 py-2 text-xs hover:bg-gray-100 last:border-b-0"
                        >
                          <span className="text-gray-700 truncate">
                            ↳ {variant.name}
                            <code className="ml-2 text-[10px] text-gray-500 font-mono">{variant.sku}</code>
                          </span>
                          <span className="text-primary-600 font-semibold ml-2">
                            {formatNumber(variant.basePrice)}₫
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {loading && <p className="text-xs text-gray-500">Đang tìm...</p>}
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-sm">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col />
                <col className="w-[140px]" />
                <col className="w-[100px]" />
                <col className="w-[100px]" />
                <col className="w-[130px]" />
                <col className="w-[48px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-3 text-left font-medium text-gray-700">Sản phẩm</th>
                  <th className="p-3 text-left font-medium text-gray-700">SKU</th>
                  <th className="p-3 text-right font-medium text-gray-700">Đơn giá</th>
                  <th className="p-3 text-center font-medium text-gray-700">SL</th>
                  <th className="p-3 text-right font-medium text-gray-700">Tổng</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const key = `${item.productId}-${item.variantId ?? 'none'}`;
                  const inputValue = quantityDrafts[key] ?? String(item.quantity);
                  return (
                    <tr key={key} className="border-b border-gray-100 last:border-b-0">
                      <td className="p-3 text-gray-900">
                        <div className="flex flex-col gap-0.5">
                          <span className="truncate text-sm font-medium">{item.productName}</span>
                          {item.variantName && (
                            <span className="truncate text-xs text-gray-500">{item.variantName}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-gray-500">
                        <span className="block truncate">{item.sku || item.productCode || '—'}</span>
                      </td>
                      <td className="whitespace-nowrap p-3 text-right text-sm text-gray-900">
                        {formatNumber(item.unitPrice)}₫
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={inputValue}
                            onChange={(e) => handleQuantityChange(item, e.target.value)}
                            onBlur={() => handleQuantityBlur(item)}
                            className="h-8 w-full rounded-md border border-gray-300 px-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap p-3 text-right text-sm font-semibold text-gray-900">
                        {formatNumber(item.totalPrice)}₫
                      </td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item.productId, item.variantId ?? undefined)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-4 px-3 py-2">
            <span className="text-sm font-semibold text-gray-700">
              Tạm tính: <span className="text-primary-600">{formatNumber(subtotal())}₫</span>
            </span>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">Chưa có sản phẩm nào</p>
      )}
    </div>
  );
}
