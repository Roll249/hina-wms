"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Usb } from "lucide-react";
import { useScanner, ScanResult } from "@/hooks/use-scanner";
import { cn } from "@/lib/utils";

interface BarcodeScannerProps {
  onScan: (result: ScanResult) => void;
  enabled?: boolean;
  className?: string;
}

/**
 * Component quét mã vạch tổng hợp:
 * - Camera (mặc định sau) - dùng @zxing/browser
 * - USB Scanner (luôn lắng nghe keyboard wedge input)
 */
export function BarcodeScanner({ onScan, enabled = true, className }: BarcodeScannerProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "usb">("usb");
  const { videoRef, isScanning, error, hasCamera, startCamera, stopCamera } = useScanner({
    onScan,
    enabled,
  });

  useEffect(() => {
    if (activeTab === "camera" && !isScanning) {
      startCamera();
    } else if (activeTab !== "camera" && isScanning) {
      stopCamera();
    }
  }, [activeTab, isScanning, startCamera, stopCamera]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setActiveTab("usb")}
          className={cn(
            "flex-1 py-2 px-3 text-sm font-medium rounded-md flex items-center justify-center gap-2",
            activeTab === "usb" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600",
          )}
        >
          <Usb className="h-4 w-4" /> USB Scanner
        </button>
        <button
          onClick={() => setActiveTab("camera")}
          disabled={!hasCamera}
          className={cn(
            "flex-1 py-2 px-3 text-sm font-medium rounded-md flex items-center justify-center gap-2",
            activeTab === "camera" ? "bg-white text-primary-700 shadow-sm" : "text-gray-600",
            !hasCamera && "opacity-50 cursor-not-allowed",
          )}
        >
          <Camera className="h-4 w-4" /> Camera
        </button>
      </div>

      {activeTab === "camera" ? (
        <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />
          {/* Overlay guide */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-32 border-2 border-primary-400 rounded-lg shadow-lg">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary-400 rounded-tl"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary-400 rounded-tr"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary-400 rounded-bl"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary-400 rounded-br"></div>
            </div>
          </div>
          {isScanning && (
            <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
              ● Đang quét
            </div>
          )}
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
          <Usb className="h-12 w-12 mx-auto text-blue-500 mb-2" />
          <p className="text-sm text-blue-800 font-medium">USB Scanner đang hoạt động</p>
          <p className="text-xs text-blue-600 mt-1">
            Quét mã vạch hoặc nhập tay rồi nhấn Enter
          </p>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <CameraOff className="h-4 w-4" /> {error}
        </p>
      )}
    </div>
  );
}
