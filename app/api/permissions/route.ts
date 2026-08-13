import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import Permission from "@/models/Permission";
import { requireAuth, handleApiError } from "@/lib/guards";
import { PERMISSION_CATALOG } from "@/lib/permissions";

/**
 * Returns the permission catalog for the current company. If the catalog has
 * not been provisioned yet (migration not run), it is seeded idempotently
 * from the system catalog so the API always returns real data.
 */
export async function GET() {
  try {
    const { companyId } = await requireAuth("roles.read");
    await dbConnect();

    let permissions = await Permission.find({ companyId })
      .sort({ module: 1, name: 1 })
      .lean();

    if (permissions.length === 0) {
      await Permission.insertMany(
        PERMISSION_CATALOG.map((p) => ({
          companyId,
          name: p.name,
          key: p.key,
          module: p.module,
          description: p.description,
        })),
        { ordered: false }
      ).catch(() => {}); // ignore duplicates on concurrent provision
      permissions = await Permission.find({ companyId })
        .sort({ module: 1, name: 1 })
        .lean();
    }

    return NextResponse.json({ permissions });
  } catch (error) {
    return handleApiError(error);
  }
}
