import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is not defined');
}

// Use the connection string from .env, but force SSL
const connectionString = `${process.env.POSTGRES_URL}?sslmode=require`;

async function main() {
  // Configure postgres client with SSL
  const sql = postgres(connectionString, { 
    max: 1,
    ssl: {
      rejectUnauthorized: false // Required for some cloud databases
    }
  });
  
  const db = drizzle(sql);

  console.log('Running migrations...');
  
  await migrate(db, { 
    migrationsFolder: path.join(__dirname, '../../drizzle')
  });
  
  console.log('Migrations completed!');
  
  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed!');
  console.error(err);
  process.exit(1);
});
