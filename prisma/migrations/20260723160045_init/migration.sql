-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('VISITOR', 'CONTRIBUTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProgramType" AS ENUM ('MAJOR', 'MINOR');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('PASSED', 'ENROLLED', 'PLANNED');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('EBOOK', 'LECTURE_NOTE', 'EXAM_RECALL', 'BLOG', 'CC98_POST', 'TOOL_TEMPLATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CopyrightStatus" AS ENUM ('PUBLIC_DOMAIN', 'AUTHORIZED', 'EXTERNAL_LINK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReviewResult" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_REVISION', 'MERGED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VISITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgram" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "type" "ProgramType" NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rawJson" JSONB NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "status" "CourseStatus" NOT NULL,
    "semester" INTEGER,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramVersion" (
    "id" TEXT NOT NULL,
    "majorName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "totalCredits" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequirementGroup" (
    "id" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "requiredCredits" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "RequirementGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramCourse" (
    "id" TEXT NOT NULL,
    "programVersionId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "suggestedSemester" INTEGER NOT NULL,
    "isCompulsory" BOOLEAN NOT NULL,
    "requirementGroupId" TEXT,

    CONSTRAINT "ProgramCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" DOUBLE PRECISION NOT NULL,
    "department" TEXT,
    "category" TEXT,
    "description" TEXT,
    "semester" TEXT,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "CourseExamPrep" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "chapters" JSONB NOT NULL,
    "route" JSONB NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseExamPrep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoursePrerequisite" (
    "id" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "prerequisiteCode" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'PREREQUISITE',
    "reason" TEXT,

    CONSTRAINT "CoursePrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "ResourceType" NOT NULL,
    "url" TEXT,
    "filePath" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "summary" TEXT,
    "copyrightStatus" "CopyrightStatus" NOT NULL DEFAULT 'UNKNOWN',
    "applicableStage" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'DRAFT',
    "submitterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseResource" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,

    CONSTRAINT "CourseResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "submitterId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "result" "ReviewResult",
    "reason" TEXT,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "result" "ReviewResult" NOT NULL,
    "reason" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Teacher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "school" TEXT NOT NULL DEFAULT '浙江大学',
    "score" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "rollCallPct" DOUBLE PRECISION,
    "chalaoshiId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherCourse" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "gpa" DOUBLE PRECISION,
    "gpaStd" DOUBLE PRECISION,
    "studentCount" INTEGER,

    CONSTRAINT "TeacherCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherReview" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT,
    "source" TEXT NOT NULL DEFAULT 'chalaoshi',

    CONSTRAINT "TeacherReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "UserProgram_userId_idx" ON "UserProgram"("userId");

-- CreateIndex
CREATE INDEX "UserProgram_programVersionId_idx" ON "UserProgram"("programVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProgram_userId_programVersionId_type_key" ON "UserProgram"("userId", "programVersionId", "type");

-- CreateIndex
CREATE INDEX "SourceImport_userId_idx" ON "SourceImport"("userId");

-- CreateIndex
CREATE INDEX "SourceImport_importedAt_idx" ON "SourceImport"("importedAt");

-- CreateIndex
CREATE INDEX "CourseRecord_userId_idx" ON "CourseRecord"("userId");

-- CreateIndex
CREATE INDEX "CourseRecord_courseCode_idx" ON "CourseRecord"("courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "CourseRecord_userId_courseCode_key" ON "CourseRecord"("userId", "courseCode");

-- CreateIndex
CREATE INDEX "ProgramVersion_majorName_idx" ON "ProgramVersion"("majorName");

-- CreateIndex
CREATE INDEX "ProgramVersion_year_idx" ON "ProgramVersion"("year");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramVersion_majorName_year_key" ON "ProgramVersion"("majorName", "year");

-- CreateIndex
CREATE INDEX "RequirementGroup_programVersionId_idx" ON "RequirementGroup"("programVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "RequirementGroup_programVersionId_name_key" ON "RequirementGroup"("programVersionId", "name");

-- CreateIndex
CREATE INDEX "ProgramCourse_programVersionId_idx" ON "ProgramCourse"("programVersionId");

-- CreateIndex
CREATE INDEX "ProgramCourse_courseCode_idx" ON "ProgramCourse"("courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCourse_programVersionId_courseCode_key" ON "ProgramCourse"("programVersionId", "courseCode");

-- CreateIndex
CREATE INDEX "Course_name_idx" ON "Course"("name");

-- CreateIndex
CREATE INDEX "Course_department_idx" ON "Course"("department");

-- CreateIndex
CREATE UNIQUE INDEX "CourseExamPrep_courseCode_key" ON "CourseExamPrep"("courseCode");

-- CreateIndex
CREATE INDEX "CourseExamPrep_courseCode_idx" ON "CourseExamPrep"("courseCode");

-- CreateIndex
CREATE INDEX "CoursePrerequisite_courseCode_idx" ON "CoursePrerequisite"("courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePrerequisite_courseCode_prerequisiteCode_key" ON "CoursePrerequisite"("courseCode", "prerequisiteCode");

-- CreateIndex
CREATE INDEX "Resource_status_idx" ON "Resource"("status");

-- CreateIndex
CREATE INDEX "Resource_submitterId_idx" ON "Resource"("submitterId");

-- CreateIndex
CREATE INDEX "Resource_type_idx" ON "Resource"("type");

-- CreateIndex
CREATE INDEX "CourseResource_courseCode_idx" ON "CourseResource"("courseCode");

-- CreateIndex
CREATE UNIQUE INDEX "CourseResource_resourceId_courseCode_key" ON "CourseResource"("resourceId", "courseCode");

-- CreateIndex
CREATE INDEX "Submission_resourceId_idx" ON "Submission"("resourceId");

-- CreateIndex
CREATE INDEX "Submission_result_idx" ON "Submission"("result");

-- CreateIndex
CREATE INDEX "Review_submissionId_idx" ON "Review"("submissionId");

-- CreateIndex
CREATE INDEX "Teacher_name_idx" ON "Teacher"("name");

-- CreateIndex
CREATE INDEX "Teacher_department_idx" ON "Teacher"("department");

-- CreateIndex
CREATE INDEX "Teacher_score_idx" ON "Teacher"("score");

-- CreateIndex
CREATE INDEX "TeacherCourse_courseCode_idx" ON "TeacherCourse"("courseCode");

-- CreateIndex
CREATE INDEX "TeacherCourse_teacherId_idx" ON "TeacherCourse"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherCourse_teacherId_courseCode_key" ON "TeacherCourse"("teacherId", "courseCode");

-- CreateIndex
CREATE INDEX "TeacherReview_teacherId_idx" ON "TeacherReview"("teacherId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceImport" ADD CONSTRAINT "SourceImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRecord" ADD CONSTRAINT "CourseRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRecord" ADD CONSTRAINT "CourseRecord_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementGroup" ADD CONSTRAINT "RequirementGroup_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCourse" ADD CONSTRAINT "ProgramCourse_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCourse" ADD CONSTRAINT "ProgramCourse_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramCourse" ADD CONSTRAINT "ProgramCourse_requirementGroupId_fkey" FOREIGN KEY ("requirementGroupId") REFERENCES "RequirementGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseExamPrep" ADD CONSTRAINT "CourseExamPrep_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseExamPrep" ADD CONSTRAINT "CourseExamPrep_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePrerequisite" ADD CONSTRAINT "CoursePrerequisite_prerequisiteCode_fkey" FOREIGN KEY ("prerequisiteCode") REFERENCES "Course"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseResource" ADD CONSTRAINT "CourseResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseResource" ADD CONSTRAINT "CourseResource_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourse" ADD CONSTRAINT "TeacherCourse_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherCourse" ADD CONSTRAINT "TeacherCourse_courseCode_fkey" FOREIGN KEY ("courseCode") REFERENCES "Course"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherReview" ADD CONSTRAINT "TeacherReview_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

