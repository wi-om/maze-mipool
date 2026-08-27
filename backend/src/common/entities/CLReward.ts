import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { CLContract } from "./CLContract";

@Entity({ name: "CLRewards" })
export class CLReward {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Index()
  @Column({ type: "varchar", length: 12 })
  AcNo!: string;

  @Index()
  @Column({ type: "int", nullable: true })
  MipContractNo?: number | null;

  @Column({
    type: "decimal",
    precision: 24,
    scale: 8,
    transformer: { to: (value: number) => value, from: (value: string) => parseFloat(value) }
  })
  Amount!: number;

  @Column({ type: "varchar", length: 16, default: "FPPS" })
  Type!: string;

  @Column({
    type: "decimal",
    precision: 24,
    scale: 8,
    transformer: { to: (value: number) => value, from: (value: string) => parseFloat(value) }
  })
  Hashrate!: number;


  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  hostingfee_amount?: number | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  hostingfee_hashrate?: number | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  sla?: number | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  oc?: number | null;

  @Column({ type: "text", nullable: true })
  adjust_desc?: string | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  adjust_amount?: number | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  adjust_hashrate?: number | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  net_amount?: number | null;

  @Column({ type: "decimal", precision: 24, scale: 8, nullable: true, transformer: { to: (v: any) => v, from: (v: string) => parseFloat(v) } })
  net_hashrate?: number | null;

  @Index()
  @Column({ name: "rewardOn", type: "timestamp" })
  RewardOn!: Date;

  @ManyToOne(() => CLContract)
  @JoinColumn({ name: "MipContractNo" })
  Contract?: CLContract;
}
