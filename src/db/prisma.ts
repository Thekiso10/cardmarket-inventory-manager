import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { config } from '../config/env.js';

export function createPrismaClient() {
  const connectionString = new URL(config.db.url);
  connectionString.search = '';
  
  const pool = new pg.Pool({ 
    connectionString: connectionString.toString(),
    ssl: { rejectUnauthorized: false } 
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}
