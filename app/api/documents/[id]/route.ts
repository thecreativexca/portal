import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Document from "@/models/Document";
import {
  requireAuth,
  assertPermission,
  handleApiError,
} from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { toObjectId } from "@/lib/ids";

/** Single document including payload — used by the in-app preview. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("documents.read");
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
    }

    const document = await Document.findOne({ _id: objectId, companyId })
      .select("+data")
      .populate("uploadedBy", "fullName name email")
      .lean();
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ document });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Delete a document — the uploader or anyone with documents.write. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, companyId } = await requireAuth();
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const { id } = await params;
    const objectId = toObjectId(id);
    if (!objectId) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
    }

    const document = await Document.findOne({ _id: objectId, companyId });
    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const isUploader = document.uploadedBy.toString() === user._id.toString();
    let canManage = false;
    try {
      await assertPermission(user, "documents.write");
      canManage = true;
    } catch {
      canManage = false;
    }
    if (!isUploader && !canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await Document.findByIdAndDelete(objectId);

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "DELETE_DOCUMENT",
      details: `Deleted "${document.name}" from ${document.folder}`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
