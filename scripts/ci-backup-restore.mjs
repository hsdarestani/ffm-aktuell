// Rehearse a real pg_dump/pg_restore using only the disposable CI PostgreSQL service.
import {spawnSync} from 'node:child_process';
import {openSync,closeSync,mkdirSync,unlinkSync} from 'node:fs';
import pg from 'pg';
const raw=process.env.ACTIVATION_CI_DATABASE_URL;if(!raw)throw Error('Missing CI database');const sourceURL=new URL(raw);
if(!['localhost','127.0.0.1'].includes(sourceURL.hostname)||sourceURL.pathname!=='/ffm_activation_ci')throw Error('Restore rehearsal requires isolated localhost CI source');
const container=process.env.FFM_CI_POSTGRES_CONTAINER||'';if(!/^[a-f0-9]{12,64}$/.test(container))throw Error('Missing isolated CI PostgreSQL container');
const restoredURL=new URL(sourceURL);restoredURL.pathname='/ffm_restore_ci';
const source=new pg.Pool({connectionString:sourceURL.href}),restored=new pg.Pool({connectionString:restoredURL.href});
mkdirSync('artifacts',{recursive:true});const path='artifacts/ci-restore-private.dump';
function docker(args,stdio){const r=spawnSync('docker',['exec','-i',container,...args],{stdio});if(r.error||r.status!==0)throw Error('CI backup/restore command failed')}
try{
 const output=openSync(path,'w',0o600);try{docker(['pg_dump','-U','ffm','-d','ffm_activation_ci','--format=custom'],['ignore',output,'inherit'])}finally{closeSync(output)}
 docker(['psql','-U','ffm','-d','postgres','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE ffm_restore_ci'],['ignore','ignore','inherit']);
 const input=openSync(path,'r');try{docker(['pg_restore','--exit-on-error','--clean','--if-exists','-U','ffm','-d','ffm_restore_ci'],[input,'ignore','inherit'])}finally{closeSync(input)}
 const tables=(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 let checked=0;
 for(const {tablename} of tables){const name='"'+tablename.replaceAll('"','""')+'"';const [before,after]=await Promise.all([source.query('SELECT count(*)::text AS n FROM public.'+name),restored.query('SELECT count(*)::text AS n FROM public.'+name)]);if(before.rows[0].n!==after.rows[0].n)throw Error('Restored row count mismatch: '+tablename);checked++}
 for(const fn of ['business_seat_capacity','business_staff_allowed'])if(!(await restored.query("SELECT 1 FROM pg_proc WHERE proname=$1",[fn])).rowCount)throw Error('Missing restored entitlement function');
 const constraints=(await restored.query("SELECT count(*)::int AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'")).rows[0].n;if(constraints<20)throw Error('Restored relational constraints missing');
 console.log('PASS: real PostgreSQL archive restored into isolated database; '+checked+' table counts, entitlement functions and '+constraints+' foreign keys verified');
}finally{await source.end();await restored.end();try{unlinkSync(path)}catch{}}
