import assert from "node:assert/strict";
import test from "node:test";
import { canAccessDocument } from "../src/lib/trustvault-policy.ts";

const document = {
  actorId: "user-viewer",
  ownerId: "user-owner",
  state: "active",
  activeOnly: false,
};

test("owner has full access to their document, including a pending upload", () => {
  assert.equal(
    canAccessDocument({
      ...document,
      actorId: "user-owner",
      state: "pending",
      permission: null,
      accessLevel: "owner",
    }),
    true,
  );
  assert.equal(
    canAccessDocument({
      ...document,
      actorId: "user-owner",
      state: "pending",
      permission: null,
      accessLevel: "edit",
    }),
    true,
  );
});

test("read grant permits reading but cannot edit metadata", () => {
  assert.equal(
    canAccessDocument({
      ...document,
      permission: "read",
      accessLevel: "read",
    }),
    true,
  );
  assert.equal(
    canAccessDocument({
      ...document,
      permission: "read",
      accessLevel: "edit",
    }),
    false,
  );
});

test("edit grant permits read and edit but not ownership-only actions", () => {
  assert.equal(
    canAccessDocument({
      ...document,
      permission: "edit",
      accessLevel: "read",
    }),
    true,
  );
  assert.equal(
    canAccessDocument({
      ...document,
      permission: "edit",
      accessLevel: "edit",
    }),
    true,
  );
  assert.equal(
    canAccessDocument({
      ...document,
      permission: "edit",
      accessLevel: "owner",
    }),
    false,
  );
});

test("revoked grants and non-owner admin roles do not bypass the document grant", () => {
  assert.equal(
    canAccessDocument({
      ...document,
      permission: null,
      accessLevel: "read",
    }),
    false,
  );
  assert.equal(
    canAccessDocument({
      ...document,
      actorRole: "admin",
      permission: null,
      accessLevel: "read",
    }),
    false,
  );
});

test("pending documents are hidden from grantees and deleted documents are hidden from everyone", () => {
  assert.equal(
    canAccessDocument({
      ...document,
      state: "pending",
      permission: "edit",
      accessLevel: "read",
    }),
    false,
  );
  assert.equal(
    canAccessDocument({
      ...document,
      actorId: "user-owner",
      state: "deleted",
      permission: null,
      accessLevel: "owner",
    }),
    false,
  );
});

test("download requires an active document even for its owner", () => {
  assert.equal(
    canAccessDocument({
      ...document,
      actorId: "user-owner",
      state: "pending",
      permission: null,
      accessLevel: "read",
      activeOnly: true,
    }),
    false,
  );
});
