import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveNewLicenseExpiryDate,
  resolveSingleLicenseProductMatch,
  shouldProcessPaidTransition,
} from "../src/lib/license-provisioning-rules.mjs";

test("uses exactly one explicit product mapping", () => {
  const product = { name: "Robotta" };
  assert.equal(
    resolveSingleLicenseProductMatch({ mappedProducts: [product], namedProducts: [] }),
    product
  );
});

test("rejects ambiguous product mappings instead of granting multiple products", () => {
  assert.throws(
    () => resolveSingleLicenseProductMatch({
      mappedProducts: [{ name: "Robotta" }, { name: "fbmprobotta" }],
      namedProducts: [],
    }),
    /lebih dari satu/
  );
});

test("allows one exact name fallback and rejects duplicate names", () => {
  const product = { name: "Robotta" };
  assert.equal(
    resolveSingleLicenseProductMatch({ mappedProducts: [], namedProducts: [product] }),
    product
  );
  assert.throws(
    () => resolveSingleLicenseProductMatch({
      mappedProducts: [],
      namedProducts: [product, { name: "robotta" }],
    }),
    /lebih dari satu/
  );
});

test("new license uses the product default expiry", () => {
  assert.equal(
    resolveNewLicenseExpiryDate({
      requestedExpiryDate: null,
      defaultExpiryDays: 90,
      today: new Date(2026, 8, 8),
    }),
    "2026-12-07"
  );
});

test("paid callback is processed only on the first transition", () => {
  assert.equal(shouldProcessPaidTransition("pending", "paid"), true);
  assert.equal(shouldProcessPaidTransition("paid", "paid"), false);
});
