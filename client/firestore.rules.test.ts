/**
 * Firestore rules (firestore.rules). Run with `npm run test:rules`: it starts
 * the Firestore emulator (Java 21+) for a demo project, nothing real.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-iht-admin",
    firestore: { rules: readFileSync(resolve(__dirname, "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const staffUser = (role: string, isApproved: boolean) => ({
  email: `${role}@example.com`,
  role,
  isApproved,
  permissions: { canManageUsers: role === "admin" },
  profile: { firstName: "A", lastName: "B" },
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "admin1"), staffUser("admin", true));
    await setDoc(doc(db, "users", "agent1"), staffUser("agent", true));
    await setDoc(doc(db, "users", "pending1"), staffUser("admin", false));
    await setDoc(doc(db, "users", "odd1"), staffUser("customer", true));
    await setDoc(doc(db, "bookings", "b1"), { firstName: "Ana" });
    await setDoc(doc(db, "bookings", "b1", "notes", "n1"), { text: "x" });
    await setDoc(doc(db, "stripePayments", "p1"), { amount: 1 });
    await setDoc(doc(db, "tourPackages", "t1"), { name: "Tour" });
    await setDoc(doc(db, "paymentTerms", "pt1"), { name: "P1" });
    await setDoc(doc(db, "config", "c1"), { on: true });
    for (const c of ["saleEvents", "guestPassportData", "partnerApplications", "customerAccounts", "travellerDocuments"]) {
      await setDoc(doc(db, c, "x1"), { secret: true });
    }
  });
});

const as = (uid: string | null) =>
  uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

describe("signed-out visitors", () => {
  it("can read the public catalog only", async () => {
    const db = as(null);
    await assertSucceeds(getDoc(doc(db, "tourPackages", "t1")));
    await assertSucceeds(getDocs(collection(db, "tourPackages")));
    await assertSucceeds(getDocs(collection(db, "paymentTerms")));
    await assertFails(setDoc(doc(db, "tourPackages", "t1"), { name: "hacked" }));
    await assertFails(setDoc(doc(db, "paymentTerms", "pt9"), { name: "x" }));
  });

  it("can't read or write operational data or staff accounts", async () => {
    const db = as(null);
    await assertFails(getDoc(doc(db, "bookings", "b1")));
    await assertFails(getDocs(collection(db, "bookings")));
    await assertFails(addDoc(collection(db, "bookings"), { firstName: "x" }));
    await assertFails(getDoc(doc(db, "stripePayments", "p1")));
    await assertFails(getDocs(collection(db, "users")));
    await assertFails(getDoc(doc(db, "config", "c1")));
  });
});

describe("signed in but not approved staff", () => {
  it("an account with no users doc gets nothing beyond the catalog", async () => {
    const db = as("stranger");
    await assertFails(getDoc(doc(db, "bookings", "b1")));
    await assertFails(getDocs(collection(db, "users")));
    await assertSucceeds(getDoc(doc(db, "tourPackages", "t1")));
  });

  it("an unapproved account reads only its own users doc", async () => {
    const db = as("pending1");
    await assertSucceeds(getDoc(doc(db, "users", "pending1")));
    await assertFails(getDoc(doc(db, "users", "admin1")));
    await assertFails(getDoc(doc(db, "bookings", "b1")));
    await assertFails(updateDoc(doc(db, "bookings", "b1"), { firstName: "x" }));
  });

  it("an unapproved account can edit its profile but not approve itself", async () => {
    const db = as("pending1");
    await assertSucceeds(updateDoc(doc(db, "users", "pending1"), { "profile.firstName": "New", hasAgreedToTerms: true }));
    await assertFails(updateDoc(doc(db, "users", "pending1"), { isApproved: true }));
    await assertFails(updateDoc(doc(db, "users", "pending1"), { role: "agent" }));
    await assertFails(updateDoc(doc(db, "users", "pending1"), { "permissions.canManageEmails": true }));
    await assertFails(updateDoc(doc(db, "users", "pending1"), { permissions: { canManageUsers: true, canManageEmails: true } }));
  });

  it("an approved account with an unknown role is not staff", async () => {
    await assertFails(getDoc(doc(as("odd1"), "bookings", "b1")));
  });
});

describe("staff signup", () => {
  it("creates only its own doc, unapproved, as admin or agent", async () => {
    await assertSucceeds(setDoc(doc(as("new1"), "users", "new1"), { ...staffUser("agent", false) }));
    await assertSucceeds(setDoc(doc(as("new2"), "users", "new2"), { ...staffUser("admin", false) }));
    await assertFails(setDoc(doc(as("new3"), "users", "new3"), { ...staffUser("admin", true) }));
    await assertFails(setDoc(doc(as("new4"), "users", "new4"), { ...staffUser("owner", false) }));
    await assertFails(setDoc(doc(as("new5"), "users", "someone-else"), { ...staffUser("agent", false) }));
    await assertFails(setDoc(doc(as(null), "users", "anon"), { ...staffUser("agent", false) }));
  });
});

describe("approved agent", () => {
  it("reads and writes operational data, including subcollections", async () => {
    const db = as("agent1");
    await assertSucceeds(getDoc(doc(db, "bookings", "b1")));
    await assertSucceeds(getDocs(collection(db, "bookings")));
    await assertSucceeds(updateDoc(doc(db, "bookings", "b1"), { firstName: "Eva" }));
    await assertSucceeds(addDoc(collection(db, "bookings"), { firstName: "New" }));
    await assertSucceeds(getDoc(doc(db, "bookings", "b1", "notes", "n1")));
    await assertSucceeds(setDoc(doc(db, "config", "c1"), { on: false }));
    await assertSucceeds(getDocs(collection(db, "stripePayments")));
    await assertSucceeds(updateDoc(doc(db, "tourPackages", "t1"), { name: "Tour 2" }));
    await assertSucceeds(deleteDoc(doc(db, "bookings", "b1")));
  });

  it("lists staff accounts but can't approve or re-role anyone", async () => {
    const db = as("agent1");
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertFails(updateDoc(doc(db, "users", "pending1"), { isApproved: true }));
    await assertFails(updateDoc(doc(db, "users", "agent1"), { role: "admin" }));
    await assertFails(deleteDoc(doc(db, "users", "pending1")));
  });

  it("can't touch server-only or customer collections", async () => {
    const db = as("agent1");
    for (const c of ["saleEvents", "guestPassportData", "partnerApplications", "customerAccounts", "travellerDocuments"]) {
      await assertFails(getDoc(doc(db, c, "x1")));
      await assertFails(setDoc(doc(db, c, "x2"), { a: 1 }));
    }
  });
});

describe("approved admin", () => {
  it("approves, re-roles and removes staff accounts", async () => {
    const db = as("admin1");
    await assertSucceeds(updateDoc(doc(db, "users", "pending1"), { isApproved: true }));
    await assertSucceeds(updateDoc(doc(db, "users", "agent1"), { role: "admin", "permissions.canManageUsers": true }));
    await assertSucceeds(deleteDoc(doc(db, "users", "odd1")));
  });

  it("still can't read server-only collections from the browser", async () => {
    await assertFails(getDoc(doc(as("admin1"), "guestPassportData", "x1")));
    await assertFails(getDoc(doc(as("admin1"), "saleEvents", "x1")));
  });
});
