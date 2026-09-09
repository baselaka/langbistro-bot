import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() =>
  vi.fn(() => ({ from: vi.fn() }))
);

const envMock = vi.hoisted(() => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("../../config/env", () => ({
  env: envMock,
}));

describe("supabase client", () => {
  beforeEach(() => {
    createClientMock.mockClear();
    vi.resetModules();
  });

  it("constructs the client from SUPABASE_SERVICE_ROLE_KEY with session auth disabled", async () => {
    await import("../client");

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-service-role-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
  });
});
