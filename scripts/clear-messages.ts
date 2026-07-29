import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up Message table to clear duplicates...");
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  console.log("Database cleared successfully!");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
