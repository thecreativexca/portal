"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

/**
 * Client-side API + UX helpers.
 *
 * - `apiFetch` wraps `fetch` with JSON parsing, error extraction, and a 401
 *   redirect back to /login.
 * - `useApi` is a tiny data hook: loading/error/data + refresh, cancel-safe.
 * - `toastSuccess` / `toastError` are the single toast entry points (the
 *   `<Toaster/>` is already mounted in components/Providers.tsx).
 */

interface ApiErrorBody {
  error?: string;
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);

  if (res.status === 401 && !url.startsWith("/api/auth")) {
    const callbackUrl = encodeURIComponent(
      typeof window !== "undefined" ? window.location.pathname : "/"
    );
    window.location.href = `/login?callbackUrl=${callbackUrl}`;
    throw new Error("Your session has expired. Please sign in again.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      (data as ApiErrorBody | null)?.error || "Something went wrong";
    throw new Error(message);
  }

  return data as T;
}

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Cancel-safe data hook. Pass a stable fetcher or memoize on deps. */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[]
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

export function toastSuccess(message: string): void {
  toast.success(message, { duration: 3000 });
}

export function toastError(message: string): void {
  toast.error(message, { duration: 4000 });
}
