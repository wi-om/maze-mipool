import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { Account } from "./Account";

@Entity({ name: "Contracts" })
export class Contract {
  @PrimaryGeneratedColumn()
  Id!: number; // Primary Key

  @Column({ type: "char", length: 12 }) // FK, string like "MI12345678"
  AcNo!: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  @JoinColumn({ name: "AcNo", referencedColumnName: "AcNo" })
  account!: Account;

  @Column({ type: "char", length: 12, unique: true })
  MipContractNo!: string; // Contract Number

  @Column({ type: "decimal", precision: 28, scale: 18, nullable: true })
  Hashrate?: number;

  @Column({ type: "varchar", length: 16, nullable: true })
  HashrateUnit?: string; // Eg: TH, GH, MH, Sols

  @Column({ type: "timestamp", nullable: true })
  StartDate?: Date;

  @Column({ type: "timestamp", nullable: true })
  EndDate?: Date;

  @Column({ type: "varchar", length: 64, nullable: true })
  PayoutMinSize?: string; // Minimum payout threshold

  @Column({ type: "varchar", length: 16, nullable: true })
  PayoutAssetCode?: string; // Eg: BTC

  @Column({ type: "smallint", nullable: true })
  PayOutIntervalInDays?: number; // E.g., 1, 7, etc.

  @Column({ type: "smallint", nullable: true })
  Status?: number; // 0-Pending, 1-Starting, 2-Active, 3-Expired, 4-Cancelled

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  @Column({ type: "timestamp", nullable: true })
  ModifiedOn?: Date;

  /** MCC purchase transactionId — idempotent contract registration from mcc-delta */
  @Column({ type: "varchar", length: 64, nullable: true, unique: true })
  MccTransactionId?: string;
}
