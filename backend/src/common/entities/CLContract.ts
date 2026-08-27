import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from "typeorm";
import { MipsUser } from "./MipsUser";

@Entity({ name: "CLContracts" })
export class CLContract {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  ClientID?: string;

  @Column({ type: "varchar", length: 12, nullable: true })
  AcNo?: string;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true })
  Hashrate?: number;

  @Column({ type: "text", nullable: true })
  Remark?: string; // autogrow

  @Column({ type: "varchar", length: 256, nullable: true })
  ContractRef?: string;

  @Column({ type: "timestamp", nullable: true })
  ContractStartDate?: Date;

  @Column({ type: "timestamp", nullable: true })
  ContractEndDate?: Date;

  @Column({ type: "int", nullable: true })
  Status?: number; // 0- inactive, 1-active, 2-expired, 3-cancelled, 4- down

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  @Column({ type: "bigint", nullable: true })
  CreatedBy?: number;

  @ManyToOne(() => MipsUser)
  @JoinColumn({ name: "CreatedBy" })
  Creator?: MipsUser;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true, default: 0 })
  hostingfee?: number;

  @Column({ type: "decimal", precision: 10, scale: 2, nullable: true, default: 0 })
  SLA?: number;

  @Column({ type: "timestamp", nullable: true })
  ModifiedOn?: Date;

  @Column({ type: "bigint", nullable: true })
  ModifiedBy?: number;

  @ManyToOne(() => MipsUser)
  @JoinColumn({ name: "ModifiedBy" })
  Modifier?: MipsUser;
}
