import axios from 'axios'
import type { InternalAxiosRequestConfig, AxiosResponse } from 'axios'

// ─── Token storage keys ───────────────────────────────────────────────────────

const ACCESS_KEY = 'grana_access'
const REFRESH_KEY = 'grana_refresh'
const LOGIN_PATH = '/login'

// ─── Token helpers (exported so auth pages can call setTokens / clearTokens) ─

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens({ access, refresh }: { access: string; refresh: string }): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function setAccessToken(token: string): void {
  localStorage.setItem(ACCESS_KEY, token)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// ─── Axios instance ───────────────────────────────────────────────────────────

// VITE_API_BASE_URL is "http://127.0.0.1:8000/api/v1" (no trailing slash in .env).
// We append "/" so axios joins baseURL + relative path correctly:
//   "http://127.0.0.1:8000/api/v1/" + "auth/refresh/" → ".../api/v1/auth/refresh/"
const rawBase = import.meta.env.VITE_API_BASE_URL as string | undefined
const baseURL = rawBase ? (rawBase.endsWith('/') ? rawBase : rawBase + '/') : '/api/v1/'

export const api = axios.create({ baseURL })

// ─── Request interceptor — attach access token ────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

// ─── Response interceptor — refresh on 401 ───────────────────────────────────

// Extend the config type to carry the retry flag
interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: unknown) => {
    // Only handle AxiosErrors with a response
    if (!axios.isAxiosError(error) || !error.response || !error.config) {
      return Promise.reject(error)
    }

    const config = error.config as RetryableConfig
    const status = error.response.status

    // Not a 401, or this is already a retry, or this IS the refresh call — pass through
    if (
      status !== 401 ||
      config._retried === true ||
      config.url?.endsWith('auth/refresh/')
    ) {
      return Promise.reject(error)
    }

    const refreshToken = getRefreshToken()

    // No refresh token stored — can't refresh, clear and redirect
    if (!refreshToken) {
      clearTokens()
      window.location.assign(LOGIN_PATH)
      return Promise.reject(error)
    }

    // NOTE: concurrent 401s each trigger their own refresh (no single-flight).
    // Acceptable for now; revisit if it causes refresh storms.

    // Attempt one refresh
    try {
      const refreshResponse = await api.post<{ access: string }>(
        'auth/refresh/',
        { refresh: refreshToken },
      )
      const newAccess = refreshResponse.data.access

      // Store new access token and retry original request with new token
      setAccessToken(newAccess)
      config._retried = true
      config.headers.set('Authorization', `Bearer ${newAccess}`)

      return api.request(config)
    } catch (refreshError) {
      // Refresh failed — clear everything and redirect to login
      clearTokens()
      window.location.assign(LOGIN_PATH)
      return Promise.reject(refreshError)
    }
  },
)

export default api
