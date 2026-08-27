import { Router } from "express";
import { registerClient, getClients } from "../../controllers/clients/client.controller";

const router = Router();

router.get("/", getClients);
router.post("/register", registerClient);

export default router;
