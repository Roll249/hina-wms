"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";

export interface SseMessage<T = any> {
  type: string;
  data: T;
  id?: string;
}

/**
 * Subscribe SSE stream từ backend.
 * Tự động reconnect khi mất kết nối.
 *
 * @param url - SSE endpoint, ví dụ '/sse/stream'
 * @param onMessage - callback khi có message
 */
export function useSse<T = any>(
  url: string,
  onMessage: (msg: SseMessage<T>) => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const connect = () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7777";
        // EventSource không hỗ trợ custom header, dùng query param token
        // Đọc từ Zustand store để tránh race condition với hydration
        const token = useAuthStore.getState().accessToken;
        const fullUrl = `${apiBase}${url}${token ? `?token=${token}` : ""}`;

        const es = new EventSource(fullUrl, { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          setIsConnected(true);
          setError(null);
          reconnectAttempts.current = 0;
        };

        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as SseMessage<T>;
            onMessage(msg);
          } catch (err) {
            // Có thể là heartbeat text - bỏ qua
          }
        };

        es.onerror = () => {
          setIsConnected(false);
          es.close();

          // Auto-reconnect với exponential backoff
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
          reconnectAttempts.current += 1;
          setError(`Đang kết nối lại (lần ${reconnectAttempts.current})...`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };
      } catch (err) {
        setError((err as Error).message);
      }
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      eventSourceRef.current?.close();
    };
  }, [url, enabled]);

  return { isConnected, error };
}
