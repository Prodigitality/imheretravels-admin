import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Receipt from "./Receipt";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const base = {
  bookingId: "SB-ARW-20270101-SZ004",
  tourName: "Argentina's Wonders",
  reservationFee: 300,
  email: "a@example.com",
  travelDate: "2027-01-01",
  paymentDate: "Nov 5, 2026",
};

describe("Receipt", () => {
  it("keeps the regular cost and lists the sale discount and discounted cost", () => {
    const t = text(
      renderToStaticMarkup(
        <Receipt {...base} totalAmount={2499} discountedAmount={1999} remainingBalance={1699} />,
      ),
    );
    expect(t).toContain("Total Tour Cost £2499.00");
    expect(t).toContain("Sale discount -£500.00");
    expect(t).toContain("Discounted Tour Cost £1999.00");
    expect(t).toContain("Remaining Balance £1699.00");
  });

  it("shows no discount lines for a regular booking", () => {
    const t = text(renderToStaticMarkup(<Receipt {...base} totalAmount={1299} remainingBalance={1099} />));
    expect(t).toContain("Total Tour Cost £1299.00");
    expect(t).not.toContain("Sale discount");
    expect(t).not.toContain("Discounted Tour Cost");
  });
});
