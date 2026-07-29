import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Updating WhatsApp Account credentials in database...");

  // Find the seeded WhatsApp account
  const account = await prisma.whatsAppAccount.findFirst();

  if (!account) {
    console.error("No WhatsApp account found in the database. Please run migrations/seed first.");
    process.exit(1);
  }

  const updatedAccount = await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: {
      phoneId: "1078761195330328",
      wabaId: "1002004376092673",
      phoneNumber: "+919385811823",
      status: "CONNECTED",
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || account.accessToken,
      verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || account.verifyToken,
    }
  });

  console.log("=========================================");
  console.log(" SUCCESS: WhatsApp Credentials Updated!");
  console.log("=========================================");
  console.log(`- ID: ${updatedAccount.id}`);
  console.log(`- Phone Number: ${updatedAccount.phoneNumber}`);
  console.log(`- Phone Number ID: ${updatedAccount.phoneId}`);
  console.log(`- Business Account ID: ${updatedAccount.wabaId}`);
  console.log("=========================================");
}

main()
  .catch((e) => {
    console.error("Update failed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
