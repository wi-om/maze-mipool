import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Account } from "./Account";
import { Contract } from "./Contract";

@Entity({ name: "Hashrate1Hr" })
@Index(["AcNo", "mipContractNo"])
export class Hashrate1Hr {
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
  Hashrate?: number;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;
}
