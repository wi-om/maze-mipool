import {
  normalizePasswordHash,
  passwordsMatch,
  sanitizeMipsUserForApi,
} from "../../modules/auth/service/passwordHash.util";

describe("passwordHash.util", () => {
  const validHash = "a".repeat(64);

  it("normalizePasswordHash accepts 64-char hex", () => {
    expect(normalizePasswordHash(validHash)).toBe(validHash);
    expect(normalizePasswordHash(validHash.toUpperCase())).toBe(validHash);
  });

  it("normalizePasswordHash rejects invalid values", () => {
    expect(normalizePasswordHash("short")).toBeNull();
    expect(normalizePasswordHash(null)).toBeNull();
  });

  it("passwordsMatch compares hashes safely", () => {
    expect(passwordsMatch(validHash, validHash)).toBe(true);
    expect(passwordsMatch(validHash, "b".repeat(64))).toBe(false);
  });

  it("sanitizeMipsUserForApi strips Password", () => {
    const safe = sanitizeMipsUserForApi({
      id: 1,
      email: "a@test.com",
      Password: validHash,
    });
    expect(safe).toEqual({ id: 1, email: "a@test.com" });
    expect("Password" in safe).toBe(false);
  });
});
