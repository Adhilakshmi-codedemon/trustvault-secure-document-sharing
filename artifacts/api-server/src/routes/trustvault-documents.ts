import {
  and,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  CompleteDocumentUploadParams,
  CompleteDocumentUploadResponse,
  CreateDocumentBody,
  CreateDocumentResponse,
  DeleteDocumentParams,
  DeleteDocumentResponse,
  GetDocumentParams,
  GetDocumentResponse,
  GrantDocumentPermissionBody,
  GrantDocumentPermissionParams,
  GrantDocumentPermissionResponse,
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  RevokeDocumentPermissionParams,
  RevokeDocumentPermissionResponse,
  UpdateDocumentBody,
  UpdateDocumentParams,
  UpdateDocumentResponse,
} from "@workspace/api-zod";
import {
  db,
  trustVaultDocuments,
  trustVaultPermissions,
  trustVaultUsers,
  type TrustVaultDocument,
  type TrustVaultUser,
} from "@workspace/db";
import {
  requireTrustVaultRole,
  requireTrustVaultUser,
  trustVaultUser,
} from "../middlewares/trustvaultAuth";
import {
  authorizeDocument,
  recordDocumentEvent,
} from "../lib/trustvault-documents";
import { recordAuditEvent } from "../lib/trustvault-audit";
import {
  isSupportedContentType,
  MAX_DOCUMENT_BYTES,
  validateStoredDocument,
} from "../lib/trustvault-file-validation";
import {
  createFinalizedCopy,
  deletePrivateObject,
  objectStorageService,
} from "../lib/trustvault-storage";

const router: IRouter = Router();

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function documentPayload(
  document: TrustVaultDocument,
  owner: TrustVaultUser,
  actorId: string,
  grantPermission: "read" | "edit" | null,
) {
  const isOwner = document.ownerId === actorId;
  return {
    id: document.id,
    name: document.name,
    category: document.category,
    description: document.description,
    ownerId: document.ownerId,
    ownerEmail: owner.email,
    ownerName: owner.name,
    size: document.size,
    contentType: document.contentType,
    state: document.state as "pending" | "active",
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    canEdit: isOwner || grantPermission === "edit",
    isOwner,
  };
}

function unauthorizedDocument(res: Response): void {
  res.status(404).json({ error: "Document not found" });
}

router.get(
  "/documents",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const parsed = ListDocumentsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const conditions: SQL[] = [
      ne(trustVaultDocuments.state, "deleted"),
      or(
        eq(trustVaultDocuments.ownerId, actor.id),
        isNotNull(trustVaultPermissions.id),
      )!,
    ];
    if (parsed.data.q?.trim()) {
      const pattern = `%${escapeLike(parsed.data.q.trim())}%`;
      conditions.push(
        or(
          ilike(trustVaultDocuments.name, pattern),
          ilike(trustVaultDocuments.description, pattern),
        )!,
      );
    }
    if (parsed.data.category?.trim()) {
      conditions.push(
        ilike(
          trustVaultDocuments.category,
          `%${escapeLike(parsed.data.category.trim())}%`,
        ),
      );
    }
    if (parsed.data.owner?.trim()) {
      const pattern = `%${escapeLike(parsed.data.owner.trim())}%`;
      conditions.push(
        or(
          ilike(trustVaultUsers.email, pattern),
          ilike(trustVaultUsers.name, pattern),
        )!,
      );
    }
    if (parsed.data.from) {
      const from = new Date(parsed.data.from);
      from.setUTCHours(0, 0, 0, 0);
      conditions.push(gte(trustVaultDocuments.createdAt, from));
    }
    if (parsed.data.to) {
      const to = new Date(parsed.data.to);
      to.setUTCHours(23, 59, 59, 999);
      conditions.push(lte(trustVaultDocuments.createdAt, to));
    }

    const rows = await db
      .select({
        document: trustVaultDocuments,
        owner: trustVaultUsers,
        grantPermission: trustVaultPermissions.permission,
      })
      .from(trustVaultDocuments)
      .innerJoin(
        trustVaultUsers,
        eq(trustVaultUsers.id, trustVaultDocuments.ownerId),
      )
      .leftJoin(
        trustVaultPermissions,
        and(
          eq(trustVaultPermissions.documentId, trustVaultDocuments.id),
          eq(trustVaultPermissions.userId, actor.id),
          isNull(trustVaultPermissions.revokedAt),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(trustVaultDocuments.updatedAt))
      .limit(250);

    res.json(
      ListDocumentsResponse.parse(
        rows.map((row) =>
          documentPayload(
            row.document,
            row.owner,
            actor.id,
            row.grantPermission,
          ),
        ),
      ),
    );
  },
);

router.post(
  "/documents",
  requireTrustVaultUser,
  requireTrustVaultRole("owner", "admin"),
  async (req, res): Promise<void> => {
    const parsed = CreateDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const name = cleanText(parsed.data.name);
    const category = cleanText(parsed.data.category);
    const contentType = parsed.data.contentType.trim().toLowerCase();
    if (
      !name ||
      !category ||
      parsed.data.size > MAX_DOCUMENT_BYTES ||
      !isSupportedContentType(contentType)
    ) {
      await recordAuditEvent(actor, {
        action: "document.upload_rejected",
        outcome: "denied",
        details: "unsupported_or_invalid_upload_metadata",
      });
      res.status(400).json({
        error: "Use a supported document format no larger than 25 MB.",
      });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath =
      objectStorageService.normalizeObjectEntityPath(uploadURL);
    if (!objectPath.startsWith("/objects/uploads/")) {
      req.log.error("Object storage returned an invalid private object path");
      res.status(503).json({ error: "Private file storage is unavailable" });
      return;
    }

    const uploadExpiresAt = new Date(Date.now() + 14 * 60 * 1000);
    const [document] = await db
      .insert(trustVaultDocuments)
      .values({
        ownerId: actor.id,
        name,
        originalName: name,
        category,
        description: cleanText(parsed.data.description ?? ""),
        objectPath,
        size: parsed.data.size,
        contentType,
        state: "pending",
        uploadExpiresAt,
      })
      .returning();
    if (!document) {
      res.status(500).json({ error: "Could not create document record" });
      return;
    }

    await recordDocumentEvent(actor, document, {
      action: "document.upload_started",
      outcome: "recorded",
      details: `Pending upload declared at ${document.size} bytes`,
    });

    res.status(201).json(
      CreateDocumentResponse.parse({
        document: documentPayload(document, actor, actor.id, null),
        uploadURL,
        objectPath,
      }),
    );
  },
);

router.get(
  "/documents/:documentId",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = GetDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "read",
      "document.read",
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }

    await recordDocumentEvent(actor, access.document, {
      action: "document.read",
      outcome: "allowed",
    });

    const grants = access.isOwner
      ? await db
          .select({
            grant: trustVaultPermissions,
            user: trustVaultUsers,
          })
          .from(trustVaultPermissions)
          .innerJoin(
            trustVaultUsers,
            eq(trustVaultUsers.id, trustVaultPermissions.userId),
          )
          .where(
            and(
              eq(trustVaultPermissions.documentId, access.document.id),
              isNull(trustVaultPermissions.revokedAt),
            ),
          )
          .orderBy(desc(trustVaultPermissions.grantedAt))
      : [];

    res.json(
      GetDocumentResponse.parse({
        document: documentPayload(
          access.document,
          access.owner,
          actor.id,
          access.grantPermission,
        ),
        permissions: grants.map(({ grant, user }) => ({
          id: grant.id,
          documentId: grant.documentId,
          userId: user.id,
          email: user.email,
          name: user.name,
          permission: grant.permission,
          grantedBy: grant.grantedBy,
          grantedAt: grant.grantedAt,
        })),
      }),
    );
  },
);

router.patch(
  "/documents/:documentId",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = UpdateDocumentParams.safeParse(req.params);
    const parsed = UpdateDocumentBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      const error = !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid request";
      res.status(400).json({
        error,
      });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "edit",
      "document.update",
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }

    const update: Partial<Pick<TrustVaultDocument, "name" | "category" | "description">> = {};
    if (parsed.data.name !== undefined) {
      update.name = cleanText(parsed.data.name);
    }
    if (parsed.data.category !== undefined) {
      update.category = cleanText(parsed.data.category);
    }
    if (parsed.data.description !== undefined) {
      update.description = cleanText(parsed.data.description);
    }
    if (
      (update.name !== undefined && !update.name) ||
      (update.category !== undefined && !update.category)
    ) {
      res.status(400).json({ error: "Name and category cannot be blank" });
      return;
    }

    const [updated] = await db
      .update(trustVaultDocuments)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(trustVaultDocuments.id, access.document.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    await recordDocumentEvent(actor, updated, {
      action: "document.updated",
      outcome: "recorded",
      details: "Document metadata changed",
    });
    res.json(
      UpdateDocumentResponse.parse(
        documentPayload(
          updated,
          access.owner,
          actor.id,
          access.grantPermission,
        ),
      ),
    );
  },
);

router.post(
  "/documents/:documentId/complete",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = CompleteDocumentUploadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "owner",
      "document.upload_complete",
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }
    if (
      access.document.state !== "pending" ||
      access.document.uploadExpiresAt.getTime() < Date.now()
    ) {
      await recordDocumentEvent(actor, access.document, {
        action: "document.upload_rejected",
        outcome: "denied",
        details: "upload_expired_or_not_pending",
      });
      res.status(404).json({ error: "Pending upload not found or expired" });
      return;
    }

    try {
      const stagedFile = await objectStorageService.getObjectEntityFile(
        access.document.objectPath,
      );
      const validation = await validateStoredDocument(
        stagedFile,
        access.document.size,
        access.document.contentType,
      );
      if (!validation.valid) {
        await deletePrivateObject(access.document.objectPath);
        await db
          .update(trustVaultDocuments)
          .set({ state: "deleted", updatedAt: new Date() })
          .where(eq(trustVaultDocuments.id, access.document.id));
        await recordDocumentEvent(actor, access.document, {
          action: "document.upload_rejected",
          outcome: "denied",
          details: validation.reason,
        });
        res.status(400).json({
          error: "The uploaded file did not pass size, type, and signature validation.",
        });
        return;
      }
    } catch (error) {
      req.log.warn(
        { err: error, documentId: access.document.id },
        "Uploaded object could not be validated",
      );
      await recordDocumentEvent(actor, access.document, {
        action: "document.upload_rejected",
        outcome: "denied",
        details: "stored_object_missing_or_unreadable",
      });
      res.status(404).json({ error: "Uploaded file was not found" });
      return;
    }

    const finalized = await createFinalizedCopy(access.document.objectPath);
    const [activeDocument] = await db
      .update(trustVaultDocuments)
      .set({
        objectPath: finalized.objectPath,
        state: "active",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(trustVaultDocuments.id, access.document.id),
          eq(trustVaultDocuments.state, "pending"),
        ),
      )
      .returning();
    if (!activeDocument) {
      await deletePrivateObject(finalized.objectPath);
      res.status(409).json({ error: "Upload has already been completed" });
      return;
    }

    // The presigned PUT URL only names the staging object. The active document
    // now points at a server-copied object the client never received a URL for.
    await deletePrivateObject(access.document.objectPath);
    await recordDocumentEvent(actor, activeDocument, {
      action: "document.upload_completed",
      outcome: "recorded",
      details: "Server validated and finalized the private object",
    });
    res.json(
      CompleteDocumentUploadResponse.parse(
        documentPayload(activeDocument, access.owner, actor.id, null),
      ),
    );
  },
);

router.get(
  "/documents/:documentId/download",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = GetDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "read",
      "document.download",
      true,
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }

    let file: Awaited<ReturnType<typeof objectStorageService.getObjectEntityFile>>;
    try {
      file = await objectStorageService.getObjectEntityFile(
        access.document.objectPath,
      );
    } catch (error) {
      req.log.error(
        { err: error, documentId: access.document.id },
        "Authorized document object is unavailable",
      );
      await recordDocumentEvent(actor, access.document, {
        action: "document.download_failed",
        outcome: "recorded",
        details: "private_object_unavailable",
      });
      res.status(404).json({ error: "Document file is unavailable" });
      return;
    }

    await recordDocumentEvent(actor, access.document, {
      action: "document.download",
      outcome: "allowed",
    });
    const safeFileName = access.document.name
      .replace(/[\r\n"]/g, "_")
      .slice(0, 255);
    res.setHeader("Content-Type", access.document.contentType);
    res.setHeader("Content-Length", String(access.document.size));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(safeFileName)}`,
    );
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const stream = file.createReadStream();
    stream.on("error", (error) => {
      req.log.error(
        { err: error, documentId: access.document.id },
        "Private document stream failed",
      );
      if (!res.headersSent) {
        res.status(404).json({ error: "Document file is unavailable" });
      } else {
        res.destroy(error);
      }
    });
    stream.pipe(res);
  },
);

router.post(
  "/documents/:documentId/permissions",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = GrantDocumentPermissionParams.safeParse(req.params);
    const parsed = GrantDocumentPermissionBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      const error = !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid request";
      res.status(400).json({
        error,
      });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "owner",
      "permission.grant",
      true,
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }

    const email = parsed.data.email.trim().toLowerCase();
    if (email === actor.email.toLowerCase()) {
      res.status(400).json({ error: "Owners already have access to their document" });
      return;
    }
    const [recipient] = await db
      .select()
      .from(trustVaultUsers)
      .where(sql`lower(${trustVaultUsers.email}) = ${email}`)
      .limit(1);
    if (!recipient) {
      res.status(404).json({
        error: "That email is not registered. The person must create an account first.",
      });
      return;
    }

    const [existingGrant] = await db
      .select()
      .from(trustVaultPermissions)
      .where(
        and(
          eq(trustVaultPermissions.documentId, access.document.id),
          eq(trustVaultPermissions.userId, recipient.id),
          isNull(trustVaultPermissions.revokedAt),
        ),
      )
      .limit(1);
    if (existingGrant) {
      res.status(400).json({
        error: "This person already has access. Revoke the current grant first.",
      });
      return;
    }

    const [grant] = await db
      .insert(trustVaultPermissions)
      .values({
        documentId: access.document.id,
        userId: recipient.id,
        permission: parsed.data.permission,
        grantedBy: actor.id,
      })
      .returning();
    if (!grant) {
      res.status(500).json({ error: "Could not create document grant" });
      return;
    }
    await recordDocumentEvent(actor, access.document, {
      action: "permission.granted",
      outcome: "recorded",
      details: `${parsed.data.permission} access granted to ${recipient.email}`,
    });

    res.status(201).json(
      GrantDocumentPermissionResponse.parse({
        id: grant.id,
        documentId: grant.documentId,
        userId: recipient.id,
        email: recipient.email,
        name: recipient.name,
        permission: grant.permission,
        grantedBy: grant.grantedBy,
        grantedAt: grant.grantedAt,
      }),
    );
  },
);

router.delete(
  "/documents/:documentId/permissions/:permissionId",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = RevokeDocumentPermissionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "owner",
      "permission.revoke",
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }

    const [grant] = await db
      .update(trustVaultPermissions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(trustVaultPermissions.id, params.data.permissionId),
          eq(trustVaultPermissions.documentId, access.document.id),
          isNull(trustVaultPermissions.revokedAt),
        ),
      )
      .returning();
    if (!grant) {
      res.status(404).json({ error: "Active document grant not found" });
      return;
    }

    const [recipient] = await db
      .select({ email: trustVaultUsers.email })
      .from(trustVaultUsers)
      .where(eq(trustVaultUsers.id, grant.userId))
      .limit(1);
    await recordDocumentEvent(actor, access.document, {
      action: "permission.revoked",
      outcome: "recorded",
      details: `Access revoked for ${recipient?.email ?? grant.userId}`,
    });
    res.status(204).json(RevokeDocumentPermissionResponse.parse(undefined));
  },
);

router.delete(
  "/documents/:documentId",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const params = DeleteDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const actor = trustVaultUser(res);
    const access = await authorizeDocument(
      actor,
      params.data.documentId,
      "owner",
      "document.delete",
    );
    if (!access) {
      unauthorizedDocument(res);
      return;
    }

    await recordDocumentEvent(actor, access.document, {
      action: "document.delete_requested",
      outcome: "recorded",
    });
    try {
      await deletePrivateObject(access.document.objectPath);
    } catch (error) {
      req.log.error(
        { err: error, documentId: access.document.id },
        "Private object deletion failed",
      );
      res.status(503).json({ error: "Document could not be deleted right now" });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(trustVaultDocuments)
        .set({ state: "deleted", updatedAt: new Date() })
        .where(eq(trustVaultDocuments.id, access.document.id));
      await tx
        .update(trustVaultPermissions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(trustVaultPermissions.documentId, access.document.id),
            isNull(trustVaultPermissions.revokedAt),
          ),
        );
    });
    await recordDocumentEvent(actor, access.document, {
      action: "document.deleted",
      outcome: "recorded",
      details: "Private object removed; metadata retained as a tombstone",
    });
    res.status(204).json(DeleteDocumentResponse.parse(undefined));
  },
);

export default router;
