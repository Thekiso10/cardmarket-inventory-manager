import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from '../config/env.js';

export function createPrismaClient() {
  const pool = new pg.Pool({ connectionString: config.db.url });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
