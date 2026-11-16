import { describe, expect, it } from "vitest";
import { cleanWhatsAppDigits, phoneCountryOrder } from "./phoneCountries";

describe("phoneCountryOrder", () => {
  it("lists the UK and Ireland first, every country once", () => {
    const order = phoneCountryOrder();
    expect(order.slice(0, 2)).toEqual(["GB", "IE"]);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe("cleanWhatsAppDigits", () => {
  it("drops the leading 0 once the number is complete", () => {
    expect(cleanWhatsAppDigits("07911 123456", "GB")).toBe("7911123456");
    expect(cleanWhatsAppDigits("0917 123 4567", "PH")).toBe("9171234567");
    expect(cleanWhatsAppDigits("087 123 4567", "IE")).toBe("871234567");
  });

  it("keeps a partly typed number as typed, 0 included", () => {
    expect(cleanWhatsAppDigits("0791", "GB")).toBe("0791");
  });

  it("drops a typed country code", () => {
    expect(cleanWhatsAppDigits("+44 7911 123456", "GB")).toBe("7911123456");
    expect(cleanWhatsAppDigits("639171234567", "PH")).toBe("9171234567");
  });

  it("never cuts digits off, so a too-long number stays invalid", () => {
    expect(cleanWhatsAppDigits("917 123 45678", "PH")).toBe("91712345678");
    expect(cleanWhatsAppDigits("0917 123 45678", "PH")).toBe("091712345678");
  });

  it("caps runaway input at 15 digits", () => {
    expect(cleanWhatsAppDigits("1".repeat(30), "GB")).toHaveLength(15);
  });

  it("leaves a valid number without a prefix alone", () => {
    expect(cleanWhatsAppDigits("9171234567", "PH")).toBe("9171234567");
  });
});
