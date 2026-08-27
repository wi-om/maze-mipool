import { Request, Response } from "express";
import { AppDataSource } from "@common";
import { Account } from "@common";
import { v4 as uuidv4 } from "uuid";

function generateAcNo(): string {
  // MI + 8 digit random number
  const randomNum = Math.floor(10000000 + Math.random() * 90000000);
  return `MI${randomNum}`;
}

export const registerAccount = async (req: Request, res: Response) => {
  try {
    const { Parent, Type = 'EU', Status = 1 } = req.body;

    if (!Parent) {
      return res.status(400).json({ message: "Parent (clientid) is required" });
    }

    const accountRepo = AppDataSource.getRepository(Account);

    // Check for duplicate Parent if needed (optional)
    const existing = await accountRepo.findOneBy({ Parent });
    if (existing) {
      return res.status(409).json({
        message: "Account with this Parent (clientid) already exists",
        data: existing,
      });
    }

    const generatedAcNo = generateAcNo();
    const now = new Date();

    const newAccount = accountRepo.create({
      Key: uuidv4(),
      AcNo: generatedAcNo,
      Parent, // Store clientid as Parent
      Type,
      Status,
      CreatedOn: now,
      ModifiedOn: now,
    });

    await accountRepo.save(newAccount);

    return res.status(201).json({
      message: "Account registered successfully in MIPS",
      data: newAccount
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getAccountByClientid = async (req: Request, res: Response) => {
  const clientid = req.params.clientid;
  const accountRepo = AppDataSource.getRepository(Account);
  const account = await accountRepo.findOneBy({ Parent: clientid });
  if (!account) {
    return res.status(404).json({ message: "No account found for this clientid" });
  }
  return res.json({ id: account.ID, acNo: account.AcNo, parent: account.Parent });
};

export const getAllAccounts = async (_req: Request, res: Response) => {
  try {
    const accountRepo = AppDataSource.getRepository(Account);
    const accounts = await accountRepo.find({
      order: { CreatedOn: "DESC" }
    });
    return res.status(200).json(accounts);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

