import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import dbConnect from "./db";
import User, { IUser } from "@/models/User";
import Role from "@/models/Role";

/**
 * Small error type carrying an HTTP status so route handlers can map it to a
 * proper JSON response. The CEO role is always granted full access.
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function httpError(status: number, message: string): HttpError {
  return new HttpError(status, message);
}

/** Map any thrown error to a NextResponse. Unknown errors become 500. */
export function handleApiError(error: unknown): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("API error:", error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

/** True when a Mongoose operation failed on a unique-index violation. */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

/** Resolve the authenticated user from the NextAuth JWT session. */
export async function getCurrentUser(): Promise<IUser> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    throw httpError(401, "Unauthorized");
  }

  await dbConnect();
  const user = await User.findById(userId);
  if (!user) {
    throw httpError(401, "Account no longer exists");
  }
  if (user.status === "inactive") {
    throw httpError(403, "Your account has been deactivated");
  }
  return user;
}

/** Check the user's role document grants any of the given permission keys. */
export async function assertPermission(
  user: IUser,
  ...permissions: string[]
): Promise<void> {
  if (user.role === "ceo") return; // CEO has full access by design

  await dbConnect();
  const role = await Role.findOne({
    companyId: user.companyId,
    key: user.role,
  }).lean();
  const granted: string[] = (role?.permissions as string[]) || [];
  const allowed = permissions.some((p) => granted.includes(p));
  if (!allowed) {
    throw httpError(
      403,
      "You do not have permission to perform this action"
    );
  }
}

/**
 * Primary guard for route handlers.
 * Returns the authenticated user and their companyId, optionally enforcing
 * any of the given permissions (CEO always passes).
 */
export async function requireAuth(
  ...permissions: string[]
): Promise<{ user: IUser; companyId: string }> {
  const user = await getCurrentUser();
  if (!user.companyId) {
    throw httpError(403, "No company is assigned to this account");
  }
  const companyId = user.companyId.toString();

  if (permissions.length > 0) {
    await assertPermission(user, ...permissions);
  }

  return { user, companyId };
}

/** Guard that only allows specific role keys. */
export async function requireRole(
  ...roles: string[]
): Promise<{ user: IUser; companyId: string }> {
  const { user, companyId } = await requireAuth();
  if (!roles.includes(user.role)) {
    throw httpError(
      403,
      "You do not have permission to perform this action"
    );
  }
  return { user, companyId };
}
