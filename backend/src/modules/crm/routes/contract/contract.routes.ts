import { Router } from "express";
import {
  createContract,
  getContractStatus,
  updateContractStatus,
  getContract,        // ← add
  getAllContracts,
  registerContract,
} from "../../controllers/contract/contract.controller";
import { getAllCLContracts, createCLContract, updateCLContract, getCLContractSummary, deleteCLContract } from "../../controllers/contract/cl-contract.controller";
import { verifyMipsToken } from "@common";

const router = Router();


router.get("/cl", verifyMipsToken, getAllCLContracts);
router.get("/cl/summary", verifyMipsToken, getCLContractSummary);
router.post("/cl", verifyMipsToken, createCLContract);
router.patch("/cl/:id", verifyMipsToken, updateCLContract);
router.delete("/cl/:id", verifyMipsToken, deleteCLContract);
router.post("/create", createContract);
router.post("/register", registerContract);
router.get("/:id/status", getContractStatus);
router.patch("/:id/status", updateContractStatus);
router.get("/:id", getContract);       
router.get("/", getAllContracts);

export default router;
