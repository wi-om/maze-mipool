import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from "typeorm";

@Entity()
@Unique(["email"])
@Unique(["mobile"])
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 128, unique: true, nullable: true })
  email!: string;

  @Column({ length: 16, unique: true, nullable: true })
  mobile!: string;

  @Column({ length: 256, nullable: true })
  firstName?: string;

  @Column({ length: 256, nullable: true })
  lastName?: string;

  @Column({ length: 256, nullable: true })
  firstNameAR?: string;

  @Column({ length: 256, nullable: true })
  lastNameAR?: string;

  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({ length: 256, nullable: true })
  emailVeriCode?: string;

  @Column({ type: "timestamp", nullable: true })
  emailVerifiedOn?: Date;

  @Column({ default: false })
  isPhoneVerified!: boolean;

  @Column({ length: 256, nullable: true })
  phoneVeriCode?: string;

  @Column({ type: "timestamp", nullable: true })
  phoneVerifiedOn?: Date;

  @Column({ length: 256, nullable: true })
  KYCProvider?: string;

  @Column({ length: 256, nullable: true })
  KYCID?: string;

  @Column({ length: 256, nullable: true })
  KYCLinkID?: string;

  @Column({ default: false })
  KYCPassed!: boolean;

  @Column({ type: "smallint", default: 0 })
  accountStatus!: number;

  @Column({ type: "smallint", default: 0 })
  loginAttempts!: number;

  @Column({ type: "timestamp", nullable: true })
  lockedUntil?: Date;

  @CreateDateColumn()
  createdOn!: Date;

  @UpdateDateColumn()
  modifiedOn!: Date;

  @Column({ type: "timestamp", nullable: true })
  lastLoginOn?: Date;

  @Column({ length: 64, nullable: true })
  lastLoginIP?: string;

  @Column({ type: "bigint", nullable: true })
  mipAccountNo?: number;

  @Column({ length: 256, nullable: true })
  BTCAddr?: string;

  @Column({ length: 256, nullable: true })
  BTCAddrNew?: string;

  @Column({ default: false })
  BTCAddrIsModified!: boolean;

  @Column({ type: "timestamp", nullable: true })
  BTCAddrModifiedOn?: Date;

  @Column({ nullable: true })
  BTCVerificationToken?: string;

  @Column()
  password!: string;

  // **Add these two**
  @Column({ length: 256, nullable: true })
  userType?: string;

  @Column({ length: 256, nullable: true })
  idn?: string;

  @Column({ length: 10, unique: true })  // Add this column for clientid
  clientid!: string;

  @Column({ nullable: true })
  profileImage?: string;

  @Column({
    type: "decimal",
    precision: 8,
    scale: 8,
    nullable: true,
  })
  MinPayoutAmt?: number;

  @Column({
    type: "varchar",
    length: 8,
    default: "0",
  })
  PayoutInterval!: string;

  @Column({
    type: "timestamp",
    nullable: true,
  })
  LastPayout?: Date;

  @Column({ type: "boolean", default: false })
  emailNotificationEnabled!: boolean;
}
