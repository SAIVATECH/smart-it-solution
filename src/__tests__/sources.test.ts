import { describe, it, expect } from "vitest";

interface RowPayload {
  id?: string;
  name?: string;
  price?: string;
  stock?: string;
}

// Validation logic matching the import route
function validateProductRow(row: RowPayload): { valid: boolean; error?: string } {
  const idVal = String(row.id || "").trim();
  const nameVal = String(row.name || "").trim();
  const priceVal = parseFloat(String(row.price || "0").replace(/[$,]/g, ""));
  const stockVal = parseInt(String(row.stock || "0").replace(/,/g, ""), 10);

  if (!idVal) {
    return { valid: false, error: "Missing required product ID" };
  }
  if (!nameVal) {
    return { valid: false, error: "Missing required product Name" };
  }
  if (isNaN(priceVal) || priceVal < 0) {
    return { valid: false, error: "Invalid product Price" };
  }
  if (isNaN(stockVal) || stockVal < 0) {
    return { valid: false, error: "Invalid product Stock" };
  }

  return { valid: true };
}

describe("Data Source Product Row Validation Rules", () => {
  it("should fail validation if product ID is missing", () => {
    const row = { name: "Water Purifier", price: "299.99", stock: "10" };
    const res = validateProductRow(row);
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Missing required product ID");
  });

  it("should fail validation if product Name is missing", () => {
    const row = { id: "hw-cpu-01", price: "299.99", stock: "10" };
    const res = validateProductRow(row);
    expect(res.valid).toBe(false);
    expect(res.error).toBe("Missing required product Name");
  });

  it("should pass validation with valid pricing and stock strings", () => {
    const row = { id: "hw-cpu-01", name: "Ryzen CPU", price: "$299.99", stock: "1,500" };
    const res = validateProductRow(row);
    expect(res.valid).toBe(true);
  });
});
