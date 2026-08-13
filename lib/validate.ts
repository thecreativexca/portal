import mongoose from "mongoose";

/**
 * Lightweight request-body validation helpers.
 *
 * Usage:
 *   const err = validate(body, {
 *     title: reqString("Title", 200),
 *     status: enumValue(["open", "done"], "status"),
 *     amount: number(0, 1_000_000_000, "amount"),
 *   });
 *   if (err) return fail(400, err);
 *
 * Each validator returns an error message string, or null when valid.
 */

type Validator = (value: unknown, body: Record<string, unknown>) => string | null;

export type Rules = Record<string, Validator>;

/** Run every rule; return the first failure message, or null if all pass. */
export function validate(body: unknown, rules: Rules): string | null {
  const record = (body ?? {}) as Record<string, unknown>;
  for (const [field, rule] of Object.entries(rules)) {
    const message = rule(record[field], record);
    if (message) return message;
  }
  return null;
}

export function reqString(label: string, maxLen = 500): Validator {
  return (value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return `${label} is required`;
    }
    if (value.trim().length > maxLen) {
      return `${label} must be ${maxLen} characters or fewer`;
    }
    return null;
  };
}

export function optString(label: string, maxLen = 500): Validator {
  return (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") return `${label} must be a string`;
    if (value.length > maxLen) {
      return `${label} must be ${maxLen} characters or fewer`;
    }
    return null;
  };
}

export function email(label = "email"): Validator {
  return (value) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      return `${label} is required`;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return `${label} must be a valid email`;
    }
    return null;
  };
}

export function enumValue(allowed: readonly string[], label: string): Validator {
  return (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !allowed.includes(value)) {
      return `${label} must be one of: ${allowed.join(", ")}`;
    }
    return null;
  };
}

export function number(min?: number, max?: number, label = "value"): Validator {
  return (value) => {
    if (value === undefined || value === null || value === "") return null;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return `${label} must be a number`;
    if (min !== undefined && n < min) return `${label} must be at least ${min}`;
    if (max !== undefined && n > max) return `${label} must be at most ${max}`;
    return null;
  };
}

export function date(label = "date"): Validator {
  return (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? `${label} is invalid` : null;
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return null;
    return `${label} is invalid`;
  };
}

export function objectId(label = "id"): Validator {
  return (value) => {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string" || !mongoose.Types.ObjectId.isValid(value)) {
      return `${label} is invalid`;
    }
    return null;
  };
}
