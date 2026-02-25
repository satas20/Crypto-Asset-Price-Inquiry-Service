import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('price_records')
@Index(['coinId', 'createdAt'])
export class PriceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  coinId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  symbol: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string;

  @Column({ type: 'decimal', precision: 24, scale: 8 })
  priceUsd: number;

  @Column({ type: 'bigint', nullable: true })
  marketCap: number;

  @Column({ type: 'bigint', nullable: true })
  volume24h: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  priceChangePercentage24h: number;

  @CreateDateColumn()
  @Index()
  createdAt: Date;
}
