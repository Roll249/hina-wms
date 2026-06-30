'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { formatNumber } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  subtotal: number;
  discountPct: string;
  discountFixed: string;
  onDiscountPctChange: (value: string) => void;
  onDiscountFixedChange: (value: string) => void;
};

export function DiscountModal({
  open,
  onClose,
  subtotal,
  discountPct,
  discountFixed,
  onDiscountPctChange,
  onDiscountFixedChange,
}: Props) {
  const [localPct, setLocalPct] = useState(discountPct);
  const [localFixed, setLocalFixed] = useState(discountFixed);

  useEffect(() => {
    setLocalPct(discountPct);
    setLocalFixed(discountFixed);
  }, [discountPct, discountFixed, open]);

  function handlePctChange(value: string) {
    setLocalPct(value);
    const pct = Number.parseFloat(value);
    if (!Number.isFinite(pct) || pct <= 0 || subtotal <= 0) {
      setLocalFixed('');
      return;
    }
    setLocalFixed(((pct / 100) * subtotal).toFixed(0));
  }

  function handleFixedChange(value: string) {
    setLocalFixed(value);
    const fixed = Number.parseFloat(value);
    if (!Number.isFinite(fixed) || fixed <= 0 || subtotal <= 0) {
      setLocalPct('');
      return;
    }
    const pct = (fixed / subtotal) * 100;
    setLocalPct(pct > 100 ? '100' : pct.toFixed(2));
  }

  function handleApply() {
    onDiscountPctChange(localPct);
    onDiscountFixedChange(localFixed);
    onClose();
  }

  function handleClear() {
    setLocalPct('');
    setLocalFixed('');
  }

  const previewDiscount = () => {
    const pct = Number.parseFloat(localPct);
    if (Number.isFinite(pct) && pct > 0 && subtotal > 0) {
      return ((pct / 100) * subtotal);
    }
    const fixed = Number.parseFloat(localFixed);
    if (Number.isFinite(fixed) && fixed > 0 && subtotal > 0) {
      return fixed;
    }
    return 0;
  };

  return (
    <Modal open={open} onClose={onClose} title="Áp dụng giảm giá" size="sm">
      <div className="p-4 space-y-4">
        <div>
          <Input
            label="Giảm theo phần trăm (%)"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={localPct}
            onChange={(e) => handlePctChange(e.target.value)}
            placeholder="0"
            hint="Ví dụ: 10 = giảm 10%"
          />
        </div>
        <div>
          <Input
            label="Giảm theo số tiền (₫)"
            type="number"
            min={0}
            step={1000}
            value={localFixed}
            onChange={(e) => handleFixedChange(e.target.value)}
            placeholder="0"
            hint="Ví dụ: 50000 = giảm 50.000đ"
          />
        </div>
        {previewDiscount() > 0 && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-sm text-green-700">
              Số tiền giảm: <span className="font-semibold">{formatNumber(previewDiscount())}₫</span>
            </p>
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleClear} className="flex-1">
            Xóa giảm giá
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Áp dụng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
