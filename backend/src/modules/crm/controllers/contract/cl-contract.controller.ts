import { Request, Response } from "express";
import { AppDataSource } from "@common";
import { CLContract } from "@common";
import { Account } from "@common";
import { Client } from "@common";
import { AuthRequest } from "@common";



export const getAllCLContracts = async (req: AuthRequest, res: Response) => {
  try {
    const clContractRepo = AppDataSource.getRepository(CLContract);
    const contracts = await clContractRepo.find({
      relations: ["Creator", "Modifier"],
      order: { CreatedOn: "DESC" }
    });
    return res.status(200).json(contracts);
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getCLContractSummary = async (req: AuthRequest, res: Response) => {
  try {
    const summary = await AppDataSource.query('SELECT * FROM "CLActiveHashrateSummary"');
    return res.status(200).json(summary);
  } catch (error) {
    console.error("Error fetching CL summary:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const createCLContract = async (req: AuthRequest, res: Response) => {
  try {
    const { AcNo, ClientID, Hashrate, Remark, ContractRef, ContractStartDate, ContractEndDate, Status, hostingfee, SLA } = req.body;
    const userId = req.user?.id;

    if (!AcNo || !ClientID) {
      return res.status(400).json({ message: "AcNo and ClientID are required" });
    }

    const clContractRepo = AppDataSource.getRepository(CLContract);
    const now = new Date();

    const contract = clContractRepo.create({
      AcNo,
      ClientID,
      Hashrate,
      Remark,
      ContractRef,
      hostingfee,
      SLA,
      ContractStartDate: ContractStartDate ? new Date(ContractStartDate) : now,
      ContractEndDate: ContractEndDate ? new Date(ContractEndDate) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
      Status: Status ?? 1,
      CreatedOn: now,
      CreatedBy: userId,
      ModifiedOn: now,
      ModifiedBy: userId
    });

    await clContractRepo.save(contract);

    return res.status(201).json({
      message: "CL Contract created successfully",
      data: contract
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const updateCLContract = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { Hashrate, Remark, Status, ContractRef, ContractStartDate, ContractEndDate, hostingfee, SLA } = req.body;
    const userId = req.user?.id;

    if (!id) {
      return res.status(400).json({ message: "Contract ID is required" });
    }

    const clContractRepo = AppDataSource.getRepository(CLContract);
    const contract = await clContractRepo.findOneBy({ Id: parseInt(id) });

    if (!contract) {
      return res.status(404).json({ message: "CL Contract not found" });
    }

    if (Hashrate !== undefined) contract.Hashrate = Hashrate;
    if (Remark !== undefined) contract.Remark = Remark;
    if (Status !== undefined) contract.Status = Status;
    if (ContractRef !== undefined) contract.ContractRef = ContractRef;
    if (ContractStartDate !== undefined) contract.ContractStartDate = new Date(ContractStartDate);
    if (ContractEndDate !== undefined) contract.ContractEndDate = new Date(ContractEndDate);
    if (hostingfee !== undefined) contract.hostingfee = hostingfee;
    if (SLA !== undefined) contract.SLA = SLA;

    contract.ModifiedOn = new Date();
    contract.ModifiedBy = userId;

    await clContractRepo.save(contract);

    return res.status(200).json({
      message: "CL Contract updated successfully",
      data: contract
    });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const deleteCLContract = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Contract ID is required" });

    const clContractRepo = AppDataSource.getRepository(CLContract);
    const contract = await clContractRepo.findOneBy({ Id: parseInt(id) });

    if (!contract) return res.status(404).json({ message: "CL Contract not found" });

    await clContractRepo.remove(contract);
    return res.status(200).json({ message: "CL Contract deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting CL contract:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
