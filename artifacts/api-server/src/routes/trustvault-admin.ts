import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  ChangeUserRoleBody,
  ChangeUserRoleParams,
  ChangeUserRoleResponse,
  GetAdminOverviewResponse,
  ListAuditEventsQueryParams,
  ListAuditEventsResponse,
  ListUsersResponse,
  VerifyAuditChainResponse,
} from "@workspace/api-zod";
import {
  db,
  trustVaultAuditEvents,
  trustVaultDocuments,
  trustVaultUsers,
} from "@workspace/db";
import {
  requireTrustVaultRole,
  requireTrustVaultUser,
  trustVaultUser,
} from "../middlewares/trustvaultAuth";
import { checkAuditChain, recordAuditEvent } from "../lib/trustvault-audit";

const router: IRouter = Router();

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

router.get(
  "/admin/overview",
  requireTrustVaultUser,
  requireTrustVaultRole("admin"),
  async (_req, res): Promise<void> => {
    const [documents] = await db
      .select({ total: count() })
      .from(trustVaultDocuments)
      .where(ne(trustVaultDocuments.state, "deleted"));
    const [users] = await db.select({ total: count() }).from(trustVaultUsers);
    const [deniedAttempts] = await db
      .select({ total: count() })
      .from(trustVaultAuditEvents)
      .where(
        and(
          eq(trustVaultAuditEvents.outcome, "denied"),
          gte(
            trustVaultAuditEvents.createdAt,
            new Date(Date.now() - 24 * 60 * 60 * 1000),
          ),
        ),
      );
    const chain = await checkAuditChain();

    res.json(
      GetAdminOverviewResponse.parse({
        documentCount: documents?.total ?? 0,
        userCount: users?.total ?? 0,
        deniedAttempts24h: deniedAttempts?.total ?? 0,
        auditChainValid: chain.valid,
      }),
    );
  },
);

router.get(
  "/admin/audit",
  requireTrustVaultUser,
  requireTrustVaultRole("admin"),
  async (req, res): Promise<void> => {
    const parsed = ListAuditEventsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const conditions: SQL[] = [];
    if (parsed.data.action) {
      conditions.push(eq(trustVaultAuditEvents.action, parsed.data.action));
    }
    if (parsed.data.actor?.trim()) {
      const pattern = `%${escapeLike(parsed.data.actor.trim())}%`;
      conditions.push(
        or(
          ilike(trustVaultAuditEvents.actorEmail, pattern),
          ilike(trustVaultAuditEvents.actorName, pattern),
        )!,
      );
    }

    const events = await db
      .select()
      .from(trustVaultAuditEvents)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(trustVaultAuditEvents.id))
      .limit(parsed.data.limit);
    res.json(
      ListAuditEventsResponse.parse(
        events.map((event) => ({
          id: event.id,
          actorId: event.actorId,
          actorEmail: event.actorEmail,
          actorName: event.actorName,
          documentId: event.documentId,
          documentName: event.documentName,
          action: event.action,
          outcome: event.outcome,
          details: event.details,
          createdAt: event.createdAt,
          previousHash: event.previousHash,
          eventHash: event.eventHash,
        })),
      ),
    );
  },
);

router.get(
  "/admin/audit/verify",
  requireTrustVaultUser,
  requireTrustVaultRole("admin"),
  async (_req, res): Promise<void> => {
    res.json(VerifyAuditChainResponse.parse(await checkAuditChain()));
  },
);

router.get(
  "/admin/users",
  requireTrustVaultUser,
  requireTrustVaultRole("admin"),
  async (_req, res): Promise<void> => {
    const users = await db
      .select()
      .from(trustVaultUsers)
      .orderBy(trustVaultUsers.createdAt);
    res.json(
      ListUsersResponse.parse(
        users.map((user) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        })),
      ),
    );
  },
);

router.patch(
  "/admin/users/:userId/role",
  requireTrustVaultUser,
  requireTrustVaultRole("admin"),
  async (req, res): Promise<void> => {
    const params = ChangeUserRoleParams.safeParse(req.params);
    const parsed = ChangeUserRoleBody.safeParse(req.body);
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
    const [target] = await db
      .select()
      .from(trustVaultUsers)
      .where(eq(trustVaultUsers.id, params.data.userId))
      .limit(1);
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const bootstrapAdminEmail = process.env.TRUSTVAULT_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();
    if (
      target.role === "admin" &&
      parsed.data.role !== "admin" &&
      target.email.toLowerCase() === bootstrapAdminEmail
    ) {
      res.status(400).json({
        error: "The configured bootstrap administrator cannot be demoted.",
      });
      return;
    }
    if (target.role === "admin" && parsed.data.role !== "admin") {
      const [admins] = await db
        .select({ total: count() })
        .from(trustVaultUsers)
        .where(eq(trustVaultUsers.role, "admin"));
      if ((admins?.total ?? 0) <= 1) {
        res.status(400).json({
          error: "At least one administrator must remain.",
        });
        return;
      }
    }

    const [updated] = await db
      .update(trustVaultUsers)
      .set({ role: parsed.data.role, updatedAt: new Date() })
      .where(eq(trustVaultUsers.id, target.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    await recordAuditEvent(actor, {
      action: "user.role_changed",
      outcome: "recorded",
      details: `${target.email}: ${target.role} → ${updated.role}`,
    });

    res.json(
      ChangeUserRoleResponse.parse({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
      }),
    );
  },
);

export default router;
