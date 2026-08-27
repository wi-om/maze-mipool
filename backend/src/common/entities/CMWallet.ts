import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Account } from "./Account";

@Entity({ name: "CM_wallet" })
export class CMWallet {
  @PrimaryGeneratedColumn()
  ID!: number;

  @Column({ type: "char", length: 12, nullable: true })
  @Index()
  AcNo?: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  @JoinColumn({ name: "AcNo", referencedColumnName: "AcNo" })
  account!: Account;

  @Column({ name: "Date", type: "timestamp", nullable: true })
  rewardDate?: Date;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Hashrate!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Amount!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Sales_amount!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Sales_hashrate!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Net_amount!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Net_Hashrate!: number;

  @Column({ type: "decimal", precision: 24, scale: 8, default: 0 })
  Net_Balance!: number;
}
