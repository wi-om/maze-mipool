import axios from "axios";
import { AppDataSource } from "@common";
import { Contract } from "@common";
import { Account } from "@common";
import { SystemSetting } from "@common";
import { CLReward } from "@common";
import { CLContract } from "@common";
import { Reward } from "@common";
import { CMWallet } from "@common";

import { UnitReward } from "@common";
import { DateTime } from "luxon";
import { In } from "typeorm";
import { resolveOcFactor, resolveSlaFactor } from "@common/utils/rewardFactors";
import {
  acquireRewardCalculationLock,
  releaseRewardCalculationLock,
} from "./rewardCalculationLock";
import {
  getWorkDateDeleteBounds,
  workDateDeleteWhere,
  workDateStrToDbTimestamp,
} from "./rewardWorkDate";
import { creditWalletBalance } from "../../crm/services/wallet/walletBalance.service";
import {
  deleteRewardTxnsForWorkDate,
  recordCreditTxnsForWorkDate,
} from "../../crm/services/wallet/walletTxn.service";

const MIPS_REWARD_URL = process.env.MIPS_REWARD_URL;

let mipsCache: any = null;
let mipsCacheTime: number = 0;

/**
 * Global helper to convert hashrate to TH/s
 */
function convertToTHS(hashrate: number, unit?: string): number {
    if (!hashrate || !unit) return 0;
    switch (unit.trim().toUpperCase()) {
        case "TH": return hashrate;
        case "PH": return hashrate * 1000;
        case "GH": return hashrate / 1000;
        case "MH": return hashrate / 1_000_000;
        default: return hashrate;
    }
}

/**
 * MASTER REWARD DISTRIBUTION ENGINE (Unified Centralized Function)
 * 
 * Orchestrates the full sequence of daily reward processing:
 * 1. MIPS Data Sync (Unit Reward calculation for the next day's record)
 * 2. EU Reward Distribution (End-user contracts)
 * 3. CL Reward Distribution (Parent agency contracts with randomization & SLA)
 * 4. CM Wallet Settlement (Master ledger reconciliation)
 * 
 * Target tables: UnitRewards, Reward, CLReward, CM_wallet
 */
/**
 * Locked entry — manual calculate, bulk, and standalone calls.
 * Catch-up/cron call runMasterRewardDistribution directly while holding the outer lock.
 */
export async function executeMasterRewardDistribution(
    targetDate?: Date,
    providedMipsData?: any,
    manualData?: { income: number; hashrate: number }
) {
    acquireRewardCalculationLock();
    try {
        return await runMasterRewardDistribution(targetDate, providedMipsData, manualData);
    } finally {
        releaseRewardCalculationLock();
    }
}

/**
 * Core engine (no lock). Same MIPS math, contract eligibility, and distribution steps.
 */
export async function runMasterRewardDistribution(
    targetDate?: Date,
    providedMipsData?: any,
    manualData?: { income: number; hashrate: number }
) {
    if (!MIPS_REWARD_URL && !providedMipsData && !manualData) {
        throw new Error("MIPS_REWARD_URL is not set in environment variables!");
    }

    const dubaiZone = process.env.TIMEZONE || "Asia/Dubai";

    // -------------------------------------------------------------
    // 1. DATE PREPARATION
    // Work Date (Today): The date identifying the rewards in our DB.
    // MIPS Date (Today+1): The date identifying the record in MIPS API.
    // -------------------------------------------------------------
    const target = targetDate
        ? DateTime.fromJSDate(targetDate).setZone(dubaiZone).startOf("day")
        : DateTime.now().setZone(dubaiZone).startOf("day");

    const workDateStr = target.toFormat('yyyy-MM-dd'); // Plain date string, no timezone ambiguity
    /** Stored in DB as YYYY-MM-DD 00:00:00 UTC — same on Azure and local. */
    const workDateJS = workDateStrToDbTimestamp(workDateStr);
    /** Inclusive Dubai calendar day bounds for contract eligibility (vs DATE() in DB TZ). */
    const workDayStart = target.startOf("day").toJSDate();
    const workDayEnd = target.endOf("day").toJSDate();
    const deleteBounds = getWorkDateDeleteBounds(workDateStr, dubaiZone);
    const mipsDateStr = target.plus({ days: 1 }).toFormat('yyyy-MM-dd');

    console.log(`🚀 [Master Distribution] Processing for Work Date: ${target.toFormat('yyyy-MM-dd')} | Expected MIPS Date: ${mipsDateStr}`);

    let income: number = 0;
    let totalHashrateInTH: number = 0;

    // -------------------------------------------------------------
    // 2. DATA ACQUISITION (External API or Manual)
    // -------------------------------------------------------------
    if (manualData) {
        income = manualData.income;
        totalHashrateInTH = manualData.hashrate;
        console.log(`📝 Using manual override stats: Income=${income}, Hashrate=${totalHashrateInTH}`);
    } else {
        let data = providedMipsData;
        if (!data) {
            if (mipsCache && Date.now() - mipsCacheTime < 60000) {
                data = mipsCache;
            } else {
                let finalUrl = MIPS_REWARD_URL || "";
                if (finalUrl.includes('limit=')) {
                    finalUrl = finalUrl.replace(/limit=\d+/, 'limit=3000');
                } else {
                    finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'limit=3000';
                }
                const response = await axios.get(finalUrl);
                data = response.data;
                mipsCache = data;
                mipsCacheTime = Date.now();
            }
        }

        // Find the record where timestamp+4h matches mipsDateStr
        const record = data.income.find((item: any) => {
            if (!item.timestamp) return false;
            const localDate = new Date(item.timestamp * 1000);
            const offsetLocal = new Date(localDate.getTime() + (4 * 60 * 60 * 1000));
            return offsetLocal.toISOString().split('T')[0] === mipsDateStr;
        });

        if (!record) {
            throw new Error(`No external reward data found for date: ${mipsDateStr}`);
        }

        income = Number(record.income);
        totalHashrateInTH = Number(record.total_hashrate_str || record.total_hashrate) / 1e12;
    }

    // -------------------------------------------------------------
    // 3. UNIT REWARDS CALCULATION & SYNC
    // Formula: (Income / Hashrate) * Sampling (Rounded to 8 decimals)
    // -------------------------------------------------------------
    const unitRewardRepo = AppDataSource.getRepository(UnitReward);
    const systemSettingRepo = AppDataSource.getRepository(SystemSetting);

    // Fetch Sampling Hashrate from settings
    const sampleSet = await systemSettingRepo.findOne({ where: { Key: "sampling_hashrate" } });
    const samplingHashrate = sampleSet ? parseFloat(sampleSet.Value) : 250;

    const rawYield = (income / totalHashrateInTH);
    const unitRewardFactor8 = Number((rawYield * samplingHashrate).toFixed(8));
    const btcPerTH = unitRewardFactor8 / samplingHashrate; // Use the rounded baseline for final distribution

    // Upsert into UnitRewards — delete new + legacy timestamp rows for this work day
    await unitRewardRepo.createQueryBuilder()
        .delete()
        .where(workDateDeleteWhere("CreatedOn"), deleteBounds)
        .execute();

    await unitRewardRepo.save(unitRewardRepo.create({
        RewardPerTH: unitRewardFactor8,
        CreatedOn: workDateJS,
        Source: process.env.REWARD_SOURCE || "mipool"
    }));

    console.log(`✅ [Step 1] UnitRewards synced: ${unitRewardFactor8.toFixed(8)} BTC (Yield: ${btcPerTH.toFixed(12)})`);

    // -------------------------------------------------------------
    // 4. CLEANUP PREVIOUS RUN (Safe for re-runs)
    // -------------------------------------------------------------
    await deleteRewardTxnsForWorkDate(workDateStr);

    await AppDataSource.getRepository(Reward).createQueryBuilder().delete()
        .where(workDateDeleteWhere("CreatedOn"), deleteBounds).execute();

    await AppDataSource.getRepository(CLReward).createQueryBuilder().delete()
        .where(workDateDeleteWhere("RewardOn"), deleteBounds).execute();

    await AppDataSource.getRepository(CMWallet).createQueryBuilder()
        .delete()
        .where(workDateDeleteWhere("rewardDate"), deleteBounds)
        .execute();



    // -------------------------------------------------------------
    // 5. EU REWARD DISTRIBUTION
    // -------------------------------------------------------------
    const contractRepo = AppDataSource.getRepository(Contract);
    const activeEUContracts = await contractRepo.createQueryBuilder("c")
        .where("c.Status = :status", { status: 2 })
        .andWhere(`c."StartDate" IS NOT NULL`)
        .andWhere(`c."StartDate" <= :workDayEnd`, { workDayEnd })
        .andWhere(`(c."EndDate" IS NULL OR c."EndDate" >= :workDayStart)`, { workDayStart })
        .getMany();

    console.log(`📋 [EU Contracts] ${activeEUContracts.length} active contracts for ${workDateStr} (StartDate ≤ day end, EndDate ≥ day start)`);

    // We need to group EU results by parent CL accounts for CM Wallet reconciliation later
    const accountRepo = AppDataSource.getRepository(Account);
    const uniqueAcNos = [...new Set(activeEUContracts.map(c => c.AcNo))];
    const accountList = await accountRepo.findBy({ AcNo: In(uniqueAcNos) });
    const acToClMap: Record<string, string> = {};
    accountList.forEach(acc => { if (acc.ClientAcNo) acToClMap[acc.AcNo] = acc.ClientAcNo; });

    const euRewardsByCLAccount: Record<string, number> = {};
    const euHashratesByCLAccount: Record<string, number> = {};
    const euInsertions = [];

    for (const contract of activeEUContracts) {
        const contractTH = convertToTHS(Number(contract.Hashrate), contract.HashrateUnit);
        const rewardAmount = Number((btcPerTH * contractTH).toFixed(8));

        const clAcNo = acToClMap[contract.AcNo];
        if (clAcNo) {
            euRewardsByCLAccount[clAcNo] = (euRewardsByCLAccount[clAcNo] || 0) + rewardAmount;
            euHashratesByCLAccount[clAcNo] = (euHashratesByCLAccount[clAcNo] || 0) + contractTH;
        }

        euInsertions.push({
            AcNo: contract.AcNo,
            mipContractNo: contract.MipContractNo,
            Amount: rewardAmount,
            Hashrate: String(contract.Hashrate),
            Type: process.env.REWARD_TYPE || "FPPS",
            CreatedOn: workDateJS
        });
    }

    // Bulk insert EU rewards
    if (euInsertions.length > 0) {
        const rewardRepo = AppDataSource.getRepository(Reward);
        const chunkSize = 500;
        for (let i = 0; i < euInsertions.length; i += chunkSize) {
            await rewardRepo.insert(euInsertions.slice(i, i + chunkSize));
        }

        const creditsByAcNo = new Map<string, number>();
        for (const row of euInsertions) {
            creditsByAcNo.set(row.AcNo, Number(creditsByAcNo.get(row.AcNo) || 0) + Number(row.Amount || 0));
        }
        for (const [acNo, amount] of creditsByAcNo.entries()) {
            await creditWalletBalance(acNo, amount);
        }

        await recordCreditTxnsForWorkDate(workDateStr);
    }
    console.log(`✅ [Step 2] EU distribution complete: ${euInsertions.length} contracts.`);

    // -------------------------------------------------------------
    // 6. CL REWARD DISTRIBUTION (With Randomization & SLA)
    // -------------------------------------------------------------
    const clContractRepo = AppDataSource.getRepository(CLContract);
    const activeCLContracts = await clContractRepo.createQueryBuilder("c")
        .where("c.Status = :status", { status: 1 }) // 1 = active
        .andWhere(`c."ContractStartDate" IS NOT NULL`)
        .andWhere(`c."ContractStartDate" <= :workDayEnd`, { workDayEnd })
        .andWhere(`(c."ContractEndDate" IS NULL OR c."ContractEndDate" >= :workDayStart)`, { workDayStart })
        .getMany();

    const clIds = activeCLContracts.map((c) => c.Id).sort((a, b) => a - b);
    console.log(
        `📋 [CL Contracts] ${activeCLContracts.length} active for ${workDateStr} (ContractStartDate ≤ day end, ContractEndDate ≥ day start; not CreatedOn). Ids: [${clIds.join(", ")}]`,
    );

    const ocFloorSet = await systemSettingRepo.findOne({ where: { Key: "OC_floor" } });
    const ocCeilSet = await systemSettingRepo.findOne({ where: { Key: "OC_ceiling" } });
    const slaFloorSet = await systemSettingRepo.findOne({ where: { Key: "SLA_floor" } });
    const slaCeilSet = await systemSettingRepo.findOne({ where: { Key: "SLA_ceiling" } });

    const ocFactor = resolveOcFactor(ocFloorSet, ocCeilSet, true);
    const sla = resolveSlaFactor(slaFloorSet, slaCeilSet, true);

    const clRewardRepo = AppDataSource.getRepository(CLReward);
    const clWalletsInfo: Record<string, { Hashrate: number; Amount: number }> = {};

    for (const contract of activeCLContracts) {
        if (!contract.AcNo || !contract.Hashrate) continue;

        const obtainedHashrate = Number(contract.Hashrate) * ocFactor * sla;
        const grossCLReward = obtainedHashrate * btcPerTH;

        // 0 is a valid hosting fee %; only null/undefined/NaN falls back to 10
        const rawFee = contract.hostingfee;
        const feePercent =
            rawFee == null || Number.isNaN(Number(rawFee)) ? 10 : Number(rawFee);
        const feeAmount = grossCLReward * (feePercent / 100);
        const feeHashrate = obtainedHashrate * (feePercent / 100);

        const netAmount = Math.max(0, grossCLReward - feeAmount);
        const netHashrate = Math.max(0, obtainedHashrate - feeHashrate);

        const clRewardEntry = clRewardRepo.create({
            AcNo: contract.AcNo,
            MipContractNo: contract.Id,
            Amount: Number(grossCLReward.toFixed(8)),
            Hashrate: Number(obtainedHashrate.toFixed(8)),
            hostingfee_amount: Number(feeAmount.toFixed(8)),
            hostingfee_hashrate: Number(feeHashrate.toFixed(8)),
            sla: Number(sla.toFixed(8)),
            oc: Number(ocFactor.toFixed(8)),
            net_amount: Number(netAmount.toFixed(8)),
            net_hashrate: Number(netHashrate.toFixed(8)),
            RewardOn: workDateJS,
            Type: process.env.REWARD_TYPE || "FPPS"
        });

        await clRewardRepo.save(clRewardEntry);

        if (!clWalletsInfo[contract.AcNo]) clWalletsInfo[contract.AcNo] = { Hashrate: 0, Amount: 0 };
        clWalletsInfo[contract.AcNo].Hashrate += netHashrate;
        clWalletsInfo[contract.AcNo].Amount += netAmount;
    }
    console.log(`✅ [Step 3] CL distribution complete (OC Factor: ${ocFactor.toFixed(4)}, SLA: ${sla.toFixed(4)}).`);

    // -------------------------------------------------------------
    // 7. CM WALLET SETTLEMENT (Master Ledger Reconciliation)
    // -------------------------------------------------------------
    const cmWalletRepo = AppDataSource.getRepository(CMWallet);

    // Ensure all accounts with EU sales are tracked even if they have no active CL hardware today
    for (const clAcNo of Object.keys(euRewardsByCLAccount)) {
        if (!clWalletsInfo[clAcNo]) clWalletsInfo[clAcNo] = { Hashrate: 0, Amount: 0 };
    }

    for (const acNo of Object.keys(clWalletsInfo)) {
        const info = clWalletsInfo[acNo];
        const euSaleAmount = euRewardsByCLAccount[acNo] || 0;
        const euSaleHashrate = euHashratesByCLAccount[acNo] || 0;

        const cmNetAmount = info.Amount - euSaleAmount;
        const cmNetHashrate = info.Hashrate - euSaleHashrate;

        // Fetch previous ledger balance
        // Carry forward: last ledger row strictly before this Dubai workday (same-day rows were deleted above)
        const prevWallet = await cmWalletRepo.createQueryBuilder("c")
            .where("c.AcNo = :acNo", { acNo })
            .andWhere("c.rewardDate < :workDayStart", { workDayStart })
            .orderBy("c.rewardDate", "DESC")
            .getOne();

        const prevBalance = prevWallet ? Number(prevWallet.Net_Balance) : 0;
        let finalBalance = prevBalance + cmNetAmount;
        if (finalBalance < 0) finalBalance = 0;

        await cmWalletRepo.save(cmWalletRepo.create({
            AcNo: acNo,
            rewardDate: workDateJS,
            Hashrate: Number(info.Hashrate.toFixed(8)),
            Amount: Number(info.Amount.toFixed(8)),
            Sales_amount: Number(euSaleAmount.toFixed(8)),
            Sales_hashrate: Number(euSaleHashrate.toFixed(8)),
            Net_amount: Number(cmNetAmount.toFixed(8)),
            Net_Hashrate: Number(cmNetHashrate.toFixed(8)),
            Net_Balance: Number(finalBalance.toFixed(8))
        }));
    }
    console.log(`✅ [Step 4] CM Wallet ledger reconciled.`);

    return {
        workDate: workDateJS,
        workDateStr,
        mipsDate: mipsDateStr,
        ocFactor: ocFactor,
        sla: sla,
        unitReward: unitRewardFactor8
    };
}
