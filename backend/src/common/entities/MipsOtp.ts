import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
} from "typeorm";

@Entity({ name: "MipsOtps" })
export class MipsOtp {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ length: 128 })
    email!: string;

    @Column({ length: 6 })
    otp!: string;

    @Column({ type: "timestamp" })
    expiresAt!: Date;

    @CreateDateColumn()
    createdOn!: Date;
}
