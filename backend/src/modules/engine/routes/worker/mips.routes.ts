import { Router } from 'express';
import { getPayouts, getRewards, getWorkers } from '../../controllers/worker/workers.controller';

const router = Router();

// GET /api/mips/btc/workers
router.get('/btc/workers', getWorkers);
router.get('/btc/payouts', getPayouts);
router.get('/btc/rewards', getRewards);

export default router;
