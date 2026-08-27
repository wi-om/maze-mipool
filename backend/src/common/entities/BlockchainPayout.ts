import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity({ name: "blockchain_payout" })
@Index(["txid"])
export class BlockchainPayout {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 256 })
  txid!: string;

  @Column({ name: "ac_no", type: "char", length: 12, nullable: true })
  acNo?: string | null;

  @Column({ name: "mip_contract_no", type: "char", length: 12, nullable: true })
  mipContractNo?: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  address?: string | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true })
  amount?: number | null;

  @Column({ name: "txid_fee", type: "decimal", precision: 24, scale: 8, nullable: true })
  txidFee?: number | null;

  @Column({ name: "txn_date", type: "timestamp", nullable: true })
  txnDate?: Date | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  status?: string | null;

  @Column({ type: "varchar", length: 64, default: "blockchain.info_api" })
  source!: string;

  @Column({ name: "created_at", type: "timestamp", default: () => "now()" })
  createdAt!: Date;
}
