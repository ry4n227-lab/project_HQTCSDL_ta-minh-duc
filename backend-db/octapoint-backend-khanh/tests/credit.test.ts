import { afterAll, describe, it, expect } from "vitest";
import { billPoints, closeCreditPool } from "../src/credit/service";
import { normalize } from "../src/credit/sui";
import { mintSchema, transferSchema } from "../src/routes/credits";

afterAll(() => closeCreditPool());
describe("basic credit rules", () => {
  it("rounds invoice points down", () => expect(billPoints(259999)).toBe(25));
  it("rejects zero-earning and invalid invoices", () => {
    for (const amount of [0, -1, 9999, 10000.5, NaN, Infinity, 1000000000001]) expect(() => billPoints(amount)).toThrow();
  });
  it("rejects invalid rate and point overflow", () => {
    const before = process.env.EARN_VND_PER_POINT;
    try {
      process.env.EARN_VND_PER_POINT = "0"; expect(() => billPoints(10000)).toThrow();
      process.env.EARN_VND_PER_POINT = "1"; expect(() => billPoints(2147483648)).toThrow();
    } finally { if (before === undefined) delete process.env.EARN_VND_PER_POINT; else process.env.EARN_VND_PER_POINT = before; }
  });
  it("normalizes addresses and rejects nonhex IDs", () => {
    expect(normalize("0xA")).toBe("0x" + "a".padStart(64, "0"));
    expect(() => normalize("0xZZ")).toThrow();
  });
  it("requires UUID and nonempty invoice reference", () => {
    expect(mintSchema.safeParse({ customerId: "1", reference: " ", amountVnd: 250000 }).success).toBe(false);
  });
  it("rejects forged merchantId and negative amounts", () => {
    const input = { customerId: "11111111-1111-4111-8111-111111111111", reference: "HD1", amountVnd: 250000 };
    expect(mintSchema.safeParse({ ...input, merchantId: "forged" }).success).toBe(false);
    expect(mintSchema.safeParse({ ...input, amountVnd: -10 }).success).toBe(false);
  });
  it("normalizes transfer object IDs and trims references", () => {
    const input = transferSchema.parse({ sourceCustomerId: "11111111-1111-4111-8111-111111111111", recipientCustomerId: "22222222-2222-4222-8222-222222222222", reference: " TR1 ", objectId: "0x1" });
    expect(input.reference).toBe("TR1"); expect(input.objectId).toBe(normalize("0x1"));
  });
});
