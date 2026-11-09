import 'dotenv/config'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is missing');

const client = postgres(url, { max: 1, prepare: false });
const db = drizzle({ client });

try {
    const result = await db.execute(sql`select 1 as ok`);
    console.log('Database connected:', result)
} finally {
    await client.end();
}