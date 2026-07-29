import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Searching database for 'sd card', '512', or '256':");
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "sd", mode: "insensitive" } },
        { name: { contains: "512", mode: "insensitive" } },
        { name: { contains: "256", mode: "insensitive" } },
        { specifications: { contains: "512", mode: "insensitive" } },
        { specifications: { contains: "256", mode: "insensitive" } }
      ]
    }
  });

  console.log("Found matches:", products.length);
  for (const p of products) {
    console.log(`- ID: ${p.localId} | Name: "${p.name}" | Price: ${p.price} | Specs: ${p.specifications}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
