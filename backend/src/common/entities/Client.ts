import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity({ name: "Clients" })
export class Client {
  @PrimaryColumn({ length: 64 })
  ClientID!: string;

  @Column({ length: 128 })
  AdminEmail!: string;

  @Column({ length: 128 })
  MIPSAcNo!: string;

  @Column({ type: "timestamp", nullable: true })
  CreatedOn?: Date;

  @Column({ type: "timestamp", nullable: true })
  ModifiedOn?: Date;
}
