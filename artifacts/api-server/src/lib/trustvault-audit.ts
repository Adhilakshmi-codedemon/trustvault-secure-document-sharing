import { createHash } from "node:crypto";
import { desc, sql } from "drizzle-orm";
import { db, trustVaultAuditEvents, type TrustVaultUser } from "@workspace/db";

export type AuditOutcome = "allowed" | "denied" | "recorded";

export type AuditEventInput = {
  action: string;
  outcome: AuditOutcome;
  documentId?: number | null;
  documentName?: string | null;
  details?: string;
};

export type TrustVaultAuditTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

type AuditActor = Pick<TrustVaultUser, "id" | "email" | "name">;

const GENESIS_HASH = "0".repeat(64);
const AUDIT_LOCK_ID = 5_837_421;

function canonicalEvent(
  actor: AuditActor,
  event: AuditEventInput,
  createdAt: Date,
): string {
  return JSON.stringify({
    actorId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name,
    documentId: event.documentId ?? null,
    documentName: event.documentName ?? null,
    action: event.action,
    outcome: event.outcome,
    details: event.details ?? "",
    createdAt: createdAt.toISOString(),
  });
}

export function hashAuditEvent(
  previousHash: string,
  actor: AuditActor,
  event: AuditEventInput,
  createdAt: Date,
): string {
  return createHash("sha256")
    .update(previousHash)
    .update("\n")
    .update(canonicalEvent(actor, event, createdAt))
    .digest("hex");
}

export async function recordAuditEvent(
  actor: TrustVaultUser,
  event: AuditEventInput,
): Promise<void> {
  await db.transaction((tx) => recordAuditEventInTransaction(tx, actor, event));
}

export async function recordAuditEventInTransaction(
  tx: TrustVaultAuditTransaction,
  actor: TrustVaultUser,
  event: AuditEventInput,
): Promise<void> {
  const createdAt = new Date();
  const safeEvent = {
    ...event,
    details: (event.details ?? "").slice(0, 1000),
  };

  // Serialize hash-chain appends so concurrent requests cannot fork the chain.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_ID})`);
  const [lastEvent] = await tx
    .select({ eventHash: trustVaultAuditEvents.eventHash })
    .from(trustVaultAuditEvents)
    .orderBy(desc(trustVaultAuditEvents.id))
    .limit(1);
  const previousHash = lastEvent?.eventHash ?? GENESIS_HASH;
  const eventHash = hashAuditEvent(
    previousHash,
    actor,
    safeEvent,
    createdAt,
  );

  await tx.insert(trustVaultAuditEvents).values({
    actorId: actor.id,
    actorEmail: actor.email,
    actorName: actor.name,
    documentId: safeEvent.documentId ?? null,
    documentName: safeEvent.documentName ?? null,
    action: safeEvent.action,
    outcome: safeEvent.outcome,
    details: safeEvent.details,
    previousHash,
    eventHash,
    createdAt,
  });
}

export async function checkAuditChain(): Promise<{
  valid: boolean;
  checkedEvents: number;
  firstInvalidEventId: number | null;
}> {
  const events = await db
    .select()
    .from(trustVaultAuditEvents)
    .orderBy(trustVaultAuditEvents.id);
  let previousHash = GENESIS_HASH;

  for (const row of events) {
    const input: AuditEventInput = {
      action: row.action,
      outcome: row.outcome as AuditOutcome,
      documentId: row.documentId,
      documentName: row.documentName,
      details: row.details,
    };
    const expectedHash = hashAuditEvent(
      previousHash,
      {
        id: row.actorId,
        email: row.actorEmail,
        name: row.actorName,
      },
      input,
      row.createdAt,
    );

    if (
      row.previousHash !== previousHash ||
      row.eventHash !== expectedHash
    ) {
      return {
        valid: false,
        checkedEvents: events.length,
        firstInvalidEventId: row.id,
      };
    }
    previousHash = row.eventHash;
  }

  return {
    valid: true,
    checkedEvents: events.length,
    firstInvalidEventId: null,
  };
}

export { GENESIS_HASH };
