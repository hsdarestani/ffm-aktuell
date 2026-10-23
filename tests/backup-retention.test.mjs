import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('Backup retention removes only recognized expired snapshots and never follows links or recurses',()=>{
 const code=`import importlib.util, pathlib, tempfile, os
spec=importlib.util.spec_from_file_location('retention','scripts/expire-backups.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as td:
 root=pathlib.Path(td); now=2000000000
 def snapshot(name):
  p=root/name;p.mkdir()
  for f in m.FILES:(p/f).write_text('private fixture')
  os.utime(p,(now-9*86400,now-9*86400));return p
 old=snapshot('nightly-20260101T031700Z')
 fresh=snapshot('nightly-20260102T031700Z');os.utime(fresh,(now,now))
 partial=snapshot('.nightly-20260103T031700Z.partial')
 release=snapshot('pre-pr48-20260103')
 unexpected=snapshot('nightly-20260104T031700Z');(unexpected/'unexpected').write_text('keep')
 unsafe=snapshot('nightly-20260105T031700Z');(unsafe/'database.dump').unlink();(unsafe/'database.dump').symlink_to(fresh/'database.dump')
 link=root/'nightly-20260106T031700Z';link.symlink_to(fresh,target_is_directory=True)
 assert m.expire(root,7,now)==1
 assert not old.exists()
 assert all(p.exists() for p in (fresh,partial,release,unexpected,unsafe,link))
 assert (fresh/'database.dump').read_text()=='private fixture'
 try:m.expire(root,0,now);raise AssertionError('accepted zero retention')
 except ValueError:pass
print('safe retention passed')`;
 const r=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/safe retention passed/);
});

test('Nightly snapshots publish only after validation, stay private and preserve failed captures',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,statSync,copyFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'ffm-nightly-test-'));
 try{
  for(const dir of ['bin','backups','scripts','media/uploads'])mkdirSync(join(root,dir),{recursive:true});
  copyFileSync('scripts/expire-backups.py',join(root,'scripts/expire-backups.py'));
  writeFileSync(join(root,'.env'),'PRIVATE_FIXTURE=must-never-appear-in-logs\n',{mode:0o600});
  writeFileSync(join(root,'media/uploads','photo.txt'),'licensed fixture');
  writeFileSync(join(root,'bin/docker'),`#!/usr/bin/env bash
set -eu
case "$*" in
 *pg_dump*) [ "\${FAIL_DUMP:-0}" = 0 ] || exit 7; printf 'database archive fixture';;
 *pg_restore*) cat >/dev/null;;
 *'tar -czf'*) exec tar -czf - -C "$FIXTURE_MEDIA" uploads;;
 *) exit 8;;
esac
`,{mode:0o755});
  writeFileSync(join(root,'bin/date'),'#!/bin/sh\nprintf "%s\\n" "$SNAPSTAMP"\n',{mode:0o755});
  writeFileSync(join(root,'bin/df'),'#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 9999999 1 9999998 1%% /\\n"\n',{mode:0o755});
  const source=readFileSync('scripts/nightly-backup.sh','utf8').replaceAll('/opt/ffm-aktuell',root);
  const env={...process.env,PATH:join(root,'bin')+':'+process.env.PATH,FIXTURE_MEDIA:join(root,'media'),SNAPSTAMP:'20260101T031700Z'};
  const first=spawnSync('bash',['-c',source],{env,encoding:'utf8'});assert.equal(first.status,0,first.stderr);
  const snapshot=join(root,'backups/nightly-20260101T031700Z');
  assert.equal(statSync(snapshot).mode&0o777,0o700);
  for(const name of readdirSync(snapshot))assert.equal(statSync(join(snapshot,name)).mode&0o777,0o600,name);
  assert.equal(readFileSync(join(snapshot,'environment.private'),'utf8'),'PRIVATE_FIXTURE=must-never-appear-in-logs\n');
  assert.doesNotMatch(first.stdout+first.stderr,/must-never-appear-in-logs/);
  const repeated=spawnSync('bash',['-c',source],{env,encoding:'utf8'});assert.equal(repeated.status,0,repeated.stderr);
  assert.equal(readdirSync(snapshot).length,5,'A same-second repeat must not nest another directory');
  const failed=spawnSync('bash',['-c',source],{env:{...env,SNAPSTAMP:'20260102T031700Z',FAIL_DUMP:'1'},encoding:'utf8'});assert.notEqual(failed.status,0);
  assert.ok(readdirSync(join(root,'backups')).includes('.nightly-20260102T031700Z.partial'));
  assert.ok(!readdirSync(join(root,'backups')).includes('nightly-20260102T031700Z'));
  assert.doesNotMatch(failed.stdout+failed.stderr,/must-never-appear-in-logs/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
