import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import Document, {
  MAX_DOCUMENT_BYTES,
  DEFAULT_FOLDER,
  RELATED_ENTITY_TYPES,
} from "@/models/Document";
import { requireAuth, handleApiError } from "@/lib/guards";
import { rateLimitByUser } from "@/lib/rateLimit";
import { logActivity } from "@/lib/logActivity";
import { ok, parsePagination, paginationMeta } from "@/lib/api";
import { validate, reqString, enumValue } from "@/lib/validate";

export async function GET(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("documents.read");
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const folder = searchParams.get("folder");
    const relatedEntityType = searchParams.get("relatedEntityType");
    const relatedEntityId = searchParams.get("relatedEntityId");
    const search = searchParams.get("search");
    const { page, pageSize, skip } = parsePagination(request.url, 50);

    const query: Record<string, any> = { companyId };

    if (folder) query.folder = folder;
    if (relatedEntityType && relatedEntityId) {
      query.relatedEntityType = relatedEntityType;
      query.relatedEntityId = relatedEntityId;
    }
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const [documents, total, folders] = await Promise.all([
      // Never send the base64 payload in list queries.
      Document.find(query)
        .select("-data")
        .populate("uploadedBy", "fullName name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Document.countDocuments(query),
      Document.distinct("folder", { companyId }),
    ]);

    return ok(
      {
        documents,
        folders: folders.sort(),
      },
      paginationMeta(total, page, pageSize)
    );
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Upload a document. Files are sent as a base64 `data` string (same pattern as
 * task attachments) and persisted in MongoDB; `url` points at the download
 * endpoint that serves them back.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, companyId } = await requireAuth("documents.write");
    rateLimitByUser(user._id.toString());
    await dbConnect();

    const body = await request.json();
    const { folder, name, mimeType, size, data, relatedEntityType, relatedEntityId } = body;

    const err = validate(body, {
      name: reqString("File name"),
      data: reqString("File data"),
      relatedEntityType: enumValue(RELATED_ENTITY_TYPES, "related entity type"),
    });
    if (err) {
      return NextResponse.json({ error: err }, { status: 400 });
    }
    if (typeof size === "number" && size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json(
        { error: "File is too large (max 10 MB)" },
        { status: 400 }
      );
    }
    // Guard against a client that omits size: estimate from base64 length.
    const approxBytes = Math.floor(data.length * 0.75);
    if (approxBytes > MAX_DOCUMENT_BYTES) {
      return NextResponse.json(
        { error: "File is too large (max 10 MB)" },
        { status: 400 }
      );
    }
    // Generate the _id up front so url can reference it.
    const docId = new mongoose.Types.ObjectId();
    const docFolder = folder?.trim() || DEFAULT_FOLDER;

    const document = await Document.create({
      _id: docId,
      companyId,
      folder: docFolder,
      name: String(name).slice(0, 255),
      url: `/api/documents/${docId.toString()}/download`,
      mimeType: mimeType || "",
      size: typeof size === "number" ? size : approxBytes,
      data,
      uploadedBy: user._id,
      relatedEntityType: relatedEntityType || undefined,
      relatedEntityId: relatedEntityId || undefined,
    });

    await logActivity({
      userId: user._id.toString(),
      companyId,
      action: "UPLOAD_DOCUMENT",
      details: `Uploaded "${document.name}" to ${docFolder}`,
    });

    const populated = await Document.findById(document._id)
      .select("-data")
      .populate("uploadedBy", "fullName name email")
      .lean();

    return NextResponse.json({ document: populated }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
