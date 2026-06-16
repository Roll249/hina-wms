import axios, { AxiosError } from "axios";
import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7777";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Tự động gắn accessToken từ Zustand store (đã persist vào localStorage)
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    // Đọc trực tiếp từ Zustand persist storage (key = "wms-auth-storage")
    // để tránh race condition giữa hydration của store và request đầu tiên
    const raw = localStorage.getItem("wms-auth-storage");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const token = parsed?.state?.accessToken;
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          console.warn("[api] no accessToken in wms-auth-storage");
        }
      } catch (e) {
        console.warn("[api] failed to parse wms-auth-storage:", e);
      }
    } else {
      console.warn("[api] no wms-auth-storage in localStorage (URL:", config.url, ")");
    }
  }
  return config;
});

// Tự động refresh token khi 401
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Đọc refresh token từ Zustand persist storage
        const raw = typeof window !== "undefined" ? localStorage.getItem("wms-auth-storage") : null;
        const refreshToken = raw ? (JSON.parse(raw)?.state?.refreshToken ?? null) : null;
        if (!refreshToken) throw new Error("No refresh token");

        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        // Cập nhật cả Zustand store và persist storage
        const store = useAuthStore.getState();
        store.setAuth(store.user!, data.accessToken, data.refreshToken);

        refreshSubscribers.forEach((cb) => cb(data.accessToken));
        refreshSubscribers = [];

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (err) {
        // Refresh fail → clear token + redirect
        useAuthStore.getState().clearAuth();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
