import {Pool} from 'pg';
import {scryptSync,randomBytes} from 'node:crypto';
const email=process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD;
if(!email||!password||password.length<14)throw new Error('Set ADMIN_EMAIL and strong ADMIN_PASSWORD (14+ chars) in the command environment.');
const salt=randomBytes(16).toString('hex');
const hash='scrypt$'+salt+'$'+scryptSync(password,salt,64).toString('hex');
const p=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const {rowCount}=await p.query("INSERT INTO users(email,password_hash,display_name,role) VALUES ($1,$2,'Administrator','admin') ON CONFLICT (email) DO UPDATE SET role='admin',password_hash=EXCLUDED.password_hash",[email,hash]);
 console.log('Admin account provisioned:',rowCount);
}finally{await p.end();}
