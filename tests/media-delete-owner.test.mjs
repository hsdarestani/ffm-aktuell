import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('owners can permanently withdraw media and with it active stories and highlight grants',()=>{
 const code=readFileSync('app/api/media/manage/route.ts','utf8'),db=readFileSync('db/schema.sql','utf8');
 assert.match(code,/trustedOrigin\(req\)/);
 assert.match(code,/DELETE FROM user_media WHERE id=\$1 AND owner_id=\$2 RETURNING storage_key/);
 assert.match(code,/await remove\(r\.rows\[0\]\.storage_key\)/);
 assert.match(db,/REFERENCES user_media\(id\) ON DELETE CASCADE/);
 assert.match(db,/media_id uuid REFERENCES user_media\(id\) ON DELETE SET NULL/);
});
