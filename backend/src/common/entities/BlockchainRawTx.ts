import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity({ name: "blockchain_raw_tx" })
export class BlockchainRawTx {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 256 })
  txid!: string;

  @Column({ name: "raw_json", type: "jsonb" })
  rawJson!: Record<string, unknown>;

  @Column({ type: "varchar", length: 64, default: "blockchain.info_api" })
  source!: string;

  @Column({ name: "fetched_at", type: "timestamp", default: () => "now()" })
  fetchedAt!: Date;
}
