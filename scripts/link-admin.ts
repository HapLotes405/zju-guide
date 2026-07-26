import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const admin = await p.user.findUnique({ where: { username: "admin" } });
  const prog = await p.programVersion.findFirst();
  if (!admin || !prog) { console.log("missing"); process.exit(1); }

  await p.userProgram.upsert({
    where: { userId_programVersionId_type: { userId: admin.id, programVersionId: prog.id, type: "MAJOR" } },
    create: { userId: admin.id, programVersionId: prog.id, type: "MAJOR", isConfirmed: true },
    update: { isConfirmed: true },
  });
  console.log("OK:", prog.majorName, prog.year);
  await p.$disconnect();
}

main();
