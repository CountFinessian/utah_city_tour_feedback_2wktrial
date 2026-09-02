import { describe, it, expect } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/server/auth/session";
import { verifyUserCredentials, findUserByEmail } from "../src/server/auth/users";

describe("auth system", () => {
  it("authenticates Aiden (Host) with valid password", () => {
    const user = verifyUserCredentials("aiden@utahcity.com", "host2026!");
    expect(user).not.toBeNull();
    expect(user?.role).toBe("host");
    expect(user?.name).toBe("Aiden");
  });

  it("authenticates Nate (Leader) with valid password", () => {
    const user = verifyUserCredentials("nate@utahcity.com", "leader2026!");
    expect(user).not.toBeNull();
    expect(user?.role).toBe("leader");
    expect(user?.name).toBe("Nate");
  });

  it("rejects invalid passwords", () => {
    const user = verifyUserCredentials("aiden@utahcity.com", "wrongpassword");
    expect(user).toBeNull();
  });

  it("signs and verifies a valid session token", async () => {
    const user = findUserByEmail("aiden@utahcity.com")!;
    const token = await signSessionToken(user);
    expect(typeof token).toBe("string");
    expect(token.includes(".")).toBe(true);

    const payload = await verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("aiden@utahcity.com");
    expect(payload?.role).toBe("host");
    expect(payload?.name).toBe("Aiden");
  });

  it("rejects tampered session tokens", async () => {
    const user = findUserByEmail("aiden@utahcity.com")!;
    const token = await signSessionToken(user);
    const tampered = token.slice(0, -4) + "abcd";
    const payload = await verifySessionToken(tampered);
    expect(payload).toBeNull();
  });
});
