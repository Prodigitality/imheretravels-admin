import { describe, expect, it } from "vitest";
import { isTestEnquiry, looksLikeTest } from "./enquiry-test";

const base = { name: "Layla Allison", email: "layla.allison@hotmail.com", message: "Hi, is June available?", utm: null };

describe("looksLikeTest", () => {
  it("leaves real enquiries alone", () => {
    expect(looksLikeTest(base)).toBe(false);
    expect(looksLikeTest({ ...base, name: "Maria Testa" })).toBe(false);
    expect(looksLikeTest({ ...base, message: "Is the contest still on? I'd like an attestation letter." })).toBe(false);
    expect(looksLikeTest({ ...base, email: "someone@testdomain.com" })).toBe(false);
  });

  it("flags the word test in name, email, message or UTMs", () => {
    expect(looksLikeTest({ ...base, name: "test tester" })).toBe(true);
    expect(looksLikeTest({ ...base, message: "TEST" })).toBe(true);
    expect(looksLikeTest({ ...base, email: "test123@gmail.com" })).toBe(true);
    expect(looksLikeTest({ ...base, email: "juan+test@gmail.com" })).toBe(true);
    expect(looksLikeTest({ ...base, utm: { utm_source: "wxm-test" } })).toBe(true);
  });
});

describe("isTestEnquiry", () => {
  it("lets staff override the automatic check", () => {
    expect(isTestEnquiry({ ...base, message: "test", test: false })).toBe(false);
    expect(isTestEnquiry({ ...base, test: true })).toBe(true);
    expect(isTestEnquiry({ ...base, message: "test", test: null })).toBe(true);
  });
});
