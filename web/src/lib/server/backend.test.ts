import { describe, expect, it } from "vitest";

import { requireSameOrigin } from "./backend";

describe("requireSameOrigin", () => {
  it("accepts the exact incoming host when Next normalizes the request URL", () => {
    const request = new Request("http://localhost:3002/api/auth/signin", {
      headers: {
        host: "127.0.0.1:3002",
        origin: "http://127.0.0.1:3002",
      },
    });

    expect(new URL(request.url).origin).toBe("http://localhost:3002");
    expect(requireSameOrigin(request)).toBeNull();
  });

  it("rejects a different origin", () => {
    const request = new Request("http://localhost:3002/api/auth/signin", {
      headers: {
        host: "127.0.0.1:3002",
        origin: "http://attacker.example",
      },
    });

    expect(requireSameOrigin(request)?.status).toBe(403);
  });

  it("rejects a missing origin", () => {
    const request = new Request("http://localhost:3002/api/auth/signin", {
      headers: { host: "127.0.0.1:3002" },
    });

    expect(requireSameOrigin(request)?.status).toBe(403);
  });
});
