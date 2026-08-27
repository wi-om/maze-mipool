/**
 * Fetch raw transaction JSON from blockchain.info (with blockstream.info fallback).
 * GET https://blockchain.info/rawtx/{txid}
 */
import axios from "axios";
import { BLOCKCHAIN_INFO_RAW_TX_URL, BLOCKSTREAM_TX_URL } from "./constants";
import { parseBlockchainRawTx } from "./parse";
import type { BlockchainRawTx } from "./types";

type BlockstreamTx = {
  txid: string;
  fee: number;
  status?: { block_time?: number };
  vin?: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout?: Array<{ scriptpubkey_address?: string; value?: number }>;
};

export function normalizeBlockstreamTx(data: BlockstreamTx): BlockchainRawTx {
  if (!data?.txid?.trim()) {
    throw new Error("Invalid blockstream transaction: missing txid");
  }
  const time = data.status?.block_time;
  if (!Number.isFinite(time) || !time || time <= 0) {
    throw new Error("Invalid blockstream transaction: missing block_time");
  }
  if (!Number.isFinite(data.fee) || data.fee < 0) {
    throw new Error("Invalid blockstream transaction: missing or invalid fee");
  }

  return {
    hash: data.txid.trim(),
    fee: data.fee,
    time,
    inputs: (data.vin ?? []).map((vin) => ({
      prev_out: vin.prevout?.scriptpubkey_address
        ? {
            addr: vin.prevout.scriptpubkey_address.trim(),
            value: vin.prevout.value,
          }
        : undefined,
    })),
    out: (data.vout ?? []).map((vout, n) => ({
      n,
      value: vout.value ?? 0,
      addr: vout.scriptpubkey_address?.trim(),
    })),
  };
}

async function fetchFromBlockstream(txid: string): Promise<BlockchainRawTx> {
  const url = `${BLOCKSTREAM_TX_URL}/${encodeURIComponent(txid)}`;
  const { data } = await axios.get<BlockstreamTx>(url, {
    timeout: 30_000,
    headers: { Accept: "application/json" },
  });
  return normalizeBlockstreamTx(data);
}

export async function fetchBlockchainRawTx(txid: string): Promise<BlockchainRawTx> {
  const url = `${BLOCKCHAIN_INFO_RAW_TX_URL}/${encodeURIComponent(txid)}`;
  const maxAttempts = 3;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data } = await axios.get<BlockchainRawTx>(url, {
        timeout: 30_000,
        headers: { Accept: "application/json" },
      });
      if (!data || typeof data !== "object") {
        throw new Error("Empty response from blockchain.info");
      }
      return data;
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      if (status === 404) {
        throw Object.assign(new Error(`Transaction not found: ${txid}`), { status: 404 });
      }
      if (status === 429 && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
        continue;
      }
      if (status === 429 || status === 502 || status === 503) {
        break;
      }
      const msg = err?.response?.data?.error || err?.message || "blockchain.info request failed";
      throw Object.assign(new Error(msg), { status: status || 502 });
    }
  }

  try {
    return await fetchFromBlockstream(txid);
  } catch (fallbackErr: any) {
    const msg =
      fallbackErr?.response?.data ??
      fallbackErr?.message ??
      (lastErr as any)?.message ??
      "blockchain fetch failed";
    throw Object.assign(new Error(String(msg)), { status: fallbackErr?.response?.status || 502 });
  }
}

/** Fetch + parse in one step (no DB). */
export async function fetchAndParseBlockchainTx(txid: string) {
  const raw = await fetchBlockchainRawTx(txid);
  return parseBlockchainRawTx(raw);
}
