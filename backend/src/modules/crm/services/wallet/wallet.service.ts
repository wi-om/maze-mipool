import { AppDataSource } from "@common";
import { Account } from "@common";
import { Wallet } from "@common/entities/Wallet";
import { WalletAudit } from "@common/entities/WalletAudit";
import { EntityManager, In } from "typeorm";

const DEFAULT_NAME = "BTC Payout";
const DEFAULT_ADDR_SPEC = "BTC";
const DEFAULT_ASSET_CODE = "BTC";

export type WalletMode = "create" | "reactivate";

function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length > 64) {
    return trimmed.slice(0, 64);
  }
  return trimmed;
}

async function getAccountByClientid(clientid: string) {
  const accountRepo = AppDataSource.getRepository(Account);
  const account = await accountRepo.findOneBy({ Parent: clientid });
  if (!account) {
    throw Object.assign(new Error("No MIPS account found for this clientid"), { status: 404 });
  }
  return account;
}

async function deactivateActiveWallets(manager: EntityManager, acNo: string, now: Date) {
  await manager
    .getRepository(Wallet)
    .createQueryBuilder()
    .update(Wallet)
    .set({ IsActive: false, DeactivatedOn: now, ModifiedOn: now })
    .where('"AcNo" = :acNo AND "IsActive" = :active', { acNo, active: true })
    .execute();
}

async function writeAudit(
  manager: EntityManager,
  input: {
    walletId: number;
    acNo: string;
    previousValue?: string | null;
    newValue: string;
    action: string;
    changedBy?: string;
    ip?: string;
    now: Date;
  }
) {
  const auditRepo = manager.getRepository(WalletAudit);
  const audit = auditRepo.create({
    WalletId: input.walletId,
    AcNo: input.acNo,
    PreviousValue: input.previousValue ?? undefined,
    NewValue: input.newValue,
    Action: input.action,
    ChangedAt: input.now,
    ChangedBy: input.changedBy,
    Ip: input.ip,
  });
  await auditRepo.save(audit);
}

export type SetWalletInput = {
  clientid: string;
  address: string;
  ip?: string;
  changedBy?: string;
  mode?: WalletMode;
};

export type SetWalletResult = {
  walletId: number;
  acNo: string;
  previousValue: string | null;
  newValue: string;
  action: "created" | "activated" | "reactivated" | "unchanged";
};

export type CheckWalletResult = {
  status: "new" | "active_same" | "inactive_exists";
  address: string;
  walletId?: number;
  activeAddress?: string | null;
};

export async function checkWalletAddress(
  clientid: string,
  address: string
): Promise<CheckWalletResult> {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    throw Object.assign(new Error("Address is required"), { status: 400 });
  }

  const account = await getAccountByClientid(clientid);
  const walletRepo = AppDataSource.getRepository(Wallet);

  const activeWallet = await walletRepo.findOne({
    where: { AcNo: account.AcNo, IsActive: true },
  });

  const matchingWallet = await walletRepo.findOne({
    where: { AcNo: account.AcNo, Addr: normalized },
  });

  if (matchingWallet?.IsActive === true) {
    return {
      status: "active_same",
      address: normalized,
      walletId: matchingWallet.ID,
      activeAddress: matchingWallet.Addr,
    };
  }

  if (matchingWallet && matchingWallet.IsActive === false) {
    return {
      status: "inactive_exists",
      address: normalized,
      walletId: matchingWallet.ID,
      activeAddress: activeWallet?.Addr ?? null,
    };
  }

  return {
    status: "new",
    address: normalized,
    activeAddress: activeWallet?.Addr ?? null,
  };
}

export async function setWalletAddress(input: SetWalletInput): Promise<SetWalletResult> {
  const { clientid, address, ip, changedBy, mode = "create" } = input;
  const normalized = normalizeAddress(address);

  if (!normalized) {
    throw Object.assign(new Error("Address is required"), { status: 400 });
  }

  const account = await getAccountByClientid(clientid);
  const now = new Date();

  return AppDataSource.transaction(async (manager) => {
    const walletRepo = manager.getRepository(Wallet);

    const activeWallet = await walletRepo.findOne({
      where: { AcNo: account.AcNo, IsActive: true },
    });

    const existingByAddr = await walletRepo.findOne({
      where: { AcNo: account.AcNo, Addr: normalized },
    });

    if (activeWallet?.Addr === normalized) {
      return {
        walletId: activeWallet.ID,
        acNo: account.AcNo,
        previousValue: normalized,
        newValue: normalized,
        action: "unchanged",
      };
    }

    if (existingByAddr && existingByAddr.IsActive === false) {
      if (mode !== "reactivate") {
        throw Object.assign(
          new Error("This address was used before. Reactivate it or choose a new address."),
          { status: 409, code: "PREVIOUS_WALLET_EXISTS" }
        );
      }

      const previousValue = activeWallet?.Addr ?? null;
      await deactivateActiveWallets(manager, account.AcNo, now);

      existingByAddr.IsActive = true;
      existingByAddr.DeactivatedOn = undefined;
      existingByAddr.ModifiedOn = now;
      existingByAddr.AddrModifiedOn = now;
      existingByAddr.IsAddrModified = false;
      existingByAddr.NewAddr = undefined;
      existingByAddr.AddrModificationKey = undefined;
      await walletRepo.save(existingByAddr);

      await writeAudit(manager, {
        walletId: existingByAddr.ID,
        acNo: account.AcNo,
        previousValue,
        newValue: normalized,
        action: "reactivated",
        changedBy: changedBy || clientid,
        ip,
        now,
      });

      return {
        walletId: existingByAddr.ID,
        acNo: account.AcNo,
        previousValue,
        newValue: normalized,
        action: "reactivated",
      };
    }

    if (existingByAddr && existingByAddr.IsActive === true) {
      return {
        walletId: existingByAddr.ID,
        acNo: account.AcNo,
        previousValue: normalized,
        newValue: normalized,
        action: "unchanged",
      };
    }

    const previousValue = activeWallet?.Addr ?? null;
    await deactivateActiveWallets(manager, account.AcNo, now);

    const newWallet = walletRepo.create({
      AcNo: account.AcNo,
      Name: DEFAULT_NAME,
      AddrSpec: DEFAULT_ADDR_SPEC,
      Addr: normalized,
      Balance: 0,
      AssetCode: DEFAULT_ASSET_CODE,
      IsActive: true,
      IsAddrModified: false,
      CreatedOn: now,
      ModifiedOn: now,
    });
    await walletRepo.save(newWallet);

    const action = activeWallet ? "activated" : "created";
    await writeAudit(manager, {
      walletId: newWallet.ID,
      acNo: account.AcNo,
      previousValue,
      newValue: normalized,
      action,
      changedBy: changedBy || clientid,
      ip,
      now,
    });

    return {
      walletId: newWallet.ID,
      acNo: account.AcNo,
      previousValue,
      newValue: normalized,
      action,
    };
  });
}

export async function getActiveWalletByClientid(clientid: string) {
  const account = await getAccountByClientid(clientid);
  const walletRepo = AppDataSource.getRepository(Wallet);

  const wallet = await walletRepo.findOne({
    where: { AcNo: account.AcNo, IsActive: true },
  });

  if (!wallet) {
    return { acNo: account.AcNo, address: null as string | null };
  }

  return {
    acNo: account.AcNo,
    walletId: wallet.ID,
    address: wallet.Addr,
    modifiedOn: wallet.ModifiedOn,
    isActive: wallet.IsActive,
  };
}

export async function getWalletHistoryByClientid(clientid: string) {
  const account = await getAccountByClientid(clientid);
  const auditRepo = AppDataSource.getRepository(WalletAudit);
  return auditRepo.find({
    where: { AcNo: account.AcNo },
    order: { ChangedAt: "DESC" },
  });
}

export type EuWalletRow = {
  acNo: string;
  parentClientid: string | null;
  walletId: number | null;
  btcAddr: string | null;
  balance: number;
  isActive: boolean;
  hasWallet: boolean;
};

export async function listEuWallets(): Promise<EuWalletRow[]> {
  const accountRepo = AppDataSource.getRepository(Account);
  const accounts = await accountRepo.find({
    where: { Type: "EU" },
    select: ["AcNo", "Parent"],
  });

  if (!accounts.length) return [];

  const acNos = accounts.map((a) => a.AcNo);
  const walletRepo = AppDataSource.getRepository(Wallet);
  const wallets = await walletRepo.find({
    where: { AcNo: In(acNos) },
    order: { CreatedOn: "DESC" },
  });

  const walletByAcNo = new Map<string, Wallet>();
  for (const w of wallets) {
    const key = String(w.AcNo).trim();
    const existing = walletByAcNo.get(key);
    if (!existing) {
      walletByAcNo.set(key, w);
      continue;
    }
    if (w.IsActive && !existing.IsActive) {
      walletByAcNo.set(key, w);
    }
  }

  return accounts
    .map((account) => {
      const acNo = String(account.AcNo).trim();
      const wallet = walletByAcNo.get(acNo);
      const addr = wallet?.Addr?.trim() || null;
      return {
        acNo,
        parentClientid: account.Parent ?? null,
        walletId: wallet?.ID ?? null,
        btcAddr: addr,
        balance: Number(wallet?.Balance ?? 0),
        isActive: wallet?.IsActive === true,
        hasWallet: Boolean(wallet),
      };
    })
    .sort((a, b) => b.balance - a.balance);
}

export async function listWalletsByClientid(clientid: string) {
  const account = await getAccountByClientid(clientid);
  const walletRepo = AppDataSource.getRepository(Wallet);
  const wallets = await walletRepo.find({
    where: { AcNo: account.AcNo },
    order: { CreatedOn: "DESC" },
  });
  return wallets.map((w) => ({
    walletId: w.ID,
    address: w.Addr,
    isActive: w.IsActive === true,
    createdOn: w.CreatedOn,
    deactivatedOn: w.DeactivatedOn,
  }));
}
