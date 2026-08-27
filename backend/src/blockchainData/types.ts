/** Raw transaction input from blockchain.info /rawtx/{txid} */
export type BlockchainRawTxInput = {
  prev_out?: {
    addr?: string;
    value?: number;
  };
};

/** Raw transaction output from blockchain.info /rawtx/{txid} */
export type BlockchainRawTxOutput = {
  type?: number;
  spent?: boolean;
  value: number;
  n: number;
  addr?: string;
  script?: string;
};

/** Raw transaction from blockchain.info /rawtx/{txid} */
export type BlockchainRawTx = {
  hash: string;
  fee: number;
  time: number;
  inputs?: BlockchainRawTxInput[];
  out: BlockchainRawTxOutput[];
};

/** Parsed recipient row (all outputs except the change output). */
export type BlockchainRecipientRow = {
  outputIndex: number;
  address: string;
  amountBtc: number;
};

/** Parsed transaction header + recipient rows. */
export type ParsedBlockchainTx = {
  txid: string;
  txnDate: Date;
  txidFeeBtc: number;
  grossAmountBtc: number;
  recipients: BlockchainRecipientRow[];
};

export type AddrMeta = {
  acNo: string;
  contract: string;
};

export type ImportBlockchainTxResult = {
  txid: string;
  txnDate: string;
  txidFeeBtc: number;
  grossAmountBtc: number;
  recipientCount: number;
  rowsInserted: number;
  unmappedAddresses: string[];
  rawJsonStored: boolean;
};

export type ImportBlockchainTxBatchResult = {
  results: ImportBlockchainTxResult[];
  errors: Array<{ txid: string; error: string }>;
};
