"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";

export interface ScanResult {
  text: string;
  format: string;
  timestamp: number;
}

interface UseScannerOptions {
  onScan: (result: ScanResult) => void;
  enabled?: boolean;
  formats?: BarcodeFormat[];
}

const DEFAULT_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

/**
 * Hook quét mã vạch/QR bằng camera.
 * Cũng hỗ trợ USB scanner (keyboard wedge) - input event listener.
 */
export function useScanner({ onScan, enabled = true, formats = DEFAULT_FORMATS }: UseScannerOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const lastScanRef = useRef<{ text: string; ts: number } | null>(null);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      setError(null);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);

      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 });
      const controls = await reader.decodeFromVideoDevice(
        undefined, // deviceId - undefined = default camera
        videoRef.current,
        (result, _err, ctrl) => {
          if (result) {
            const text = result.getText();
            const now = Date.now();
            // Chống scan trùng lặp trong 1.5s
            if (lastScanRef.current?.text === text && now - lastScanRef.current.ts < 1500) {
              return;
            }
            lastScanRef.current = { text, ts: now };
            onScan({
              text,
              format: result.getBarcodeFormat().toString(),
              timestamp: now,
            });
          }
        },
      );
      controlsRef.current = controls;
      setIsScanning(true);
    } catch (err) {
      setError((err as Error).message);
      setHasCamera(false);
    }
  }, [formats, onScan]);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsScanning(false);
  }, []);

  // USB scanner support - keyboard wedge input
  useEffect(() => {
    if (!enabled) return;
    let buffer = "";
    let lastKeyTime = 0;

    const handleKey = (e: KeyboardEvent) => {
      const now = Date.now();
      // Nếu quá 100ms giữa 2 phím → reset buffer (người gõ tay)
      if (now - lastKeyTime > 100) {
        buffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= 4) {
          onScan({
            text: buffer,
            format: "USB_SCANNER",
            timestamp: now,
          });
        }
        buffer = "";
        return;
      }
      // Chỉ nhận ký tự in được
      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled, onScan]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  return {
    videoRef,
    isScanning,
    error,
    hasCamera,
    startCamera,
    stopCamera,
  };
}
