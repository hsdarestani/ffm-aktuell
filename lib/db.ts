import pg from 'pg';
const g = globalThis as typeof globalThis & { ffmPool?: pg.Pool };
export const pool = g.ffmPool ?? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000
});
if(process.env.NODE_ENV !== 'production') g.ffmPool=pool;
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql:string, args:unknown[]=[]){
  return pool.query<T>(sql,args);
}
