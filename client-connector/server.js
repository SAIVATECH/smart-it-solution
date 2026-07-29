const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;
const API_KEY = process.env.API_KEY || "acme_secret_local_connector_key";
const PRODUCTS_FILE = path.join(__dirname, process.env.PRODUCTS_FILE || "Products.xlsx");
const ORDERS_FILE = path.join(__dirname, process.env.ORDERS_FILE || "Orders.xlsx");

// Apply basic security and CORS
app.use(helmet());
app.use(cors());
app.use(express.json());

// API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"] || req.query.apiKey;
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key credentials" });
  }
  next();
};

// Rate limiter: 200 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests, please try again later." }
});

app.use("/api/", apiLimiter);

/**
 * Reads data from an Excel file and returns it as a JSON array.
 */
function readExcelFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    throw new Error(`Failed to read file: it might be open or locked in another program.`);
  }
}

/**
 * Writes a JSON array into an Excel file.
 */
function writeExcelFile(filePath, data, sheetName = "Sheet1") {
  try {
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    xlsx.writeFile(workbook, filePath);
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error.message);
    throw new Error(`Failed to write file: check if it is currently locked or open in Excel.`);
  }
}

/**
 * Initializes Excel files with default schemas if they do not exist.
 */
function initExcelFiles() {
  // 1. Initialize Products.xlsx if missing
  if (!fs.existsSync(PRODUCTS_FILE)) {
    console.log("Products.xlsx not found. Initializing sample product catalog...");
    const sampleProducts = [
      {
        "Sl no": "prod_pur_01",
        "Name": "PureFlow Water Purifier",
        "Price": 299.99
      },
      {
        "Sl no": "prod_shred_02",
        "Name": "OfficeMax Paper Shredder",
        "Price": 89.99
      },
      {
        "Sl no": "prod_kboard_03",
        "Name": "Logitech G915 Mechanical Keyboard",
        "Price": 229.99
      }
    ];
    writeExcelFile(PRODUCTS_FILE, sampleProducts, "Products");
  }

  // 2. Initialize Orders.xlsx if missing
  if (!fs.existsSync(ORDERS_FILE)) {
    console.log("Orders.xlsx not found. Creating order tracking schema...");
    const defaultOrders = [];
    // We create it by writing a worksheet with empty headers
    const worksheet = xlsx.utils.json_to_sheet(defaultOrders, {
      header: [
        "orderNumber",
        "customerName",
        "customerPhone",
        "productId",
        "quantity",
        "amount",
        "orderDate",
        "paymentStatus",
        "orderStatus"
      ]
    });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Orders");
    xlsx.writeFile(workbook, ORDERS_FILE);
  }
}

// Perform file setup
initExcelFiles();

// ==========================================
// API Endpoints
// ==========================================

// 1. GET /api/v1/health
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    shop: "Acme Hardware Client System",
    files: {
      products: fs.existsSync(PRODUCTS_FILE),
      orders: fs.existsSync(ORDERS_FILE)
    }
  });
});

// 2. GET /api/v1/products (Authenticated)
app.get("/api/v1/products", authenticateApiKey, (req, res) => {
  try {
    const productsList = readExcelFile(PRODUCTS_FILE);
    // Parse strings back to proper numbers/timestamps just in case
    const sanitized = productsList.map(p => ({
      id: String(p.id),
      sku: String(p.sku || ""),
      name: String(p.name || ""),
      categoryName: String(p.category || ""),
      price: Number(p.price || 0),
      stock: Number(p.stock || 0),
      updatedAt: String(p.updatedAt || new Date().toISOString()),
      version: Number(p.version || 1)
    }));
    res.status(200).json(sanitized);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. POST /api/v1/orders (Authenticated)
app.post("/api/v1/orders", authenticateApiKey, (req, res) => {
  const { customerName, customerPhone, productId, quantity, amount } = req.body;

  // Basic validation
  if (!customerName || !customerPhone || !productId || !quantity || !amount) {
    return res.status(400).json({ error: "Missing required order fields." });
  }

  try {
    // Read current products
    const productsList = readExcelFile(PRODUCTS_FILE);
    const productIdx = productsList.findIndex(p => String(p.id) === String(productId));

    if (productIdx === -1) {
      return res.status(404).json({ error: `Product with ID ${productId} does not exist in local inventory.` });
    }

    const targetProduct = productsList[productIdx];

    // Skip stock check and decrement (stock management disabled)
    targetProduct.version = Number(targetProduct.version || 1) + 1;
    targetProduct.updatedAt = new Date().toISOString();

    // Write updated product back to Products.xlsx
    writeExcelFile(PRODUCTS_FILE, productsList, "Products");

    // Generate local invoice order number
    const localOrderNo = `LOC-ORD-${Math.floor(100000 + Math.random() * 900000)}`;

    // Read current orders
    const ordersList = readExcelFile(ORDERS_FILE);

    // Append new order
    const newOrder = {
      orderNumber: localOrderNo,
      customerName: String(customerName),
      customerPhone: String(customerPhone),
      productId: String(productId),
      quantity: Number(quantity),
      amount: Number(amount),
      orderDate: new Date().toISOString(),
      paymentStatus: "PENDING",
      orderStatus: "PENDING"
    };

    ordersList.push(newOrder);

    // Write orders list back to Orders.xlsx
    writeExcelFile(ORDERS_FILE, ordersList, "Orders");

    res.status(201).json({
      success: true,
      localOrderId: localOrderNo,
      message: "Order logged and local stock updated successfully."
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`   WINDOWS EXCEL LOCAL CLIENT CONNECTOR STARTED        `);
  console.log(`   API Listening: http://localhost:${PORT}             `);
  console.log(`=======================================================`);
  console.log(`- Health Check: GET http://localhost:${PORT}/api/v1/health`);
  console.log(`- Sync Products: GET http://localhost:${PORT}/api/v1/products`);
  console.log(`- Place Order: POST http://localhost:${PORT}/api/v1/orders`);
  console.log(`=======================================================`);
});
