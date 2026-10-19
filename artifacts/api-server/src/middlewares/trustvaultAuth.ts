import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, trustVaultUsers, type TrustVaultUser } from "@workspace/db";
import { recordAuditEvent } from "../lib/trustvault-audit";

export const requireTrustVaultUser: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
      req.log.warn({ userId }, "Authenticated account has no email address");
      res.status(403).json({ error: "A verified email address is required" });
      return;
    }

    const name =
      [clerkUser.firstName, clerkUser.lastName]
        .filter((part): part is string => Boolean(part))
        .join(" ")
        .trim() || email;
    const bootstrapAdminEmail = process.env.TRUSTVAULT_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();
    const isBootstrapAdmin =
      Boolean(bootstrapAdminEmail) &&
      email.trim().toLowerCase() === bootstrapAdminEmail;

    const [user] = await db
      .insert(trustVaultUsers)
      .values({
        id: userId,
        email,
        name,
        role: isBootstrapAdmin ? "admin" : "owner",
      })
      .onConflictDoUpdate({
        target: trustVaultUsers.id,
        set: {
          email,
          name,
          ...(isBootstrapAdmin ? { role: "admin" as const } : {}),
        },
      })
      .returning();

    if (!user) {
      throw new Error("Could not synchronize the signed-in TrustVault user");
    }
    res.locals.tvUser = user;
    next();
  } catch (error) {
    req.log.error({ err: error, userId }, "Could not synchronize user identity");
    res.status(503).json({ error: "Identity service is temporarily unavailable" });
  }
};

export function trustVaultUser(res: {
  locals: Record<string, unknown>;
}): TrustVaultUser {
  const user = res.locals.tvUser;
  if (!user || typeof user !== "object" || !("id" in user)) {
    throw new Error("Authenticated TrustVault user was not attached to response");
  }
  return user as TrustVaultUser;
}

export function requireTrustVaultRole(
  ...roles: TrustVaultUser["role"][]
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const user = trustVaultUser(res);
    if (roles.includes(user.role)) {
      next();
      return;
    }

    try {
      await recordAuditEvent(user, {
        action: "authorization.role_denied",
        outcome: "denied",
        details: `Required one of: ${roles.join(", ")}`,
      });
    } catch (error) {
      req.log.error({ err: error, userId: user.id }, "Could not record denied role action");
    }
    res.status(403).json({ error: "Your account role cannot perform this action" });
  };
}

export async function findTrustVaultUser(
  userId: string,
): Promise<TrustVaultUser | undefined> {
  const [user] = await db
    .select()
    .from(trustVaultUsers)
    .where(eq(trustVaultUsers.id, userId))
    .limit(1);
  return user;
}
