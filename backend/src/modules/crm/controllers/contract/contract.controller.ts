import { Request, Response } from "express";
import { AppDataSource } from "@common";
import { Contract } from "@common";
import { Account } from "@common";
import { syncContractsIdSequence } from "../../services/contract/contractSequence.service";

function generateUniqueContractCode(length: number = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function getUniqueMipContractNo() {
  const contractRepo = AppDataSource.getRepository(Contract);
  let MipContractNo: string;
  let exists: Contract | null;

  do {
    MipContractNo = generateUniqueContractCode();
    exists = await contractRepo.findOneBy({ MipContractNo });
  } while (exists);

  return MipContractNo;
}

function normalizeMccTransactionId(value: unknown): string | undefined {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function findContractByMccTransactionId(
  contractRepo: ReturnType<typeof AppDataSource.getRepository<Contract>>,
  mccTransactionId: string
) {
  return contractRepo.findOneBy({ MccTransactionId: mccTransactionId });
}

export const registerContract = async (req: Request, res: Response) => {
  try {
    const { AcNo, Hashrate, HashrateUnit, StartDate, EndDate, MccTransactionId } = req.body;
    const mccTransactionId = normalizeMccTransactionId(MccTransactionId);

    if (!AcNo) {
      return res.status(400).json({ message: "AcNo is required" });
    }

    const accountRepo = AppDataSource.getRepository(Account);
    const account = await accountRepo.findOneBy({ AcNo });
    if (!account) {
      return res.status(400).json({ message: "Invalid AcNo: Account does not exist." });
    }

    const contractRepo = AppDataSource.getRepository(Contract);

    if (mccTransactionId) {
      const existing = await findContractByMccTransactionId(contractRepo, mccTransactionId);
      if (existing) {
        return res.status(200).json({
          message: "Contract already registered for this MCC transaction",
          created: false,
          data: existing,
        });
      }
    }

    const MipContractNo = await getUniqueMipContractNo();
    const now = new Date();

    const contract = contractRepo.create({
      AcNo,
      MipContractNo,
      Hashrate,
      HashrateUnit,
      StartDate,
      EndDate,
      MccTransactionId: mccTransactionId,
      CreatedOn: now,
      ModifiedOn: now,
      Status: 2,
    });

    await syncContractsIdSequence();

    try {
      await contractRepo.save(contract);
    } catch (saveErr: any) {
      if (
        saveErr?.code === "23505" &&
        mccTransactionId &&
        String(saveErr?.detail || "").includes("MccTransactionId")
      ) {
        const existing = await findContractByMccTransactionId(contractRepo, mccTransactionId);
        if (existing) {
          return res.status(200).json({
            message: "Contract already registered for this MCC transaction",
            created: false,
            data: existing,
          });
        }
      }
      throw saveErr;
    }

    return res.status(201).json({
      message: "Contract registered successfully in MIPS",
      created: true,
      data: contract,
    });
  } catch (err: any) {
    console.error("[registerContract]", err);
    if (err?.code === "23505" && String(err?.detail || "").includes('"Id"')) {
      return res.status(500).json({
        message: "Contract Id sequence out of sync. Run migrations/fix-contracts-id-sequence.sql and retry.",
        detail: err.detail,
      });
    }
    return res.status(500).json({
      message: err?.message || "Internal Server Error",
      detail: err?.detail ?? null,
      code: err?.code ?? null,
    });
  }
};

export const createContract = async (req: Request, res: Response) => {
  try {
    const {
      AcNo,
      Hashrate,
      HashrateUnit,
      StartDate,
      EndDate,
      PayoutMinSize,
      PayoutAssetCode,
      PayOutIntervalInDays,
      Status,
    } = req.body;

    if (!AcNo) {
      return res.status(400).json({ message: "AcNo is required." });
    }

    const accountRepo = AppDataSource.getRepository(Account);
    const account = await accountRepo.findOneBy({ AcNo });
    if (!account) {
      return res.status(400).json({ message: "Invalid AcNo: Account does not exist." });
    }

    const contractRepo = AppDataSource.getRepository(Contract);
    const MipContractNo = await getUniqueMipContractNo();
    const now = new Date();

    const contract = contractRepo.create({
      AcNo,
      MipContractNo,
      Hashrate,
      HashrateUnit,
      StartDate,
      EndDate,
      PayoutMinSize,
      PayoutAssetCode,
      PayOutIntervalInDays,
      Status: Status ?? 0,
      CreatedOn: now,
      ModifiedOn: now,
    });

    await syncContractsIdSequence();
    await contractRepo.save(contract);

    return res.status(201).json({
      message: "Contract created successfully",
      mipContractNo: contract.MipContractNo,
      data: contract,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getContractStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractRepo = AppDataSource.getRepository(Contract);
    const contract = await contractRepo.findOneBy({ Id: Number(id) });
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    return res.status(200).json({
      id: contract.Id,
      status: contract.Status,
      statusText: getStatusText(contract.Status)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


export const updateContractStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (typeof status !== "number" || status < 0 || status > 4) {
      return res.status(400).json({ message: "Invalid status code" });
    }

    const contractRepo = AppDataSource.getRepository(Contract);
    const contract = await contractRepo.findOneBy({ Id: Number(id) });
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }

    contract.Status = status;
    contract.ModifiedOn = new Date();
    await contractRepo.save(contract);

    return res.status(200).json({
      message: "Contract status updated successfully",
      status: contract.Status,
      statusText: getStatusText(contract.Status)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get a single contract by ID
export const getContract = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const contractRepo = AppDataSource.getRepository(Contract);
    const contract = await contractRepo.findOne({
      where: { Id: Number(id) },
      relations: ["account"] // if you want to include account details
    });
    if (!contract) {
      return res.status(404).json({ message: "Contract not found" });
    }
    return res.status(200).json(contract);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Get all contracts
export const getAllContracts = async (_req: Request, res: Response) => {
  try {
    const contractRepo = AppDataSource.getRepository(Contract);
    const contracts = await contractRepo.find({
      relations: ["account"] // if you want to include account details
    });
    return res.status(200).json(contracts);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


// Helper function
function getStatusText(status: number | undefined): string {
  switch (status) {
    case 0: return "Pending";
    case 1: return "Starting";
    case 2: return "Active";
    case 3: return "Expired";
    case 4: return "Cancelled";
    default: return "Unknown";
  }
}

