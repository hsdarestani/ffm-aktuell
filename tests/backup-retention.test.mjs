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
