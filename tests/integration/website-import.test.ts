import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanDatabase } from '../test-utils';
import {
  createImportJob,
  updateCandidate,
  submitCandidates,
  withdrawBatch,
} from "@/lib/website-import-service";

let admin: string;
let jobId: string;
let candidateId: string;
beforeAll(async () => {
  await cleanDatabase();
  admin = (
    await prisma.user.create({
      data: { username: "website_test_admin", passwordHash: "unused", role: "ADMIN" },
    })
  ).id;
  await prisma.course.create({ data: { code: "WEBTEST", name: "数据结构基础", credits: 3 } });
  const job = await createImportJob(admin, "turing");
  jobId = job.id;
  await prisma.websiteImportJob.update({ where: { id: jobId }, data: { status: "COMPLETED" } });
  candidateId = (
    await prisma.websiteImportCandidate.create({
      data: {
        jobId,
        title: "数据结构基础",
        url: "https://zju-turing.github.io/TuringCourses/major/data_structure/",
        canonicalUrl: "https://zju-turing.github.io/TuringCourses/major/data_structure/",
        summary: "课程入口",
        courseCodes: ["WEBTEST"],
        matchReason: "课程名一致",
      },
    })
  ).id;
});
afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("durable website imports", () => {
  it("requires explicit confirmation and does not publish during submission", async () => {
    const blocked = await submitCandidates(admin, jobId, [candidateId]);
    expect(blocked.results[0]?.status).toBe("FAILED");
    expect(await prisma.resource.count({ where: { importBatchId: jobId } })).toBe(0);
    await updateCandidate(admin, jobId, candidateId, {
      title: "数据结构基础",
      summary: "课程入口",
      type: "BLOG",
      applicableStage: "COURSE",
      courseCodes: ["WEBTEST"],
    });
    const result = await submitCandidates(admin, jobId, [candidateId]);
    expect(result.results[0]?.status).toBe("SUBMITTED");
    const resource = await prisma.resource.findUniqueOrThrow({
      where: { id: result.results[0]!.resourceId! },
    });
    expect(resource.status).toBe("DRAFT");
    expect(resource.copyrightStatus).toBe("EXTERNAL_LINK");
    expect(resource.sourceSite).toBeTruthy();
  });
  it("is idempotent under concurrent repeat submission", async () => {
    await Promise.all([
      submitCandidates(admin, jobId, [candidateId]),
      submitCandidates(admin, jobId, [candidateId]),
    ]);
    expect(await prisma.resource.count({ where: { importBatchId: jobId } })).toBe(1);
    expect(await prisma.submission.count({ where: { resource: { importBatchId: jobId } } })).toBe(
      1,
    );
  });
  it("deduplicates resources already submitted in another batch", async () => {
    const next = await createImportJob(admin, "turing");
    await prisma.websiteImportJob.update({ where: { id: next.id }, data: { status: "COMPLETED" } });
    const c = await prisma.websiteImportCandidate.create({
      data: {
        jobId: next.id,
        title: "同一课程",
        url: "https://zju-turing.github.io/TuringCourses/major/data_structure/#section",
        canonicalUrl: "https://zju-turing.github.io/TuringCourses/major/data_structure/",
        summary: "入口",
        courseCodes: ["WEBTEST"],
        matchReason: "同名",
        confirmed: true,
      },
    });
    const result = await submitCandidates(admin, next.id, [c.id]);
    expect(result.results[0]?.status).toBe("DUPLICATE");
    await withdrawBatch(admin, next.id);
    expect(await prisma.resource.count({ where: { importBatchId: jobId } })).toBe(1);
  });
  it("withdraws approved and pending records without deleting audit evidence", async () => {
    await prisma.resource.updateMany({
      where: { importBatchId: jobId },
      data: { status: "APPROVED" },
    });
    await withdrawBatch(admin, jobId);
    expect(
      await prisma.resource.count({ where: { importBatchId: jobId, status: "APPROVED" } }),
    ).toBe(0);
    expect(
      await prisma.submission.count({
        where: { resource: { importBatchId: jobId }, result: null },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { targetId: jobId, action: "WEBSITE_IMPORT_WITHDRAWN" },
      }),
    ).toBe(1);
    await expect(submitCandidates(admin, jobId, [candidateId])).rejects.toThrow();
  });
});
