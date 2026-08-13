import mongoose from "mongoose";
import { httpError } from "./guards";

/**
 * Shared ObjectId helpers. Replaces the inline `toObjectId()` copies that were
 * duplicated across ~12 route files.
 */

/** Validate a route param / body id and convert it to a Mongoose ObjectId. */
export function toObjectId(id: string | undefined, label = "id"): mongoose.Types.ObjectId {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw httpError(400, `Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(id);
}

/**
 * Null-safe variant for OPTIONAL ids (query filters, best-effort validation).
 * Returns null when `id` is absent or malformed instead of throwing, so callers
 * can treat it as "skip this filter".
 */
export function toObjectIdOrNull(id: string | undefined): mongoose.Types.ObjectId | null {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return null;
  }
  return new mongoose.Types.ObjectId(id);
}

/** Convenience for the CEO dashboard routes: convert a companyId string. */
export function companyObjectId(companyId: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(companyId);
}
