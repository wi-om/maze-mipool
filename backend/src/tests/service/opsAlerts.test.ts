const sendEmail = jest.fn();

jest.mock("../../common/utils/email", () => ({
  sendEmail,
  adminEmail: "admin@example.com",
}));

import {
  resetOpsAlertCooldowns,
  sendOpsAlert,
} from "../../common/service/opsAlerts";

describe("opsAlerts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetOpsAlertCooldowns();
    process.env.OPS_ALERT_COOLDOWN_MS = "3600000";
  });

  it("sends redis_disabled alert once, then respects cooldown", async () => {
    await sendOpsAlert("redis_disabled", "ENOTFOUND", { key: "redis_disabled:host" });
    await sendOpsAlert("redis_disabled", "ENOTFOUND", { key: "redis_disabled:host" });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][1]).toContain("Redis disabled");
  });

  it("sends api_error with path in subject", async () => {
    await sendOpsAlert("api_error", "boom", {
      path: "GET /api/payouts",
      key: "api_error:GET /api/payouts",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][1]).toContain("GET /api/payouts");
  });
});
