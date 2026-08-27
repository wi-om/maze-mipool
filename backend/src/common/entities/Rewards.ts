import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Account } from "./Account";
import { Contract } from "./Contract";

@Entity({ name: "Rewards" })
@Index(["AcNo", "mipContractNo"])
export class Reward {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Column({ type: "char", length: 12 })
  AcNo!: string; // FK

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  @JoinColumn({ name: "AcNo", referencedColumnName: "AcNo" })
  account!: Account;

  @Column({ type: "char", length: 12 })
  mipContractNo!: string; // FK

  @ManyToOne(() => Contract, { onDelete: "CASCADE" })
  @JoinColumn({ name: "mipContractNo", referencedColumnName: "MipContractNo" })
  contract!: Contract;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true })
  Amount?: number;

  @Column({ type: "varchar", length: 16, nullable: true })
  Type?: string; // Eg: FPPS, PLNS

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true })
  Hashrate?: string;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;
}
