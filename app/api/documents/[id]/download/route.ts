import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Document from "@/models/Document";
import { requireAuth, handleApiError } from "@/lib/guards";

/** Stream a stored document back with its original content type. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { companyId } = await requireAuth("documents.read");
    await dbConnect();

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid document id" }, { status: 400 });
    }

    const document = await Document.findOne({
      _id: id,
      companyId,
    })
      .select("+data")
      .lean();

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    if (!document.data) {
      return NextResponse.json(
        { error: "Document payload is missing" },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(document.data, "base64");
    const safeName = (document.name || "download").replace(/[^\w.\- ]/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": document.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
