#!/usr/bin/env python3
"""Merge an allowlisted JSON config into FFM's existing .env, never print values.
Missing keys preserve existing values; explicit empty strings disable a service.
Run on the isolated server, with .env and input JSON readable by its operator only.
"""
import json, os, pathlib, re, sys, tempfile
ALLOWED = {
 'TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_VERIFY_SERVICE_SID','FFM_PHONE_PREFIXES','FFM_PHONE_DAILY_LIMIT',
 'OPENWEATHER_API_KEY','OPENAI_API_KEY', 'OPENAI_RECOMMENDATION_MODEL',
 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
 'APPLE_SERVICE_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY',
 'WEB_PUSH_PUBLIC_KEY', 'WEB_PUSH_PRIVATE_KEY', 'WEB_PUSH_SUBJECT', 'PUSH_WORKER_TOKEN',
 'CLAMD_HOST', 'CLAMD_PORT', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
}
def merge_config(env_path, config):
 if not isinstance(config, dict) or set(config)-ALLOWED:
  raise ValueError('Unknown service setting')
 normalized = {}
 for key, value in config.items():
  if not isinstance(value, str) or len(value)>16000 or '\x00' in value:
   raise ValueError('Invalid service setting')
  if key=='APPLE_PRIVATE_KEY': value=value.replace('\r\n','\n').replace('\n',r'\n')
  elif '\n' in value or '\r' in value: raise ValueError('Unexpected multiline setting')
  # Compose dotenv single quotes preserve $, backticks, # and backslashes.
  normalized[key]="'"+value.replace("'",r"\'")+"'"
 old=env_path.read_text() if env_path.exists() else ''
 lines=old.splitlines(); replaced=set(); output=[]
 for line in lines:
  found=re.match(r'^([A-Z][A-Z0-9_]*)=',line)
  key=found.group(1) if found else None
  if key in normalized:
   if key not in replaced: output.append(key+'='+normalized[key]);replaced.add(key)
  else: output.append(line)
 for key in sorted(set(normalized)-replaced):output.append(key+'='+normalized[key])
 handle,temp=tempfile.mkstemp(prefix='.ffm-config-',dir=env_path.parent)
 try:
  os.fchmod(handle,0o600)
  with os.fdopen(handle,'w') as stream:stream.write('\n'.join(output)+'\n');stream.flush();os.fsync(stream.fileno())
  os.replace(temp,env_path)
 finally:
  if os.path.exists(temp):os.unlink(temp)
 return len(normalized)
if __name__=='__main__':
 try:
  env_path=pathlib.Path(sys.argv[1]);config=json.loads(pathlib.Path(sys.argv[2]).read_text())
  count=merge_config(env_path,config)
  print('Service configuration applied; settings:',count)
 except Exception:
  print('Invalid service configuration; values were not printed.',file=sys.stderr);sys.exit(1)
