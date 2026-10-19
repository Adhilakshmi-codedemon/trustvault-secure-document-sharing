import { and, count, desc, eq, gte, ilike, isNull, ne, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCurrentUserResponse,
  GetDashboardResponse,
  SearchUsersQueryParams,
  SearchUsersResponse,
} from "@workspace/api-zod";
import {
  db,
  trustVaultAuditEvents,
  trustVaultDocuments,
  trustVaultPermissions,
  trustVaultUsers,
} from "@workspace/db";
import {
  requireTrustVaultUser,
  trustVaultUser,
} from "../middlewares/trustvaultAuth";

const router: IRouter = Router();

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

router.get("/me", requireTrustVaultUser, (req, res): void => {
  const user = trustVaultUser(res);
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }),
  );
});

router.get(
  "/users/search",
  requireTrustVaultUser,
  async (req, res): Promise<void> => {
    const parsed = SearchUsersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const currentUser = trustVaultUser(res);
    const pattern = `%${escapeLike(parsed.data.q.trim())}%`;
    const users = await db
      .select()
      .from(trustVaultUsers)
      .where(
        and(
          ne(trustVaultUsers.id, currentUser.id),
          or(
            ilike(trustVaultUsers.email, pattern),
            ilike(trustVaultUsers.name, pattern),
          ),
        ),
      )
      .orderBy(trustVaultUsers.name)
      .limit(20);

    res.json(
      SearchUsersResponse.parse(
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

router.get(
  "/dashboard",
  requireTrustVaultUser,
  async (_req, res): Promise<void> => {
    const user = trustVaultUser(res);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [[owned], [downloads], activity] = await Promise.all([
      db
        .select({ total: count() })
        .from(trustVaultDocuments)
        .where(
          and(
            eq(trustVaultDocuments.ownerId, user.id),
            ne(trustVaultDocuments.state, "deleted"),
          ),
        ),
      db
        .select({ total: count() })
        .from(trustVaultAuditEvents)
        .where(
          and(
            eq(trustVaultAuditEvents.actorId, user.id),
            eq(trustVaultAuditEvents.action, "document.download"),
            eq(trustVaultAuditEvents.outcome, "allowed"),
            gte(trustVaultAuditEvents.createdAt, thirtyDaysAgo),
          ),
        ),
      db
        .select()
        .from(trustVaultAuditEvents)
        .where(eq(trustVaultAuditEvents.actorId, user.id))
        .orderBy(desc(trustVaultAuditEvents.id))
        .limit(8),
    ]);

    // Include both read and edit grants, but never revoked grants.
    const [shared] = await db
      .select({ total: count() })
      .from(trustVaultPermissions)
      .innerJoin(
        trustVaultDocuments,
        eq(trustVaultDocuments.id, trustVaultPermissions.documentId),
      )
      .where(
        and(
          eq(trustVaultPermissions.userId, user.id),
          eq(trustVaultDocuments.state, "active"),
          isNull(trustVaultPermissions.revokedAt),
        ),
      );
    const recentDownloadCount = downloads?.total ?? 0;
    const recentActivity = activity.map((event) => ({
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
    }));

    res.json(
      GetDashboardResponse.parse({
        ownedCount: owned?.total ?? 0,
        sharedWithMeCount: shared?.total ?? 0,
        recentDownloads: recentDownloadCount,
        recentActivity,
      }),
    );
  },
);

export default router;
