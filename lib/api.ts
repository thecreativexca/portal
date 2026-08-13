import { NextResponse } from "next/server";
import { HttpError } from "./guards";

/**
 * Shared API response helpers.
 *
 * Convention (pragmatic, additive — existing clients are not broken):
 *  - Success responses keep their noun-wrapped body (e.g. `{ users }`) so the
 *    existing pages keep working. `ok()` adds an optional `pagination` meta.
 *  - Errors are always `{ error: string }` (400/401/403/404/409/429/500).
 *  - Deletes normalize to `{ success: true }`.
 */

export function ok<T extends Record<string, unknown>>(
  body: T,
  meta?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(meta ? { ...body, ...meta } : body);
}

export function fail(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function notFound(message = "Not found"): NextResponse {
  return fail(404, message);
}

export function success(): NextResponse {
  return NextResponse.json({ success: true });
}

/**
 * Clamp a page/pageSize query pair into safe integers.
 *
 * Accepts both `pageSize` and the legacy `limit` param (some clients still send
 * `limit`); when neither is present the `defaultPageSize` is used. The response
 * meta always reports `pageSize`.
 */
export function parsePagination(url: string | URL, defaultPageSize = 20) {
  const params =
    url instanceof URL ? url.searchParams : new URL(url).searchParams;
  const rawPage = Number(params.get("page"));
  const rawPageSize =
    Number(params.get("pageSize")) || Number(params.get("limit"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, 200)
      : defaultPageSize;
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

/** Build the standard `pagination` meta object returned on list routes. */
export function paginationMeta(
  total: number,
  page: number,
  pageSize: number
): { pagination: { page: number; pageSize: number; total: number; totalPages: number } } {
  return {
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/** Map any thrown error to a standardized JSON error response. */
export function apiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return fail(error.status, error.message);
  }
  return fail(500, "Something went wrong");
}
