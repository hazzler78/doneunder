import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { User } from "@supabase/supabase-js";
import { oauthForwardPath, safeInternalPath } from "../lib/auth-paths";
import { sessionCookieOptions } from "../lib/supabase/route-handler";
import { diverFieldsFromAuthUser, ensureDiverProfileRow } from "../lib/diver-bootstrap";
import { upsertWorkspaceThread } from "../lib/agent-threads";
import { inboundReplyToAddress, resolveSenderIdentity } from "../lib/email";
import {
  claimPreferredUsername,
  isIndexableAmbassadorUsername,
  preferredUsernameFromIdentity,
} from "../lib/usernames";

function authUser(partial: Partial<User> & Pick<User, "id">): User {
  return {
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-08-19T00:00:00.000Z",
    ...partial,
  } as User;
}

type UserRow = {
  id: string;
  role: string;
  email: string | null;
  username: string | null;
  full_name?: string | null;
};

function fakeUsersClient(rows: UserRow[]) {
  const users = rows.map((row) => ({ ...row }));

  function match(col: string, val: unknown) {
    return users.find((row) => (row as Record<string, unknown>)[col] === val) ?? null;
  }

  return {
    from(table: string) {
      if (table !== "users") throw new Error(`unexpected table ${table}`);
      const filters: Array<[string, unknown]> = [];
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return api;
        },
        async maybeSingle() {
          const [col, val] = filters[0] ?? [];
          return { data: col ? match(col, val) : users[0] ?? null, error: null };
        },
        upsert(row: UserRow) {
          const index = users.findIndex((item) => item.id === row.id);
          if (index >= 0) users[index] = { ...users[index], ...row };
          else users.push({ ...row });
          return {
            select() {
              return {
                async maybeSingle() {
                  return { data: match("id", row.id), error: null };
                },
              };
            },
          };
        },
        update(patch: Partial<UserRow>) {
          return {
            async eq(col: string, val: unknown) {
              const found = match(col, val);
              if (found) Object.assign(found, patch);
              return { error: null };
            },
          };
        },
      };
      return api;
    },
    users,
  };
}

describe("session cookies", () => {
  it("always sets path=/ so workspace can read the Google session", () => {
    const options = sessionCookieOptions({ path: "/auth/callback", sameSite: "lax", httpOnly: true });
    assert.equal(options.path, "/");
    assert.equal(options.sameSite, "lax");
    assert.equal(options.httpOnly, true);
  });
});

describe("safeInternalPath", () => {
  it("keeps workspace and other same-origin paths", () => {
    assert.equal(safeInternalPath("/workspace"), "/workspace");
    assert.equal(safeInternalPath("/preview/cv"), "/preview/cv");
  });

  it("rejects open redirects", () => {
    assert.equal(safeInternalPath("https://evil.test"), "/workspace");
    assert.equal(safeInternalPath("//evil.test"), "/workspace");
    assert.equal(safeInternalPath("\\evil"), "/workspace");
    assert.equal(safeInternalPath(null), "/workspace");
  });
});

describe("oauthForwardPath", () => {
  it("sends a homepage auth code to /auth/callback", () => {
    const path = oauthForwardPath("/", new URLSearchParams("code=96d76ae5-6f99-4bcf-b4f9-8b676f1f38de"));
    assert.equal(
      path,
      "/auth/callback?code=96d76ae5-6f99-4bcf-b4f9-8b676f1f38de&next=%2Fworkspace",
    );
  });

  it("does not loop on the real callback route", () => {
    assert.equal(oauthForwardPath("/auth/callback", new URLSearchParams("code=abc")), null);
  });
});

describe("Google diver bootstrap", () => {
  it("creates a diver row from a Google account", () => {
    const user = authUser({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      email: "jane.diver@gmail.com",
      user_metadata: { full_name: "Jane Diver", name: "Jane Diver" },
    });
    const fields = diverFieldsFromAuthUser(user);
    assert.equal(fields.insert.role, "diver");
    assert.equal(fields.insert.email, "jane.diver@gmail.com");
    assert.equal(fields.insert.full_name, "Jane Diver");
    assert.equal(fields.insert.username, "diver-aaaaaaaa");
    assert.equal(fields.metadataUsername, null);
  });

  it("does not invent a new role when a company already exists", () => {
    const user = authUser({
      id: "company-1",
      email: "ops@contractor.com",
      user_metadata: { name: "Ops" },
    });
    const existing = {
      id: "company-1",
      role: "company",
      email: "ops@contractor.com",
      username: "north-sea-co",
      full_name: "North Sea Co",
    };
    const fields = diverFieldsFromAuthUser(user, existing);
    assert.equal(fields.insert.role, "diver");
    assert.equal(existing.role, "company");
    assert.equal(fields.fullName, "Ops");
  });

  it("creates a diver_profiles row before Hermes can open a thread", async () => {
    const profileIds: string[] = [];
    const db = {
      from(table: string) {
        if (table === "diver_profiles") {
          return {
            async upsert(row: { user_id: string }) {
              profileIds.push(row.user_id);
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    await ensureDiverProfileRow(db as never, "velvet-user-id");
    assert.deepEqual(profileIds, ["velvet-user-id"]);
  });

  it("does not open a web thread until the diver_profiles row exists", async () => {
    const profileIds: string[] = [];
    const threads: Array<{ diver_id: string | null }> = [];
    const db = {
      from(table: string) {
        if (table === "diver_profiles") {
          return {
            async upsert(row: { user_id: string }) {
              profileIds.push(row.user_id);
              return { error: null };
            },
          };
        }
        if (table === "agent_threads") {
          const api = {
            upsert(row: { diver_id: string | null }) {
              if (row.diver_id && !profileIds.includes(row.diver_id)) {
                throw new Error(
                  'insert or update on table "agent_threads" violates foreign key constraint "agent_threads_diver_id_fkey"',
                );
              }
              threads.push(row);
              return api;
            },
            select() {
              return api;
            },
            async maybeSingle() {
              return { data: { id: "thread-1", ...threads[0] }, error: null };
            },
          };
          return api;
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const thread = await upsertWorkspaceThread(db as never, {
      userId: "velvet-user-id",
      role: "diver",
      channel: "web",
      externalChatId: "velvet-user-id",
    });
    assert.deepEqual(profileIds, ["velvet-user-id"]);
    assert.equal(thread.id, "thread-1");
  });
});

describe("preferred usernames", () => {
  it("keeps demo handles off Google and the homepage", () => {
    assert.equal(isIndexableAmbassadorUsername("gareth"), true);
    assert.equal(isIndexableAmbassadorUsername("gareth-demo"), false);
    assert.equal(isIndexableAmbassadorUsername("qa-test"), false);
  });

  it("uses the Gmail local-part when metadata has no handle", () => {
    assert.equal(preferredUsernameFromIdentity({ email: "jane.diver@gmail.com" }), "jane.diver");
  });

  it("claims the Gmail handle for a new fallback username", async () => {
    const db = fakeUsersClient([
      {
        id: "user-1",
        role: "diver",
        email: "jane.diver@gmail.com",
        username: "diver-user-1",
      },
    ]);
    const claimed = await claimPreferredUsername(db as never, {
      userId: "user-1",
      email: "jane.diver@gmail.com",
      currentUsername: "diver-user-1",
    });
    assert.equal(claimed, "jane.diver");
    assert.equal(db.users[0]?.username, "jane.diver");
  });

  it("does not steal a real diver username", async () => {
    const db = fakeUsersClient([
      { id: "user-1", role: "diver", email: "jane.diver@gmail.com", username: "diver-user-1" },
      { id: "user-2", role: "diver", email: "other@doneunder.ai", username: "jane.diver" },
    ]);
    const claimed = await claimPreferredUsername(db as never, {
      userId: "user-1",
      email: "jane.diver@gmail.com",
      currentUsername: "diver-user-1",
    });
    assert.equal(claimed, "diver-user-1");
  });
});

describe("outbound email identity", () => {
  const previous = {
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_FROM_DOMAIN: process.env.RESEND_FROM_DOMAIN,
    RESEND_INBOUND_DOMAIN: process.env.RESEND_INBOUND_DOMAIN,
  };

  afterEach(() => {
    process.env.RESEND_FROM_EMAIL = previous.RESEND_FROM_EMAIL;
    process.env.RESEND_FROM_DOMAIN = previous.RESEND_FROM_DOMAIN;
    process.env.RESEND_INBOUND_DOMAIN = previous.RESEND_INBOUND_DOMAIN;
  });

  it("relays Gmail divers through doneunder and keeps Hermes Reply-To", () => {
    process.env.RESEND_FROM_EMAIL = "Hermes <hello@doneunder.ai>";
    process.env.RESEND_FROM_DOMAIN = "doneunder.ai";
    process.env.RESEND_INBOUND_DOMAIN = "inbound.doneunder.ai";

    const identity = resolveSenderIdentity("jane.diver@gmail.com", "Jane Diver", "jane.diver", "user-1");
    assert.equal(identity.mode, "relay");
    assert.equal(identity.from, "Jane Diver via doneunder.ai <hello@doneunder.ai>");
    assert.equal(identity.replyTo, "jane.diver@inbound.doneunder.ai");
    assert.equal(inboundReplyToAddress("jane.diver"), "jane.diver@inbound.doneunder.ai");
  });

  it("sends as a doneunder.ai mailbox when the account is on that domain", () => {
    process.env.RESEND_FROM_EMAIL = "Hermes <hello@doneunder.ai>";
    process.env.RESEND_FROM_DOMAIN = "doneunder.ai";

    const identity = resolveSenderIdentity("gareth@doneunder.ai", "Gareth Darrin Middleton", "gareth");
    assert.equal(identity.mode, "user");
    assert.equal(identity.from, "Gareth Darrin Middleton <gareth@doneunder.ai>");
  });
});
