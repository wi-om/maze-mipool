import { Entity, PrimaryGeneratedColumn, Column, Index } from "typeorm";

@Entity({ name: "Accounts" })
@Index(["AcNo"], { unique: true })
@Index(["Key"], { unique: true })
export class Account {
  @PrimaryGeneratedColumn()
  ID!: number;

  @Column({ type: "char", length: 12, unique: true })
  AcNo!: string; // Account Number e.g., "MI12345678"

  @Column({ length: 64, unique: true })
  Key!: string;

  @Column({ length: 256, nullable: true })
  Secret?: string;

  @Column({ type: "char", length: 64, nullable: true })
  Parent?: string;

  @Column({ length: 8, nullable: true })
  Type?: string; // 'CL', 'EU', 'SY'

  @Column({ length: 64, nullable: true })
  ClientID?: string;

  @Column({ length: 64, nullable: true })
  ClientAcNo?: string;

  @Column({ type: "smallint", nullable: true })
  Status?: number;

  @Column({ length: 256, nullable: true })
  MIPSVCode?: string;

  @Column({ length: 256, nullable: true })
  MIPSVKey?: string;

  @Column({ length: 256, nullable: true })
  MIPSVSecret?: string;

  @Column({ type: "smallint", nullable: true })
  FailedLogins?: number;

  @Column({ type: "boolean", nullable: true })
  IsACLocked?: boolean;

  @Column({ type: "timestamp", nullable: true })
  ACLockedUntil?: Date;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  @Column({ type: "timestamp", nullable: true })
  ModifiedOn?: Date;

  @Column({ type: "timestamp", nullable: true })
  LastLoggedOn?: Date;

  @Column({ length: 64, nullable: true })
  LastLoggedIP?: string;
}
