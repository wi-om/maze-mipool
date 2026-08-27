const sendEmail = jest.fn();

jest.mock("../../common/utils/email", () => ({
  sendEmail,
  adminEmail: "admin@test.com",
}));

import { alertService } from "../../common/service/alertService";

describe("common alertService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    alertService.resetStreak();
  });

  it("does nothing when rewardsData has no income[0]", async () => {
    await alertService.checkHashrateAlerts({});
    expect(sendEmail).not.toHaveBeenCalled();
    expect(alertService.getCurrentStreak()).toBe(0);
  });

  it("resets streak when hashrate restored", async () => {
    // 1st zero increments streak to 1
    await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] });
    expect(alertService.getCurrentStreak()).toBe(1);
    // positive hashrate resets
    await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 1, gmt_time: "t", income: 0 }] });
    expect(alertService.getCurrentStreak()).toBe(0);
    expect(sendEmail).toHaveBeenCalledTimes(1); // first run sends LOW
  });

  it("sends LOW priority email on first zero day", async () => {
    await alertService.checkHashrateAlerts({
      income: [{ total_hashrate: 0, gmt_time: "t", income: 0.1, type: "x", code: "y" }],
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [_to, subject, body] = sendEmail.mock.calls[0];
    expect(subject).toContain("NOTICE");
    expect(body).toContain("Days with Zero Hashrate: 1");
  });

  it("does not send twice on same day (cooldown by lastAlertDate)", async () => {
    await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] });
    await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends MODERATE priority on 2+ streak", async () => {
    // simulate new day by clearing lastAlertDate through resetStreak? can't: it resets streak too.
    // Instead force calls on different days by mocking Date.prototype.toDateString.
    const orig = Date.prototype.toDateString;
    let day = 1;
    // eslint-disable-next-line no-extend-native
    Date.prototype.toDateString = function () {
      return `day-${day}`;
    } as any;

    await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] });
    day++;
    await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] });

    const subject = sendEmail.mock.calls[1][1];
    expect(subject).toContain("ALERT");
    expect(alertService.getCurrentStreak()).toBe(2);

    // restore
    // eslint-disable-next-line no-extend-native
    Date.prototype.toDateString = orig;
  });

  it("sends HIGH priority on 7+ streak", async () => {
    const orig = Date.prototype.toDateString;
    // eslint-disable-next-line no-extend-native
    Date.prototype.toDateString = function () {
      // force unique day each call
      return `day-${(alertService.getCurrentStreak() + 1).toString()}`;
    } as any;

    for (let i = 0; i < 7; i++) {
      await alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] });
    }
    const lastSubject = sendEmail.mock.calls[6][1];
    expect(lastSubject).toContain("CRITICAL");
    expect(alertService.getCurrentStreak()).toBe(7);

    // eslint-disable-next-line no-extend-native
    Date.prototype.toDateString = orig;
  });

  it("does not throw if sendEmail fails", async () => {
    sendEmail.mockRejectedValueOnce(new Error("smtp"));
    await expect(
      alertService.checkHashrateAlerts({ income: [{ total_hashrate: 0, gmt_time: "t", income: 0 }] })
    ).resolves.toBeUndefined();
  });
});

