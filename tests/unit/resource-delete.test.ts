import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";
import { DELETE } from "@/app/api/resources/[id]/route";
const mocks = vi.hoisted(() => ({findUnique:vi.fn(),delete:vi.fn(),unlink:vi.fn()}));
vi.mock("@/lib/prisma",()=>({prisma:{resource:{findUnique:mocks.findUnique,delete:mocks.delete}}}));
vi.mock("node:fs/promises",async importOriginal => ({...await importOriginal<typeof import("node:fs/promises")>(),unlink:mocks.unlink}));
const id="33333333-3333-4333-8333-333333333333";
async function run(auth=true, resourceId=id) {
  return DELETE(new NextRequest("http://localhost/api/resources/"+resourceId,{method:"DELETE",headers:auth?{authorization:"Bearer "+await signToken({sub:"owner",role:"VISITOR"})}:{}}),{params:Promise.resolve({id:resourceId})});
}
beforeEach(()=>vi.resetAllMocks());
it("requires login",async()=>{expect((await run(false)).status).toBe(401);expect(mocks.delete).not.toHaveBeenCalled();});
it("rejects invalid and missing resources",async()=>{expect((await run(true,"invalid")).status).toBe(404);mocks.findUnique.mockResolvedValue(null);expect((await run()).status).toBe(404);expect(mocks.delete).not.toHaveBeenCalled();});
it("prevents deleting another user's submission or attachment",async()=>{mocks.findUnique.mockResolvedValue({submitterId:"other",filePath:"other.pdf"});expect((await run()).status).toBe(403);expect(mocks.delete).not.toHaveBeenCalled();expect(mocks.unlink).not.toHaveBeenCalled();});
it("deletes the owner's resource and cleans up its attachment",async()=>{mocks.findUnique.mockResolvedValue({submitterId:"owner",filePath:"owned.pdf"});mocks.delete.mockResolvedValue({id});expect((await run()).status).toBe(200);expect(mocks.delete).toHaveBeenCalledWith({where:{id,submitterId:"owner"}});expect(mocks.unlink).toHaveBeenCalledOnce();});
it("succeeds without an attachment",async()=>{mocks.findUnique.mockResolvedValue({submitterId:"owner",filePath:null});expect((await run()).status).toBe(200);expect(mocks.unlink).not.toHaveBeenCalled();});
it("succeeds if attachment was already removed",async()=>{mocks.findUnique.mockResolvedValue({submitterId:"owner",filePath:"missing.pdf"});mocks.unlink.mockRejectedValue(Object.assign(new Error("missing"),{code:"ENOENT"}));expect((await run()).status).toBe(200);});
it("does not delete attachments if the database operation fails",async()=>{mocks.findUnique.mockResolvedValue({submitterId:"owner",filePath:"keep.pdf"});mocks.delete.mockRejectedValue(new Error("database offline"));const log=vi.spyOn(console,"error").mockImplementation(()=>{});try{expect((await run()).status).toBe(500);expect(mocks.unlink).not.toHaveBeenCalled();}finally{log.mockRestore();}});
