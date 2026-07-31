import { prisma } from "../db";
import { logger } from "../logger";
import { getProductCatalog } from "../sync/syncEngine";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Perform semantic FAQs or policies search from Knowledge Base (RAG).
 */
async function searchKnowledgeBase(tenantId: string, query: string): Promise<string> {
  const documents = await prisma.knowledgeDocument.findMany({
    where: { tenantId },
  });

  const queryTerms = query.toLowerCase().split(/\s+/);
  const matchedDocs = documents
    .map((doc) => {
      let score = 0;
      const contentLower = doc.content.toLowerCase();
      const titleLower = doc.title.toLowerCase();

      for (const term of queryTerms) {
        if (titleLower.includes(term)) score += 5;
        if (contentLower.includes(term)) score += 1;
      }
      return { doc, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (matchedDocs.length === 0) return "No warranty or FAQ articles match this query.";

  return matchedDocs
    .map((item) => `[Knowledge Base: ${item.doc.title}]\n${item.doc.content}`)
    .join("\n\n");
}

/**
 * Main AI Engine response generator using Groq.
 */
export async function processCustomerMessage(
  tenantId: string,
  customerId: string,
  messageContent: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    logger.error("Missing GEMINI_API_KEY environment variable");
    return "Our system is undergoing maintenance. Please connect again shortly.";
  }

  const apiUrl = GEMINI_API_URL;

  // 1. Fetch Tenant's AI configurations & Salespersons
  const [aiSettings, salespersons] = await Promise.all([
    prisma.aISettings.findUnique({
      where: { tenantId },
    }),
    prisma.salesperson.findMany({
      where: { tenantId },
    }),
  ]);

  const salespersonsList = salespersons.map(s => `- ${s.name} (Phone: ${s.phone}, Specialization: ${s.specialization})`).join("\n");
  const salespersonsContext = salespersonsList.length > 0
    ? `\nREGISTERED SALESPERSONS / SPECIALIZED REPRESENTATIVES:\n${salespersonsList}\n`
    : "";

  const dbPrompt = aiSettings?.systemPrompt || "You are an AI Sales Assistant representing Smart IT Solutions No.1 In Laptops service | Computer Dealer | Printer Dealer | CCTV Installation | Gaming PC. Talk like a professional human sales executive—polite, humble, knowledgeable, persuasive, but never pushy. Understand customer needs first. Explain products clearly with benefits and comparisons. If the user is still unsure or asks for a human, offer a warm handover and share the sales contact number. That number should be managed from the Admin Dashboard. Support discounts configured in the dashboard—by product, brand, category, quantity, or promotions. Apply them automatically. GST is 18% by default, but must be editable in the dashboard. Do not mention stock counts; if a product exists in the configured data source, show it as available. Do not invent missing data. If details are missing, say so and offer a human handover. Always aim for clarity, trust, and conversion.";
  const salesContactNumber = aiSettings?.contactPhone || "+919385811823";
  const currentGstRate = Number(aiSettings?.gstRate ?? 18.0);

  const systemPrompt = `${dbPrompt}
  
  CURRENT CONFIGURABLE PARAMETERS:
  - Company / Client Name: Smart IT Solutions No.1 In Laptops service | Computer Dealer | Printer Dealer | CCTV Installation | Gaming PC
  - Sales Contact Number: ${salesContactNumber} (If the user asks for a human or is unsure, share this number)
  - Default GST Tax Rate: ${currentGstRate} percent (Apply this rate to calculations unless a product-specific GST is specified)
  ${salespersonsContext}
  CRITICAL ASSISTANT CONSTRAINTS:
  1. You are ONLY allowed to recommend, list, or quote products that are returned by the search tools or RAG queries.
  2. If the user asks for a product that is NOT in your search results, you must politely inform them that we do not carry this item or that it is not available in our store catalog at the moment. Do NOT recommend models from your general pre-trained knowledge base. If your first search query returns no results, you MUST NOT call the searchProducts tool a second time. Instead, immediately respond to the customer informing them that the item is not available in our catalog.
  3. Never make up or hallucinate product details, prices, or specifications. Do not invent missing data. If details are missing, say so and offer a human handover to the sales number: ${salesContactNumber}.
  4. NEVER use the word "stock" or make references to checking stock levels, stock status, or inventory (do NOT say "out of stock", "checked our stock", or "in stock"). Simply state that the product is available in our store catalog and mention its price.
  5. Support and automatically apply discounts (by product, brand, category, quantity, or promotions) when quoting prices.
  6. CURRENCY: Always quote prices in Indian Rupees (INR, ₹, or Rs.) instead of dollars ($).
  7. GST INCLUSION & FORMATTING: The prices in your database search results are base prices and are EXCLUSIVE of GST. You MUST automatically calculate and add the GST of ${currentGstRate} percent (or the product-specific GST) to the price. When quoting prices, if the customer's query matches MULTIPLE products/models (e.g., they ask for 'all types of 2mp camera' or the search query returns multiple matching items), you MUST display the complete price breakdown (both PDC and CDC, if CDC is present) for EACH matching product/model individually. Clearly print the product's full name as a header before each model's breakdown, and separate each product block with double blank lines. You MUST format each breakdown EXACTLY as follows, using newlines (\n) to put each bullet point on its own separate line (do NOT collapse bullet points onto the same line):

  ### [Product Full Name]
  - **PDC (Base Price)**: ₹[PDC Base Price, e.g., 1,952.50]
  - **GST (${currentGstRate} percent)**: ₹[Calculated GST for PDC, e.g., 351.45]
  - **NETT Price**: ₹[PDC Base plus GST, e.g., 2,303.95]

  - **CDC (Base Price)**: ₹[CDC Base Price, e.g., 1,800.00]
  - **GST (${currentGstRate} percent)**: ₹[Calculated GST for CDC, e.g., 324.00]
  - **NETT Price**: ₹[CDC Base plus GST, e.g., 2,124.00]

  CRITICAL: Put each bullet point on its own separate line using newlines. Do NOT use middle dots (·), do NOT use single asterisks (*) for list bolding, and ALWAYS separate the PDC and CDC blocks with an empty blank line. Use the Rupee symbol (₹) before all price numbers.
  8. HUMAN SPEECH STYLE: Talk like a real in-store human sales executive. NEVER use search jargon or say "I've checked our current catalog", "according to our database", or "in our system". Instead, just state availability naturally, e.g., "Unfortunately, we do not carry the 512 GB SD card right now" or "No, sorry, we don't have the 256 GB SD card available at the moment."
  9. ZERO PRICE ITEMS: If a product is returned in your search results but has a price of 0, state that the product is available in our store, but explain that the price is not listed in our database records at the moment. Offer a warm handover to the sales contact number: ${salesContactNumber} so they can check the exact price. Do NOT say we do not carry the product.
  10. STORAGE PRODUCTS REQUIREMENT SHIELD: If a customer inquires about or asks for an SD Card, a SanDisk product, or a Pen Drive, you MUST NOT immediately display or quote pricing. Instead, you must first ask clarification questions to understand their requirements (capacity needed, speed preferences, device compatibility, use case, and budget). Present the suitable models and options from your search results to educate them first, and recommend the best fit. Only after explaining the best-fit options can you display the corresponding billing or price details.
  11. SERVICE ROUTING SPECIALIZATION: When a client requests more information about a specific service (such as CCTV installation, networking, biometrics, etc.), or if they ask to contact a human agent, you must check the REGISTERED SALESPERSONS directory. If a salesperson is registered for that service specialization, you MUST display and send that specific salesperson's contact details (Name and Phone Number) to the customer as the warm handover. If no representative matches that specialization, fallback to the main sales contact number: ${salesContactNumber}.
  12. HUMAN GREETINGS RESPONSE: If the customer sends a simple greeting like "hello", "HI", "hey", or "good morning" without asking about a specific product or service, you MUST respond immediately with a warm welcome: "Hello! Welcome to Smart IT Solutions - No.1 In Laptops service | Computer Dealer | Printer Dealer | CCTV Installation | Gaming PC. How can I assist you today?". Do NOT call the searchProducts tool.`;

  let modelName = aiSettings?.modelName || "gemini-2.0-flash";
  if (!modelName.includes("gemini")) {
    modelName = "gemini-2.0-flash";
  }
  const candidateModels = Array.from(new Set([modelName, "gemini-2.0-flash", "gemini-1.5-flash"]));
  const temperature = aiSettings?.temperature ?? 0.3;

  // 2. Fetch Customer Context and conversation history
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      conversations: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 15,
          },
        },
      },
      aiMemory: true,
    },
  });

  const rawHistory = customer?.conversations[0]?.messages || [];
  const historyMessages = [...rawHistory].reverse();
  const memoryContext = customer?.aiMemory?.contextData || "No prior customer context recorded yet.";

  // 3. Perform RAG injection
  const kbContext = await searchKnowledgeBase(tenantId, messageContent);

  // 4. Build message structures
  const messages: any[] = [
    {
      role: "system",
      content: `${systemPrompt}
      
      ## Customer Profile & Memory:
      ${memoryContext}

      ## Matching Knowledge Base Context (RAG):
      ${kbContext}`,
    },
  ];

  // Feed conversation history
  for (const msg of historyMessages) {
    messages.push({
      role: msg.sender === "CUSTOMER" ? "user" : "assistant",
      content: msg.content,
    });
  }

  // Add current message
  messages.push({ role: "user", content: messageContent });

  // 5. Define Groq Tools/Functions
  const tools = [
    {
      type: "function",
      function: {
        name: "searchProducts",
        description: "Search products in the catalog by name or specifications description.",
        parameters: {
          type: "object",
          properties: {
            searchQuery: { type: "string", description: "Search text query." },
          },
          required: ["searchQuery"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "createLead",
        description: "Capture user purchase intent, budget, and contact info to create a lead pipeline record.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            phone: { type: "string" },
            interestedProduct: { type: "string" },
            budget: {
              type: "number",
              description: "The customer's budget as a numeric value. Omit this parameter completely if the budget is unknown or not explicitly stated by the user. Do NOT provide string values like 'Not Provided'."
            },
            timeline: { type: "string" },
          },
          required: ["name", "phone", "interestedProduct"],
        },
      },
    },
  ];

  try {
    let response: Response | null = null;
    let selectedModel = modelName;

    for (const activeModel of candidateModels) {
      selectedModel = activeModel;
      const payload = {
        model: activeModel,
        messages,
        temperature,
        tools,
        tool_choice: "auto",
      };

      for (let i = 0; i < 2; i++) {
        try {
          logger.info(`Sending request to AI API using model: ${activeModel} (Attempt ${i + 1}/2)`);
          response = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(payload),
          });
          if (response.ok) {
            break;
          } else {
            const errText = await response.text();
            logger.warn(`Gemini API responded with error status ${response.status} using ${activeModel}: ${errText}`);
            if (response.status === 429) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          }
        } catch (err: any) {
          logger.warn(`Fetch to Gemini API failed for model ${activeModel}: ${err.message}`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (response && response.ok) break;
    }

    if (!response || !response.ok) {
      throw new Error(`Gemini API request failed after trying candidate models.`);
    }

    const result = await response.json();
    const assistantMessage = result.choices[0]?.message;

    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall: ToolCall = assistantMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      logger.info(`AI requested function execution: ${functionName}`);

      let toolResponse = "";
      if (functionName === "searchProducts") {
        const products = await getProductCatalog(tenantId, functionArgs.searchQuery);
        toolResponse = JSON.stringify(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            price: p.price,
            stock: p.stock,
            discount: p.discount,
            description: p.description,
            specifications: p.specifications,
          }))
        );
      } else if (functionName === "createLead") {
        const lead = await prisma.lead.create({
          data: {
            tenantId,
            customerId,
            stage: "INTERESTED",
            interestedProduct: functionArgs.interestedProduct,
            budget: functionArgs.budget || null,
            timeline: functionArgs.timeline || null,
            leadScore: 60,
            summary: `Lead captured via AI conversational agent. Product: ${functionArgs.interestedProduct}`,
            intent: "PURCHASE",
          },
        });
        toolResponse = JSON.stringify({ success: true, leadId: lead.id });
        logger.info(`Captured customer lead: ${lead.id}`);
      }

      // Feed function response back to LLM
      const followUpMessages = [
        ...messages,
        assistantMessage,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: toolResponse,
        },
      ];

      let secondRes: Response | null = null;
      for (const followUpModel of candidateModels) {
        const adaptedMsgs = secondResMessageAdapt(followUpMessages);
        for (let i = 0; i < 2; i++) {
          try {
            logger.info(`Sending follow-up request to AI API using model: ${followUpModel}`);
            secondRes = await fetch(apiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: followUpModel,
                messages: adaptedMsgs,
                temperature,
                tools,
                tool_choice: "none",
              }),
            });
            if (secondRes.ok) break;
            const secondErrText = await secondRes.text();
            logger.warn(`Gemini follow-up API error status ${secondRes.status} on ${followUpModel}: ${secondErrText}`);
            if (secondRes.status === 429) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
            }
          } catch (err: any) {
            logger.warn(`Fetch for Gemini follow-up failed on model ${followUpModel}: ${err.message}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        if (secondRes && secondRes.ok) break;
      }

      if (secondRes && secondRes.ok) {
        const secondResult = await secondRes.json();
        logger.info(`Gemini follow-up result payload: ${JSON.stringify(secondResult)}`);
        return secondResult.choices[0]?.message?.content || formatFallbackProductsReply(toolResponse, currentGstRate);
      }

      // Fallback: If follow-up hit rate limits but we have search products, format directly
      if (functionName === "searchProducts") {
        logger.info("Using deterministic fallback formatter for search products due to AI API rate limits");
        return formatFallbackProductsReply(toolResponse, currentGstRate);
      }
    }

    return assistantMessage?.content || "Hello! Welcome to Smart IT Solutions - No.1 In Laptops service | Computer Dealer | Printer Dealer | CCTV Installation | Gaming PC. How can I assist you today?";
  } catch (error: any) {
    logger.error(`AI Sales Executive error processing message: ${error.message}`);
    return aiSettings?.fallbackPrompt || "I am processing your request. A sales representative will join soon.";
  }
}

function secondResMessageAdapt(messages: any[]): any[] {
  return messages.map((msg) => {
    if (msg.role === "tool") {
      return {
        role: "tool",
        tool_call_id: msg.tool_call_id,
        content: msg.content,
      };
    }
    if (msg.role === "assistant" && msg.tool_calls) {
      return {
        role: "assistant",
        content: msg.content || "",
        extra_content: msg.extra_content || {
          google: {
            thought_signature: "skip_thought_signature_validator",
            thoughtSignature: "skip_thought_signature_validator"
          }
        },
        tool_calls: msg.tool_calls.map((tc: any) => {
          const signature = tc.extra_content?.google?.thought_signature || 
                            tc.thought_signature || 
                            msg.extra_content?.google?.thought_signature || 
                            "skip_thought_signature_validator";
          return {
            id: tc.id,
            type: "function",
            extra_content: tc.extra_content || {
              google: {
                thought_signature: signature,
                thoughtSignature: signature
              }
            },
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          };
        }),
      };
    }
    return msg;
  });
}

function formatFallbackProductsReply(productsJson: string, gstRate: number = 18): string {
  try {
    const products = JSON.parse(productsJson);
    if (!Array.isArray(products) || products.length === 0) {
      return "Unfortunately, we do not carry this item in our catalog at the moment. Please contact our sales team for assistance.";
    }

    let reply = "Here are the available options matching your request:\n\n";
    for (const p of products) {
      let specs: any = {};
      try {
        specs = typeof p.specifications === "string" ? JSON.parse(p.specifications) : (p.specifications || {});
      } catch (e) {}

      const pdcBase = Number(specs.PDC || p.price || 0);
      const cdcBase = Number(specs.CDC || 0);

      reply += `### ${p.name}\n`;
      if (pdcBase > 0) {
        const gstPdc = (pdcBase * gstRate) / 100;
        const nettPdc = pdcBase + gstPdc;
        reply += `- **PDC (Base Price)**: ₹${pdcBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
        reply += `- **GST (${gstRate}%)**: ₹${gstPdc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
        reply += `- **NETT Price**: ₹${nettPdc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n`;
      }
      if (cdcBase > 0) {
        const gstCdc = (cdcBase * gstRate) / 100;
        const nettCdc = cdcBase + gstCdc;
        reply += `- **CDC (Base Price)**: ₹${cdcBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
        reply += `- **GST (${gstRate}%)**: ₹${gstCdc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n`;
        reply += `- **NETT Price**: ₹${nettCdc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n`;
      }
    }
    return reply.trim();
  } catch (e) {
    return "Here are the product details you requested. Please contact our sales agent at +919385811823 for full pricing details.";
  }
}
