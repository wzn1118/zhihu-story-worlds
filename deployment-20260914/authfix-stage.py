from pathlib import Path
import os, json, shutil, subprocess, socket
base=Path('/data/zhihu-project')
old=base/'releases/20260914-1300'
new=base/'releases/authfix-20260914-1'
assert not new.exists(), 'New release must not exist'
new.mkdir()
for item in old.iterdir():
    if item.name in ['node_modules','public','.local','output']:
        (new/item.name).symlink_to(item.resolve(),target_is_directory=True)
    elif item.name not in ['dist','server','src']:
        if item.is_dir(): shutil.copytree(item,new/item.name,symlinks=True)
        elif item.is_file(): shutil.copy2(item,new/item.name)
for folder in ['server','src']:
    (new/folder).mkdir()
    for p in (old/folder).rglob('*'):
        target=new/p.relative_to(old)
        if p.is_dir(): target.mkdir(exist_ok=True);continue
        data=p.read_bytes()
        if p==old/'server/auth.ts':
            text=data.decode()
            assert text.count("secure: process.env.NODE_ENV === 'production'")==2
            text=text.replace("secure: process.env.NODE_ENV === 'production'", "secure: process.env.SESSION_COOKIE_SECURE !== '0' && process.env.NODE_ENV === 'production'")
            data=text.encode()
        elif p==old/'server/index.ts':
            text=data.decode()
            marker="app.use(express.static(resolve(process.cwd(), 'dist')));"
            assert marker in text
            text=text.replace(marker, marker+"\n  app.use(express.static(resolve(process.cwd(), 'public'), { dotfiles: 'deny', index: false }));\n  app.use(['/assets', '/games', '/intro'], (_req, res) => res.status(404).end());")
            data=text.encode()
        elif p==old/'src/App.tsx':
            text=data.decode();marker="setAccount(data.user); setAuthPassword('');"
            assert marker in text
            text=text.replace(marker,"const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store' }); const session = await sessionResponse.json(); if (!sessionResponse.ok || !session.user) throw new Error('登录会话未建立，请检查当前访问地址后重试。'); setAccount(session.user); setAuthPassword('');")
            data=text.encode()
        target.write_bytes(data)
log=base/'shared/logs/authfix-build-1.log'
env=os.environ.copy();env.update(TMPDIR=str(base/'shared/tmp'),npm_config_cache=str(base/'shared/cache/npm'))
with log.open('x') as out:
    r=subprocess.run(['node',str(new/'node_modules/typescript/bin/tsc'),'--noEmit','-p','tsconfig.production.json'],cwd=new,env=env,stdout=out,stderr=subprocess.STDOUT)
    assert r.returncode==0, 'Typecheck failed; see build log'
    r=subprocess.run(['node',str(new/'node_modules/vite/bin/vite.js'),'build'],cwd=new,env=env,stdout=out,stderr=subprocess.STDOUT)
    assert r.returncode==0, 'Build failed; see build log'
assert (new/'dist/index.html').is_file()
print(json.dumps({'release':str(new),'build':'passed'}))
