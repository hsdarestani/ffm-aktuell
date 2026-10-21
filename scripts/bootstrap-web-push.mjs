// Operator-only output. Redirect stdout to a private temporary JSON file, never logs.
import {generateKeyPairSync,randomBytes} from 'node:crypto';
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const jwk=privateKey.export({format:'jwk'});
const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url');
process.stdout.write(JSON.stringify({WEB_PUSH_PUBLIC_KEY:publicKey,WEB_PUSH_PRIVATE_KEY:jwk.d,WEB_PUSH_SUBJECT:'https://ffm-aktuell.smarbiz.sbs',PUSH_WORKER_TOKEN:randomBytes(32).toString('hex')}));
