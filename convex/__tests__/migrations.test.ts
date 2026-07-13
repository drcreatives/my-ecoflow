import { describe, expect, it } from "vitest";
import { assertMigrationAuthorized } from "../migrations";

describe("migration authorization", () => {
  it("rejects migration when the deployment has no configured secret", () => {
    expect(() => assertMigrationAuthorized(undefined, "provided")).toThrow(
      "Migration is not authorized"
    );
  });

  it("rejects migration when the provided secret does not match", () => {
    expect(() => assertMigrationAuthorized("configured", "wrong")).toThrow(
      "Migration is not authorized"
    );
  });

  it("allows migration when the one-time secret matches", () => {
    expect(() =>
      assertMigrationAuthorized("configured", "configured")
    ).not.toThrow();
  });
});
