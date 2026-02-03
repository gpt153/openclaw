import { describe, it, expect } from "vitest";
import { generateOdinSessionId } from "./odin-bridge.js";

describe("generateOdinSessionId", () => {
  it("generates consistent ID for same user and platform", () => {
    const id1 = generateOdinSessionId("admin", "web");
    const id2 = generateOdinSessionId("admin", "web");
    expect(id1).toBe(id2);
    expect(id1).toBe("odin_web_admin");
  });

  it("generates different IDs for different users", () => {
    const id1 = generateOdinSessionId("admin", "web");
    const id2 = generateOdinSessionId("user2", "web");
    expect(id1).not.toBe(id2);
  });

  it("handles session hints without probe prefix", () => {
    const id = generateOdinSessionId("admin", "web", "web_admin_abc123");
    expect(id).toBe("odin_web_admin_web_admin");
  });

  it("ignores probe sessions", () => {
    const id = generateOdinSessionId("admin", "web", "probe-test-123");
    expect(id).toBe("odin_web_admin");
  });
});
