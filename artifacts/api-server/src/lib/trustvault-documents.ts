import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  trustVaultDocuments,
  trustVaultPermissions,
  trustVaultUsers,
  type TrustVaultDocument,
  type TrustVaultUser,
} from "@workspace/db";
import { recordAuditEvent, type AuditEventInput } from "./trustvault-audit";
import { canAccessDocument } from "./trustvault-policy";

export type DocumentAccessLevel = "read" | "edit" | "owner";

export type AuthorizedDocument = {
  document: TrustVaultDocument;
  owner: TrustVaultUser;
  grantPermission: "read" | "edit" | null;
  isOwner: boolean;
  canEdit: boolean;
};

export async function authorizeDocument(
  actor: TrustVaultUser,
  documentId: number,
  accessLevel: DocumentAccessLevel,
  action: string,
  activeOnly = false,
): Promise<AuthorizedDocument | null> {
  const [row] = await db
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
    .where(eq(trustVaultDocuments.id, documentId))
    .limit(1);

  if (!row || row.document.state === "deleted") {
    await recordAuditEvent(actor, {
      action,
      outcome: "denied",
      documentId,
      details: "not_found_or_not_accessible",
    });
    return null;
  }

  const isOwner = row.document.ownerId === actor.id;
  const grantPermission = row.grantPermission;
  const permitted = canAccessDocument({
    actorId: actor.id,
    ownerId: row.document.ownerId,
    permission: grantPermission,
    state: row.document.state,
    accessLevel,
    activeOnly,
  });
  if (!permitted) {
    await recordAuditEvent(actor, {
      action,
      outcome: "denied",
      documentId,
      documentName: row.document.name,
      details:
        activeOnly && row.document.state !== "active"
          ? "document_not_active"
          : "permission_denied",
    });
    return null;
  }

  return {
    document: row.document,
    owner: row.owner,
    grantPermission,
    isOwner,
    canEdit: canAccessDocument({
      actorId: actor.id,
      ownerId: row.document.ownerId,
      permission: grantPermission,
      state: row.document.state,
      accessLevel: "edit",
    }),
  };
}

export async function recordDocumentEvent(
  actor: TrustVaultUser,
  document: Pick<TrustVaultDocument, "id" | "name">,
  event: Omit<AuditEventInput, "documentId" | "documentName">,
): Promise<void> {
  await recordAuditEvent(actor, {
    ...event,
    documentId: document.id,
    documentName: document.name,
  });
}
