import { Entity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity({ name: "UnitRewards" })
export class UnitReward {
  @PrimaryGeneratedColumn()
  Id!: number;

  @Column({ type: "decimal", precision: 24, scale: 18, nullable: true })
  RewardPerTH?: number;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  @Column({ type: "varchar", length: 32, nullable: true })
  Source?: string; // from which origin (mipool)
}
