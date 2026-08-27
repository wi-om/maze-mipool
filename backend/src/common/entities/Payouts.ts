import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Account } from "./Account";
import { Contract } from "./Contract";

@Entity({ name: "Payouts" })
@Index(["AcNo", "mipContractNo"])
export class Payout {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Column({ type: "char", length: 12 })
  AcNo!: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  @JoinColumn({ name: "AcNo", referencedColumnName: "AcNo" })
  account!: Account;

  @Column({ type: "char", length: 12 })
  mipContractNo!: string;

  @ManyToOne(() => Contract, { onDelete: "CASCADE" })
  @JoinColumn({ name: "mipContractNo", referencedColumnName: "MipContractNo" })
  contract!: Contract;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true })
  Amount?: number;

  @Column({ type: "varchar", length: 256, nullable: true })
  txid?: string;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true })
  txidFee?: number;

  /** True after Step 2 deduction (Amount − txidFee) has been applied. */
  @Column({ type: "boolean", default: false })
  txidFeeDeducted!: boolean;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  /** Last Dubai work-date (reward day) included in this payout. */
  @Column({ type: "date", nullable: true })
  paidThroughDate?: string | Date | null;

  @Column({ type: "varchar", length: 8 })
  Status!: string;

  @Column({ type: "varchar", length: 64 })
  ToAddr!: string;
}
