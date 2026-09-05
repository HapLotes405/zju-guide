import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { signToken, hashPassword, comparePassword } from "@/lib/auth";
import { POST as register } from "@/app/api/auth/register/route";
import { PATCH as changePassword } from "@/app/api/auth/password/route";
import { clearRateLimits } from "@/lib/rate-limit";
import { PATCH } from "@/app/api/auth/me/route";
import { GET } from "@/app/api/me/submissions/route";

const db = vi.hoisted(() => ({ user: { update: vi.fn(), findUnique: vi.fn() }, resource: { findMany: vi.fn(), count: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

async function profile(username = "new-name", avatar?: File, extras?: Record<string, string>) {
  const form = new FormData();
  form.set("username", username);
  if (avatar) form.set("avatar", avatar);
  for (const [key, value] of Object.entries(extras ?? {})) form.set(key, value);
  return new NextRequest("http://localhost/api/auth/me", {
    method: "PATCH", body: form,
    headers: { authorization: `Bearer ${await signToken({ sub: "owner", role: "VISITOR" })}` },
  });
}

beforeEach(() => { vi.resetAllMocks(); clearRateLimits(); });

describe("settings API", () => {
  it("requires login for both endpoints", async () => {
    expect((await PATCH(new NextRequest("http://localhost/api/auth/me", { method: "PATCH" }))).status).toBe(401);
    expect((await GET(new NextRequest("http://localhost/api/me/submissions"))).status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("updates only the caller and ignores privileged or foreign fields", async () => {
    db.user.update.mockResolvedValue({ id: "owner", username: "new-name" });
    expect((await PATCH(await profile(" new-name ", undefined, { id: "someone-else", role: "ADMIN" }))).status).toBe(200);
    expect(db.user.update.mock.calls[0]![0]).toMatchObject({ where: { id: "owner" }, data: { username: "new-name" } });
    expect(db.user.update.mock.calls[0]![0].data).toEqual({ username: "new-name" });
  });

  it("rejects blank usernames and fake image uploads", async () => {
    expect((await PATCH(await profile("  "))).status).toBe(400);
    expect((await PATCH(await profile("valid", new File(["<svg></svg>"], "fake.png", { type: "image/png" })))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects oversized avatars", async () => {
    expect((await PATCH(await profile("valid", new File([new Uint8Array(1024 * 1024 + 1)], "large.png")))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("persists a PNG avatar", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7X8AAAAASUVORK5CYII=", "base64");
    db.user.update.mockResolvedValue({ id: "owner" });
    expect((await PATCH(await profile("valid", new File([png], "avatar.png", { type: "image/png" })))).status).toBe(200);
    expect(db.user.update.mock.calls[0]![0].data.avatar).toBe(`data:image/png;base64,${png.toString("base64")}`);
  });

  it("returns a useful conflict for duplicate usernames", async () => {
    db.user.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6" }));
    const result = await PATCH(await profile());
    expect(result.status).toBe(409);
    expect((await result.json()).error.code).toBe("USERNAME_TAKEN");
  });

  it("scopes history and pagination to the caller, including unapproved resources", async () => {
    db.resource.findMany.mockResolvedValue([{ id: "draft", status: "DRAFT" }]);
    db.resource.count.mockResolvedValue(21);
    const token = await signToken({ sub: "owner", role: "VISITOR" });
    const response = await GET(new NextRequest("http://localhost/api/me/submissions?page=2&userId=other", { headers: { authorization: `Bearer ${token}` } }));
    expect(response.status).toBe(200);
    expect(db.resource.findMany.mock.calls[0]![0]).toMatchObject({ where: { submitterId: "owner" }, skip: 20, take: 20 });
    expect(db.resource.count).toHaveBeenCalledWith({ where: { submitterId: "owner" } });
    expect((await response.json()).data.items[0].status).toBe("DRAFT");
    expect((await GET(new NextRequest("http://localhost/api/me/submissions?page=-1", { headers: { authorization: `Bearer ${token}` } }))).status).toBe(400);
  });
});


describe("password changes", () => {
  async function request(currentPassword: string, newPassword: string) {
    return new NextRequest("http://localhost/api/auth/password", {method:"PATCH", headers:{"content-type":"application/json",authorization: "Bearer " + await signToken({sub:"owner",role:"VISITOR"})},body:JSON.stringify({currentPassword,newPassword})});
  }
  it("requires authentication", async () => {
    expect((await changePassword(new NextRequest("http://localhost/api/auth/password",{method:"PATCH"}))).status).toBe(401);
  });
  it("rejects wrong current passwords and leaves the hash unchanged", async () => {
    db.user.findUnique.mockResolvedValue({passwordHash:hashPassword("old-secret")});
    expect((await changePassword(await request("incorrect","new-secret"))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("rejects short, overlong and unchanged passwords", async () => {
    db.user.findUnique.mockResolvedValue({passwordHash:hashPassword("old-secret")});
    for(const password of ["short","汉".repeat(25),"abc汉123", "abc𠀀123", "old-secret"]) expect((await changePassword(await request("old-secret",password))).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it("stores a new hash only for the authenticated user", async () => {
    db.user.findUnique.mockResolvedValue({passwordHash:hashPassword("old-secret")});
    db.user.update.mockResolvedValue({id:"owner"});
    expect((await changePassword(await request("old-secret","new-secret"))).status).toBe(200);
    const update=db.user.update.mock.calls[0]![0];
    expect(update.where).toEqual({id:"owner"});
    expect(comparePassword("new-secret",update.data.passwordHash)).toBe(true);
    expect(comparePassword("old-secret",update.data.passwordHash)).toBe(false);
  });
});


it("rejects Han characters when registering a password", async () => {
  const response = await register(new NextRequest("http://localhost/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "new-user", password: "abc汉12345" }),
  }));
  expect(response.status).toBe(400);
  expect((await response.json()).error.message).toBe("密码不能包含汉字");
  expect(db.user.findUnique).not.toHaveBeenCalled();
});
