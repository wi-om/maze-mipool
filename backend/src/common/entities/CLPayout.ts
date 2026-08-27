import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from "typeorm";

@Entity({ name: "CLPayouts" })
export class CLPayout {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Index()
  @Column({ type: "varchar", length: 12 })
  AcNo!: string;

  @Index()
  @Column({ type: "int" })
  ContractNo!: number;

  @Column({
    type: "decimal",
    precision: 24,
    scale: 8,
    transformer: { to: (value: number) => value, from: (value: string) => parseFloat(value) }
  })
  Amount!: number;

  @Index()
  @CreateDateColumn()
  CreatedOn!: Date;

  @Column({ type: "varchar", length: 64 })
  ToAddr!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  TxnID?: string;

  @Column({ type: "varchar", length: 16, default: "queued" })
  Status!: string; // queued, sent, failed
}
