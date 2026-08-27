import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity({ name: "WalletAudit" })
export class WalletAudit {
  @PrimaryGeneratedColumn({ name: "ID" })
  ID!: number;

  @Column({ type: "int", nullable: true })
  WalletId?: number;

  @Column({ type: "char", length: 12 })
  @Index()
  AcNo!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  PreviousValue?: string;

  @Column({ type: "varchar", length: 256 })
  NewValue!: string;

  @Column({ type: "varchar", length: 32 })
  Action!: string;

  @Column({ type: "timestamp" })
  ChangedAt!: Date;

  @Column({ type: "varchar", length: 64, nullable: true })
  ChangedBy?: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  Ip?: string;
}
