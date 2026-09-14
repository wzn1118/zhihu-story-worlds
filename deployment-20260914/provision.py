from pathlib import Path
import os,json,subprocess,shlex,tarfile,io
root=Path(__file__).resolve().parents[1]
base='/data/zhihu-project'
release=base+'/releases/20260914-1300'
def ssh(command,data=None):
 result=subprocess.run(['ssh','-o','ClearAllForwardings=yes','-o','BatchMode=yes','ocean-intelligence',command],input=data,check=True)
 return result
env={k:os.environ[k] for k in ['OPENAI_BASE_URL','OPENAI_API_KEY','OPENAI_MODEL','OPENAI_TRANSPORT','OPENAI_REASONING_EFFORT','IMAGE2_BASE_URL','IMAGE2_API_KEY','IMAGE2_MODEL'] if os.environ.get(k)}
env.update({'NODE_ENV':'production','PUBLIC_MODE':'1','HOST':'127.0.0.1','PORT':'18080','AUTH_STORE':base+'/shared/snapshot-20260914-1300/.local/auth/users.json','TMPDIR':base+'/shared/tmp','TMP':base+'/shared/tmp','TEMP':base+'/shared/tmp','XDG_CACHE_HOME':base+'/shared/cache','XDG_DATA_HOME':base+'/shared/data','XDG_CONFIG_HOME':base+'/shared/config','npm_config_cache':base+'/shared/cache/npm','PLAYWRIGHT_BROWSERS_PATH':base+'/shared/browsers','WORKSHOP_CONFIG_PATH':base+'/shared/config/workshop-relay.json','ZHIHU_CLI_BIN':base+'/shared/tools/zhihu-cli/current/zhihu-cli'})
script='import sys,json,os,secrets; from pathlib import Path; p=Path("/data/zhihu-project/shared/config/runtime.json"); data=json.load(sys.stdin); data["SESSION_SECRET"]=secrets.token_hex(48); os.umask(0o077); f=p.open("x"); json.dump(data,f); f.close(); print("runtime configuration created; secrets redacted")'
ssh('python3 -c '+shlex.quote(script),json.dumps(env).encode())
script='from pathlib import Path; p=Path("/data/zhihu-project/shared/config/workshop-relay.json"); p.open("x").write("{\\"useEnvironment\\":true}")'
# Write the non-secret relay selector exclusively.
ssh("umask 077; set -C; cat > /data/zhihu-project/shared/config/workshop-relay.json",b'{"useEnvironment":true}')
skill=Path('E:/CodexHome/skills/zhihu')
buf=io.BytesIO()
with tarfile.open(fileobj=buf,mode='w:gz') as t:
 for p in [skill/'manifest.json',*sorted((skill/'scripts').glob('*.sh'))]:
  data=p.read_bytes().replace(b'\r\n',b'\n'); info=tarfile.TarInfo('zhihu-skill/'+p.relative_to(skill).as_posix()); info.size=len(data); info.mode=0o700 if p.suffix=='.sh' else 0o600;t.addfile(info,io.BytesIO(data))
ssh('mkdir -p /data/zhihu-project/shared/tools; tar --keep-old-files -xzf - -C /data/zhihu-project/shared/tools',buf.getvalue())
print('configuration and official CLI installer transferred; no secret values printed')
