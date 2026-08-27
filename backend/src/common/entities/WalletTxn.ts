import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from "typeorm";
import { Account } from "./Account";
import { Wallet } from "./Wallet";

export type WalletTxnType = "CREDIT" | "DEBIT";
export type WalletTxnSourceType = "REWARD" | "PAYOUT";

@Entity({ name: "WalletTxn" })
@Index(["AcNo", "CreatedOn"])
@Index(["AcNo", "WorkDate"])
@Index(["SourceType", "SourceId"], { unique: true })
export class WalletTxn {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Column({ type: "char", length: 12 })
  AcNo!: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  @JoinColumn({ name: "AcNo", referencedColumnName: "AcNo" })
  account!: Account;

  @Column({ type: "int", nullable: true })
  WalletId?: number | null;

  @ManyToOne(() => Wallet, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "WalletId", referencedColumnName: "ID" })
  wallet?: Wallet | null;

  @Column({ type: "varchar", length: 8 })
  TxnType!: WalletTxnType;

  @Column({ type: "decimal", precision: 24, scale: 8 })
  Amount!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  RunningBalance!: number;

  @Column({ type: "varchar", length: 256, nullable: true })
  txid?: string | null;

  @Column({ type: "varchar", length: 128 })
  Source!: string;

  @Column({ type: "varchar", length: 128 })
  Destination!: string;

  @Column({ type: "varchar", length: 64, default: "Bitcoin" })
  AssetName!: string;

  @Column({ type: "varchar", length: 16, default: "BTC" })
  AssetCode!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  Remark?: string | null;

  @Column({ type: "char", length: 12, nullable: true })
  Reference?: string | null;

  @Column({ type: "varchar", length: 16 })
  SourceType!: WalletTxnSourceType;

  @Column({ type: "int" })
  SourceId!: number;

  @Column({ type: "date", nullable: true })
  WorkDate?: string | Date | null;

  @Column({ type: "timestamp", default: () => "now()" })
  CreatedOn!: Date;
}
