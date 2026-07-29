import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  // 1. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: "acme-tenant-uuid-12345" },
    update: {},
    create: {
      id: "acme-tenant-uuid-12345",
      name: "Acme Electronics Corp",
      status: "ACTIVE",
      branding: {
        create: {
          brandName: "Acme Sales AI",
          primaryColor: "#06b6d4",
          secondaryColor: "#6366f1",
          supportEmail: "support@acme.com",
        }
      }
    },
  });
  console.log(`Created Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Create Admin User
  const passwordHash = await bcrypt.hash("admin123", 10);
  const user = await prisma.user.upsert({
    where: { email: "admin@acme.com" },
    update: {},
    create: {
      email: "admin@acme.com",
      name: "Acme Admin",
      passwordHash,
      role: "ADMIN",
      tenantId: tenant.id,
    },
  });
  console.log(`Created Admin User: ${user.email}`);

  // 3. Create Default WhatsApp Account
  const waAccount = await prisma.whatsAppAccount.create({
    data: {
      tenantId: tenant.id,
      phoneNumber: "+15550100777",
      phoneId: "123456789012345",
      wabaId: "987654321098765",
      accessToken: "EAAG...",
      verifyToken: "my_secure_webhook_verify_token_2026",
      status: "DISCONNECTED",
    },
  });
  console.log(`Created WhatsApp Account: ${waAccount.phoneNumber}`);

  // 4. Create AI Settings
  const aiSettings = await prisma.aISettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
      create: {
        tenantId: tenant.id,
        modelName: "llama-3.3-70b-versatile",
        temperature: 0.3,
      maxTokens: 600,
      systemPrompt: `You are an expert sales executive representing Acme Electronics Corp.
Your goal is to converse naturally on WhatsApp, answer questions, handle product inquiries, capture leads, and close sales.
Always query the product database to ensure stock availability and accurate pricing before making promises.
Do not hallucinate. If you do not have details, politely tell the customer that you will transfer them to a human representative.
Be polite, concise, and structured. Use bullet points for options when presenting choices.`,
      fallbackPrompt: "I am having trouble accessing our product databases right now, but let me check that details for you and I'll notify a human sales agent to follow up right away.",
    },
  });
  console.log("Created AI Settings.");

  // 5. Create Categories
  const categoryHome = await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Home Appliances",
      localId: "cat_home_1",
    },
  });

  const categoryOffice = await prisma.category.create({
    data: {
      tenantId: tenant.id,
      name: "Office Electronics",
      localId: "cat_off_2",
    },
  });
  console.log("Created Categories.");

  // 6. Create Products
  const prod1 = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      localId: "prod_pur_01",
      name: "PureFlow Water Purifier",
      sku: "ACME-PF-01",
      price: 299.99,
      stock: 45,
      categoryId: categoryHome.id,
      description: "Advanced RO + UV water purifier for clean and minerals-rich drinking water.",
      specifications: JSON.stringify({
        capacity: "8 Liters",
        filtrationStages: "6 Stages",
        warranty: "1 Year",
        dimensions: "350x250x450 mm",
      }),
      offers: JSON.stringify([
        { title: "10% Festive Discount", amount: 30 },
        { title: "Free Installation", amount: 0 },
      ]),
      discount: 10,
      gst: 18,
      syncSource: "LOCAL",
    },
  });

  const prod2 = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      localId: "prod_shred_02",
      name: "OfficeMax Paper Shredder",
      sku: "ACME-OM-02",
      price: 89.99,
      stock: 12,
      categoryId: categoryOffice.id,
      description: "Cross-cut paper shredder with high security for professional shredding.",
      specifications: JSON.stringify({
        shredCapacity: "12 Sheets",
        binCapacity: "15 Liters",
        runTime: "10 Mins Continuous",
      }),
      syncSource: "LOCAL",
    },
  });
  console.log("Created Products.");

  // 7. Create Knowledge Base Documents (FAQs)
  await prisma.knowledgeDocument.createMany({
    data: [
      {
        tenantId: tenant.id,
        title: "Return Policy",
        type: "POLICY",
        content: "Acme Electronics Corp offers a 10-day replacement warranty for all manufacturing defects. Products must be in original condition with packaging intact.",
      },
      {
        tenantId: tenant.id,
        title: "Installation Details",
        type: "FAQ",
        content: "PureFlow Water Purifier comes with free installation across standard delivery locations. Support team schedules an appointment within 24 hours of delivery.",
      },
    ],
  });
  console.log("Created Knowledge Documents.");

  // 8. Create Server Connector Configuration
  await prisma.serverConnection.create({
    data: {
      tenantId: tenant.id,
      type: "REST",
      url: "http://localhost:4000/api/v1",
      authType: "API_KEY",
      credentials: JSON.stringify({ apiKey: "acme_secret_local_connector_key" }),
      pollingInterval: 30,
      syncInterval: 3600,
      isOnline: false,
    },
  });
  console.log("Created Server Connector Settings.");

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
