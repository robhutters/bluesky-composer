import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const notesSelect = vi.fn();
  const metadataUpsert = vi.fn();

  const fromMock = vi.fn((table: string) => {
    if (table === "notes") {
      return {
        select: () => ({ eq: () => ({ single: notesSelect }) }),
      } as any;
    }
    if (table === "note_metadata") {
      return { upsert: metadataUpsert } as any;
    }
    return {} as any;
  });

  return { authGetUser, notesSelect, metadataUpsert, fromMock };
});

vi.mock("@/app/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    auth: { getUser: mocks.authGetUser },
    from: mocks.fromMock,
  },
}));

let handlerGet: any;
let handlerPost: any;

describe("metadata API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../app/api/metadata/route");
    handlerGet = mod.GET;
    handlerPost = mod.POST;
  });

  it("returns 401 when missing auth header", async () => {
    const req = new Request("http://localhost/api/metadata", { method: "GET" });
    const res = await handlerGet(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 if note does not belong to user on POST", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user1" } }, error: null });
    mocks.notesSelect.mockResolvedValue({ data: { user_id: "other" }, error: null });
    const req = new Request("http://localhost/api/metadata", {
      method: "POST",
      headers: { authorization: "Bearer token" },
      body: JSON.stringify({ noteId: "note1", pinned: true, tags: [] }),
    });
    const res = await handlerPost(req as any);
    expect(res.status).toBe(403);
  });

  it("upserts metadata when owner matches", async () => {
    mocks.authGetUser.mockResolvedValue({ data: { user: { id: "user1" } }, error: null });
    mocks.notesSelect.mockResolvedValue({ data: { user_id: "user1" }, error: null });
    mocks.metadataUpsert.mockResolvedValue({ data: null, error: null });
    const req = new Request("http://localhost/api/metadata", {
      method: "POST",
      headers: { authorization: "Bearer token", "Content-Type": "application/json" },
      body: JSON.stringify({ noteId: "note1", pinned: true, tags: ["tag"] }),
    });
    const res = await handlerPost(req as any);
    expect(res.status).toBe(200);
    expect(mocks.metadataUpsert).toHaveBeenCalledTimes(1);
  });
});
