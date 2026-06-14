/**
 * Tests for api.ts
 *
 * Note: vitest 4 on Node.js 25 shadows jsdom's localStorage with Node's built-in
 * localStorage (triggered by --localstorage-file being passed without a valid path),
 * yielding an object that lacks .setItem() / .clear(). We install a minimal in-memory
 * localStorage polyfill on globalThis BEFORE importing the module under test so that
 * the module picks up the working implementation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { AxiosError, AxiosHeaders } from 'axios'

// ─── Install in-memory localStorage BEFORE module import ────────────────────

const _store: Record<string, string> = {}
const fakeLocalStorage = {
  getItem: (k: string) => _store[k] ?? null,
  setItem: (k: string, v: string) => { _store[k] = String(v) },
  removeItem: (k: string) => { delete _store[k] },
  clear: () => { Object.keys(_store).forEach(k => { delete _store[k] }) },
}
Object.defineProperty(globalThis, 'localStorage', {
  value: fakeLocalStorage,
  configurable: true,
  writable: true,
})

// ─── Import module under test ────────────────────────────────────────────────

import {
  api,
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  setAccessToken,
} from './api'

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeResponse(
  status: number,
  data: unknown,
  config: InternalAxiosRequestConfig,
): AxiosResponse {
  return { status, data, headers: {}, config, statusText: String(status) }
}

function makeAxiosError(
  status: number,
  config: InternalAxiosRequestConfig,
): AxiosError {
  const response: AxiosResponse = makeResponse(status, { detail: 'Unauthorized' }, config)
  return new AxiosError('Request failed', String(status), config, null, response)
}

// ─── Suites ──────────────────────────────────────────────────────────────────

describe('api.ts — token storage helpers', () => {
  beforeEach(() => {
    fakeLocalStorage.clear()
  })

  it('setTokens stores access and refresh', () => {
    setTokens({ access: 'a1', refresh: 'r1' })
    expect(getAccessToken()).toBe('a1')
    expect(getRefreshToken()).toBe('r1')
  })

  it('clearTokens removes both tokens', () => {
    setTokens({ access: 'a1', refresh: 'r1' })
    clearTokens()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})

describe('api.ts — request interceptor', () => {
  beforeEach(() => {
    fakeLocalStorage.clear()
    vi.restoreAllMocks()
  })

  it('attaches Authorization header when access token exists', async () => {
    setTokens({ access: 'access_xyz', refresh: 'refresh_abc' })

    let capturedConfig: InternalAxiosRequestConfig | undefined

    api.defaults.adapter = vi.fn((config: AxiosRequestConfig) => {
      capturedConfig = config as InternalAxiosRequestConfig
      return Promise.resolve(makeResponse(200, { ok: true }, config as InternalAxiosRequestConfig))
    })

    await api.get('some/endpoint/')

    const authHeader = (capturedConfig!.headers as AxiosHeaders).get('Authorization')
    expect(authHeader).toBe('Bearer access_xyz')
  })

  it('sends no Authorization header when no token stored', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined

    api.defaults.adapter = vi.fn((config: AxiosRequestConfig) => {
      capturedConfig = config as InternalAxiosRequestConfig
      return Promise.resolve(makeResponse(200, { ok: true }, config as InternalAxiosRequestConfig))
    })

    await api.get('some/endpoint/')

    const authHeader = (capturedConfig!.headers as AxiosHeaders).get('Authorization')
    expect(authHeader).toBeFalsy()
  })
})

describe('api.ts — 401 → refresh → retry', () => {
  beforeEach(() => {
    fakeLocalStorage.clear()
    vi.restoreAllMocks()
  })

  it('retries with new access token after successful refresh', async () => {
    setTokens({ access: 'old_access', refresh: 'stored_refresh' })

    const adapterCalls: string[] = []

    api.defaults.adapter = vi.fn((config: AxiosRequestConfig) => {
      const ic = config as InternalAxiosRequestConfig
      const url = ic.url ?? ''
      const authHeader = (ic.headers as AxiosHeaders).get('Authorization') as string | null

      if (url.includes('auth/refresh/')) {
        adapterCalls.push('refresh')
        return Promise.resolve(makeResponse(200, { access: 'new_access' }, ic))
      }

      if (authHeader?.includes('old_access')) {
        adapterCalls.push('original-401')
        return Promise.reject(makeAxiosError(401, ic))
      }

      if (authHeader?.includes('new_access')) {
        adapterCalls.push('retry-200')
        return Promise.resolve(makeResponse(200, { data: 'retried' }, ic))
      }

      return Promise.reject(makeAxiosError(500, ic))
    })

    const result = await api.get('protected/')
    expect(result.data).toEqual({ data: 'retried' })
    expect(adapterCalls).toEqual(['original-401', 'refresh', 'retry-200'])
    expect(getAccessToken()).toBe('new_access')
  })

  it('retries exactly once — second 401 does NOT re-refresh', async () => {
    setTokens({ access: 'old_access', refresh: 'stored_refresh' })

    const refreshCalls: number[] = []

    api.defaults.adapter = vi.fn((config: AxiosRequestConfig) => {
      const ic = config as InternalAxiosRequestConfig
      const url = ic.url ?? ''

      if (url.includes('auth/refresh/')) {
        refreshCalls.push(1)
        return Promise.resolve(makeResponse(200, { access: 'new_access' }, ic))
      }

      // Always 401 — simulates persistent auth failure after retry
      return Promise.reject(makeAxiosError(401, ic))
    })

    await expect(api.get('protected/')).rejects.toThrow()
    // Refresh should only be attempted once (not in an infinite loop)
    expect(refreshCalls.length).toBe(1)
  })

  it('clears tokens and redirects to /login when refresh 401s', async () => {
    setTokens({ access: 'old_access', refresh: 'stored_refresh' })

    const assignSpy = vi.fn()
    vi.stubGlobal('location', {
      href: '',
      assign: assignSpy,
    })

    api.defaults.adapter = vi.fn((config: AxiosRequestConfig) => {
      const ic = config as InternalAxiosRequestConfig
      const url = ic.url ?? ''

      if (url.includes('auth/refresh/')) {
        return Promise.reject(makeAxiosError(401, ic))
      }

      return Promise.reject(makeAxiosError(401, ic))
    })

    await expect(api.get('protected/')).rejects.toBeDefined()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(assignSpy).toHaveBeenCalledWith('/login')
  })

  it('clears tokens and redirects when no refresh token stored', async () => {
    // Only access token, no refresh token
    setAccessToken('some_access')

    const assignSpy = vi.fn()
    vi.stubGlobal('location', {
      href: '',
      assign: assignSpy,
    })

    api.defaults.adapter = vi.fn((config: AxiosRequestConfig) => {
      const ic = config as InternalAxiosRequestConfig
      return Promise.reject(makeAxiosError(401, ic))
    })

    await expect(api.get('protected/')).rejects.toBeDefined()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(assignSpy).toHaveBeenCalledWith('/login')
  })
})

describe('api.ts — baseURL construction', () => {
  it('base URL ends with a slash so relative paths join correctly', () => {
    // baseURL from env "http://127.0.0.1:8000/api/v1" is normalized to end with "/"
    // so axios joins: ".../api/v1/" + "auth/refresh/" → ".../api/v1/auth/refresh/"
    expect(api.defaults.baseURL).toMatch(/\/$/)
  })
})
