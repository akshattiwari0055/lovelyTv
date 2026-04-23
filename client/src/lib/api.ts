import axios from "axios";

const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";

export const API_BASE_URL = import.meta.env.PROD
  ? "/api"
  : import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export const SOCKET_BASE_URL = import.meta.env.PROD
  ? browserOrigin
  : import.meta.env.VITE_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, "");
const SESSION_KEY = "lputv-session";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { token?: string };
        if (session.token) {
          config.headers = config.headers ?? {};
          config.headers.Authorization = `Bearer ${session.token}`;
        }
      }
    } catch {
      // Ignore malformed local session and let the request fail normally.
    }
  }

  return config;
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
