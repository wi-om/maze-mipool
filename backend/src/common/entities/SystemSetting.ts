import { Entity, PrimaryColumn, Column, UpdateDateColumn, CreateDateColumn } from "typeorm";

@Entity({ name: "SystemSettings" })
export class SystemSetting {
    @PrimaryColumn({ length: 64 })
    Key!: string;

    @Column({ type: "text" })
    Value!: string;

    @Column({ length: 128, nullable: true })
    UpdatedBy?: string;

    @CreateDateColumn()
    CreatedAt!: Date;

    @UpdateDateColumn()
    UpdatedAt!: Date;
}
