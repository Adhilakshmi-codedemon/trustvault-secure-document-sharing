import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const trustVaultRole = pgEnum("trustvault_role", [
  "admin",
  "owner",
  "viewer",
]);

export const documentPermission = pgEnum("document_permission", [
  "read",
  "edit",
]);

export const documentState = pgEnum("document_state", [
  "pending",
  "active",
  "deleted",
]);

export const trustVaultUsers = pgTable(
  "trustvault_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: trustVaultRole("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("trustvault_users_email_unique_idx").on(sql`lower(${table.email})`),
  ],
);

export const trustVaultDocuments = pgTable(
  "trustvault_documents",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => trustVaultUsers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    originalName: text("original_name").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    objectPath: text("object_path").notNull().unique(),
    size: integer("size").notNull(),
    contentType: text("content_type").notNull(),
    state: documentState("state").notNull().default("pending"),
    uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("trustvault_documents_owner_idx").on(table.ownerId, table.state),
    index("trustvault_documents_category_idx").on(table.category),
    index("trustvault_documents_created_idx").on(table.createdAt),
  ],
);

export const trustVaultPermissions = pgTable(
  "trustvault_permissions",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => trustVaultDocuments.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => trustVaultUsers.id, { onDelete: "cascade" }),
    permission: documentPermission("permission").notNull(),
    grantedBy: text("granted_by")
      .notNull()
      .references(() => trustVaultUsers.id, { onDelete: "restrict" }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("trustvault_permissions_user_idx").on(
      table.userId,
      table.documentId,
      table.revokedAt,
    ),
    uniqueIndex("trustvault_permissions_one_active_grant_idx")
      .on(table.documentId, table.userId)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);

export const trustVaultAuditEvents = pgTable(
  "trustvault_audit_events",
  {
    id: serial("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    actorName: text("actor_name").notNull(),
    documentId: integer("document_id"),
    documentName: text("document_name"),
    action: text("action").notNull(),
    outcome: text("outcome", { enum: ["allowed", "denied", "recorded"] })
      .notNull(),
    details: text("details").notNull().default(""),
    previousHash: text("previous_hash").notNull(),
    eventHash: text("event_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("trustvault_audit_events_created_idx").on(table.createdAt),
    index("trustvault_audit_events_actor_idx").on(table.actorId, table.createdAt),
    index("trustvault_audit_events_document_idx").on(
      table.documentId,
      table.createdAt,
    ),
  ],
);

export type TrustVaultUser = typeof trustVaultUsers.$inferSelect;
export type TrustVaultDocument = typeof trustVaultDocuments.$inferSelect;
export type TrustVaultPermission = typeof trustVaultPermissions.$inferSelect;
export type TrustVaultAuditEvent = typeof trustVaultAuditEvents.$inferSelect;
