import { runImportOnce } from "../src/lib/website-import-worker";
import { prisma } from "../src/lib/prisma";

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
async function main() {
  if (process.env.WEBSITE_IMPORT_ENABLED !== "true")
    throw new Error("Set WEBSITE_IMPORT_ENABLED=true to run the import worker");
  do {
    try {
      await runImportOnce();
    } catch (error) {
      console.error("Website import worker error", error);
    }
    if (process.argv.includes("--once")) break;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } while (!stopping);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
