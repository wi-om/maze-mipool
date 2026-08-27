import { bulkUpdatePayoutTxidFees, parseTxidFeeCsv } from "../../modules/engine/service/payoutTxidFee";
import { applyPayoutTxidFeeDeduction } from "../../modules/engine/service/payoutTxidFee/deduction.service";
import { roundBtcAmount } from "../../modules/engine/service/payoutTxidFee/shared";
import { PAYOUT_TXID_LENGTH } from "../../modules/engine/service/payoutTxid.util";

const validTxid = "a".repeat(PAYOUT_TXID_LENGTH);

describe("payoutTxidFee import", () => {
  describe("parseTxidFeeCsv", () => {
    it("parses txid,txidFee rows", () => {
      const { updates, invalidRows } = parseTxidFeeCsv(`${validTxid},0.0000057`);
      expect(invalidRows).toHaveLength(0);
      expect(updates).toEqual([{ txid: validTxid, txidFee: 0.0000057 }]);
    });
  });

  describe("bulkUpdatePayoutTxidFees", () => {
    const updateMock = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(require("@common").AppDataSource, "getRepository").mockReturnValue({
        update: updateMock,
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("updates txidFee and resets txidFeeDeducted", async () => {
      updateMock.mockResolvedValueOnce({ affected: 3 });
      const result = await bulkUpdatePayoutTxidFees([{ txid: validTxid, txidFee: 0.0000057 }]);
      expect(updateMock).toHaveBeenCalledWith(
        { txid: validTxid },
        { txidFee: 0.0000057, txidFeeDeducted: false },
      );
      expect(result.updatedRows).toBe(3);
    });
  });
});

describe("payoutTxidFee deduction", () => {
  it("computes per-row net amount: Amount − txidFee", () => {
    const gross = 0.00063432;
    const fee = 0.0000057;
    expect(roundBtcAmount(gross - fee)).toBe(0.00062862);
  });

  describe("applyPayoutTxidFeeDeduction dryRun", () => {
    const findMock = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
      jest.spyOn(require("@common").AppDataSource, "getRepository").mockReturnValue({
        find: findMock,
      });
      jest.spyOn(require("@common").AppDataSource, "transaction").mockImplementation(async (fn: any) => fn({}));
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("previews deduction lines without updating", async () => {
      findMock.mockResolvedValueOnce([
        {
          Id: 1,
          txid: validTxid,
          Amount: 0.00063432,
          txidFee: 0.0000057,
          txidFeeDeducted: false,
        },
      ]);

      const result = await applyPayoutTxidFeeDeduction({ dryRun: true, mode: "perRow" });
      expect(result.dryRun).toBe(true);
      expect(result.lines).toEqual([
        {
          payoutId: 1,
          txid: validTxid,
          grossAmount: 0.00063432,
          feeApplied: 0.0000057,
          netAmount: 0.00062862,
        },
      ]);
    });
  });
});
