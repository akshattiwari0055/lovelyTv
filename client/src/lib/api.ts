import axios from "axios";

export const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
export const SOCKET_BASE_URL =
  import.meta.env.VITE_SOCKET_URL || API_BASE_URL.replace(/\/api\/?$/, "");

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}
