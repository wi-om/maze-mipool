import { Request, Response } from "express";
import { Client } from "@common";
import { AppDataSource } from "@common";

export interface ClientRegistrationDTO {
  ClientID: string;
  AdminEmail: string;
}

function generate10DigitNumber(): string {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

export const registerClient = async (req: Request, res: Response) => {
  try {
    const { ClientID, AdminEmail } = req.body;

    if (!ClientID || !AdminEmail) {
      return res.status(400).json({ message: "ClientID and AdminEmail are required" });
    }

    // Generate random 10-digit number
    const MIPSAcNo = generate10DigitNumber();

    // Set timestamps
    const now = new Date();

    // Create and save the client
    const clientRepo = AppDataSource.getRepository(Client);

    const client = clientRepo.create({
      ClientID,
      AdminEmail,
      MIPSAcNo,
      CreatedOn: now,
      ModifiedOn: now,
    });

    await clientRepo.save(client);

    return res.status(201).json({
      message: "Client registered successfully",
      data: client,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const getClients = async (req: Request, res: Response) => {
  try {
    const clientRepo = AppDataSource.getRepository(Client);
    const clients = await clientRepo.find({ order: { CreatedOn: "DESC" } });
    return res.status(200).json({ data: clients });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


