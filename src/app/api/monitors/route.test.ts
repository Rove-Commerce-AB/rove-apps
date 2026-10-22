import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/appUsers", () => ({ getCurrentAppUser: vi.fn() }));
vi.mock("@/lib/monitors", () => ({ createMonitor: vi.fn() }));

import { getCurrentAppUser } from "@/lib/appUsers";
import { createMonitor } from "@/lib/monitors";
import { POST } from "./route";

const currentUser = vi.mocked(getCurrentAppUser);
const create = vi.mocked(createMonitor);

describe("create monitor API", () => {
  beforeEach(() => {
    currentUser.mockReset();
    create.mockReset();
  });

  it("rejects non-admins before reading or saving the request", async () => {
    currentUser.mockResolvedValue({ role: "customer" } as never);
    const response = await POST(new Request("http://localhost/api/monitors", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("saves JSON through a stable route for admins", async () => {
    currentUser.mockResolvedValue({ role: "admin" } as never);
    const input = { name: "Example", url: "https://example.com" };
    const response = await POST(new Request("http://localhost/api/monitors", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    }));
    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith(input);
  });

  it("rejects non-JSON requests", async () => {
    currentUser.mockResolvedValue({ role: "admin" } as never);
    const response = await POST(new Request("http://localhost/api/monitors", {
      method: "POST", headers: { "Content-Type": "text/plain" }, body: "{}",
    }));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
