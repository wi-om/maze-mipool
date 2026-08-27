import { Request, Response } from 'express';
import { withSpan } from '@common';
import { fetchMipsPayouts, fetchMipsRewards, fetchMipsWorkers } from '../../service/mips.service';

const MIPS_BTC_WORKERS_ROUTE = '/api/mips/btc/workers';

export async function getWorkers(req: Request, res: Response) {
  try {
    const data = await withSpan(
      'mips.btc.workers.handler',
      {
        module: 'mips',
        operation: 'btc_workers',
        route: MIPS_BTC_WORKERS_ROUTE,
        'http.method': req.method,
        'http.route': MIPS_BTC_WORKERS_ROUTE,
      },
      async () => fetchMipsWorkers()
    );
    // You can redact/shape if needed before returning
    return res.status(200).json(data);
  } catch (err: any) {
    const status = err?.response?.status ?? 500;
    const detail = err?.response?.data ?? err?.message ?? 'Unknown error';
    return res.status(status).json({
      message: 'Failed to fetch workers from MIPS',
      detail,
    });
  }
}

export async function getPayouts(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit ?? 30);
    const offset = Number(req.query.offset ?? 0);
    const data = await fetchMipsPayouts(limit, offset);
    return res.status(200).json(data);
  } catch (err: any) {
    let detail: any = err?.message;
    try { detail = JSON.parse(err?.message); } catch {}
    const status = detail?.status ?? 502;
    return res.status(status).json({
      message: 'Failed to fetch payouts from MIPS',
      detail,
    });
  }
}

export async function getRewards(req: Request, res: Response) {
  try {
    const limit = Number(req.query.limit ?? 500);
    const offset = Number(req.query.offset ?? 0);

    const data = await fetchMipsRewards(limit, offset);
    return res.status(200).json(data); // { income: [...] }
  } catch (err: any) {
    let detail: any = err?.message;
    try { detail = JSON.parse(err?.message); } catch {}
    const status = detail?.status ?? 502;
    return res.status(status).json({
      message: 'Failed to fetch rewards from MIPS',
      detail,
    });
  }
}
