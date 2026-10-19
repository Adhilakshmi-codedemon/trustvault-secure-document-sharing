export type PolicyPermission = "read" | "edit" | null;
export type PolicyDocumentState = "pending" | "active" | "deleted";
export type PolicyAccessLevel = "read" | "edit" | "owner";

export function canAccessDocument(input: {
  actorId: string;
  ownerId: string;
  permission: PolicyPermission;
  state: PolicyDocumentState;
  accessLevel: PolicyAccessLevel;
  activeOnly?: boolean;
}): boolean {
  if (input.state === "deleted") return false;
  if (input.activeOnly && input.state !== "active") return false;
  if (input.actorId === input.ownerId) return true;
  if (input.state !== "active" || input.accessLevel === "owner") return false;
  if (input.accessLevel === "edit") return input.permission === "edit";
  return input.permission === "read" || input.permission === "edit";
}
