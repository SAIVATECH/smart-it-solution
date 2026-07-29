# Windows Local Client Excel Connector

A lightweight, secure Node.js + Express application that runs on the client's local Windows PC to synchronize local Excel inventory files (`Products.xlsx` and `Orders.xlsx`) with the AI-Powered WhatsApp Sales Automation Platform.

---

## Prerequisites
* **Node.js**: Install Node.js (v18 or higher) from [nodejs.org](https://nodejs.org/).
* **Microsoft Excel**: Files can be opened/edited in Microsoft Excel, Google Sheets, or LibreOffice.

---

## Quick Start Setup

1. **Copy the Connector files** to the local computer.
2. **Install Dependencies**:
   Open Command Prompt (`cmd`) or PowerShell in this folder, and run:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   A default `.env` file is provided:
   ```env
   PORT=4000
   API_KEY=acme_secret_local_connector_key
   PRODUCTS_FILE=Products.xlsx
   ORDERS_FILE=Orders.xlsx
   ```
   *Modify `API_KEY` to secure your local endpoint. Ensure it matches the API Key configured in your SaaS Cloud Admin Dashboard.*

4. **Initialize Excel Sheets**:
   Start the server once to automatically generate default schemas:
   ```bash
   npm start
   ```
   This generates `Products.xlsx` (seeded with initial hardware products) and `Orders.xlsx` in the same directory.

---

## API Documentation

### 1. Health Probe Check
* **Endpoint**: `GET http://localhost:4000/api/v1/health`
* **Response**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-07-20T11:18:00Z",
    "shop": "Acme Hardware Client System",
    "files": { "products": true, "orders": true }
  }
  ```

### 2. Fetch Local Products Catalog (Authenticated)
* **Endpoint**: `GET http://localhost:4000/api/v1/products`
* **Headers**: `x-api-key: your_configured_api_key`
* **Response**: JSON array of products.

### 3. Log Cloud Order & Update Inventory (Authenticated)
* **Endpoint**: `POST http://localhost:4000/api/v1/orders`
* **Headers**: `x-api-key: your_configured_api_key`
* **Body (JSON)**:
  ```json
  {
    "customerName": "John Doe",
    "customerPhone": "1234567890",
    "productId": "prod_pur_01",
    "quantity": 1,
    "amount": 299.99
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "localOrderId": "LOC-ORD-746392",
    "message": "Order logged and local stock updated successfully."
  }
  ```

---

## File Schema Details

### Products.xlsx
* `id`: Unique identifier (e.g. `prod_pur_01`).
* `sku`: Part reference code.
* `name`: Product title.
* `category`: Broad category label.
* `price`: Decimal item price.
* `stock`: Quantity available locally.
* `updatedAt`: ISO Date.
* `version`: Incremental integer used to resolve sync updates.

### Orders.xlsx
* `orderNumber`: Automatically generated local invoice code (e.g., `LOC-ORD-746392`).
* `customerName`: Purchaser's name.
* `customerPhone`: Phone contact.
* `productId`: Synced product identifier.
* `quantity`: Units ordered.
* `amount`: Transaction value.
* `orderDate`: ISO Timestamp.
* `paymentStatus`: Initialized as `PENDING`.
* `orderStatus`: Initialized as `PENDING`.
