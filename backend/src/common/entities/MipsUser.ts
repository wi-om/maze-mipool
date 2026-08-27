import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from "typeorm";

@Entity({ name: "MipsUsers" })
export class MipsUser {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ length: 256 })
    name!: string;

    @Column({ length: 128, unique: true })
    email!: string;

    /** SHA256 hex (64 chars) — hashed on client before login/signup. */
    @Column({ type: "char", length: 64, nullable: true })
    Password?: string | null;

    @Column({ length: 32, default: "admin" })
    role!: string; // superadmin, admin, finance, etc.

    @CreateDateColumn()
    createdOn!: Date;

    @UpdateDateColumn()
    modifiedOn!: Date;
}
