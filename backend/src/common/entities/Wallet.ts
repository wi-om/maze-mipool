import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from "typeorm";
import { Account } from "./Account";

@Entity({ name: "Wallets" })
export class Wallet {
  @PrimaryGeneratedColumn({ name: "ID" })
  ID!: number;

  @Column({ type: "char", length: 12 })
  @Index()
  AcNo!: string;

  @ManyToOne(() => Account, { onDelete: "CASCADE" })
  @JoinColumn({ name: "AcNo", referencedColumnName: "AcNo" })
  account!: Account;

  @Column({ type: "varchar", length: 64 })
  Name!: string;

  @Column({ type: "varchar", length: 64 })
  AddrSpec!: string;

  @Column({ type: "varchar", length: 64 })
  Addr!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  Memo?: string;

  @Column({ name: "Group", type: "char", length: 64, nullable: true })
  Group?: string;

  @Column({ type: "numeric", default: 0 })
  Balance!: number;

  @Column({ type: "timestamp", nullable: true })
  Score?: Date;

  @Column({ type: "varchar", length: 64, nullable: true })
  AssetName?: string;

  @Column({ type: "varchar", length: 16, nullable: true })
  AssetCode?: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  ContractAddr?: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  NewAddr?: string;

  @Column({ type: "boolean", nullable: true })
  IsAddrModified?: boolean;

  @Column({ type: "timestamp", nullable: true })
  AddrModifiedOn?: Date;

  @Column({ type: "varchar", length: 256, nullable: true })
  AddrModificationKey?: string;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  @Column({ type: "timestamp", nullable: true })
  ModifiedOn?: Date;

  @Column({ type: "timestamp", nullable: true })
  LastLoginOn?: Date;

  @Column({ type: "varchar", length: 64, nullable: true })
  LastLoginIP?: string;

  @Column({ type: "boolean", nullable: true })
  IsActive?: boolean;

  @Column({ type: "timestamp", nullable: true })
  DeactivatedOn?: Date;
}
