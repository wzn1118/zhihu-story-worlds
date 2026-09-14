#!/usr/bin/env python3
import os,sys,json,subprocess,signal,time,fcntl
from pathlib import Path
BASE=Path('/data/zhihu-project')
RELEASE=BASE/'releases/20260914-1300'
RUN=BASE/'shared/run'; LOG=BASE/'shared/logs'
PID=RUN/'supervisor.pid'
def alive(pid):
 try:
  command=Path(f'/proc/{pid}/cmdline').read_bytes()
  return b'deployment-20260914/control.py' in command and b'supervise' in command
 except OSError: return False
action=sys.argv[1] if len(sys.argv)>1 else 'status'
if action=='start':
 if PID.exists() and alive(int(PID.read_text())):
  print('already running');sys.exit(0)
 p=subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'supervise'],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,cwd=RELEASE)
 time.sleep(2)
 if p.poll() is not None: raise SystemExit('Supervisor did not start; inspect logs')
 print(json.dumps({'supervisor_pid':p.pid,'health':'http://127.0.0.1:18080/healthz'}))
elif action=='status':
 pid=int(PID.read_text()) if PID.exists() else 0
 print(json.dumps({'supervisor_pid':pid,'running':alive(pid),'release':str(RELEASE)}))
elif action=='stop':
 pid=int(PID.read_text()) if PID.exists() else 0
 if alive(pid):
  os.kill(pid,signal.SIGTERM)
  for _ in range(100):
   if not alive(pid): break
   time.sleep(.2)
 print(json.dumps({'running':alive(pid)}))
elif action=='supervise':
 os.umask(0o077)
 lock=(RUN/'supervisor.lock').open('a')
 try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError: sys.exit(0)
 PID.write_text(str(os.getpid()))
 env=os.environ.copy();env.update(json.loads((BASE/'shared/config/runtime.json').read_text()))
 running=True;child=None
 def stop(*_):
  global running
  running=False
  if child and child.poll() is None: os.killpg(child.pid,signal.SIGTERM)
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 while running:
  name=time.strftime('app-%Y%m%d-%H%M%S')+f'-{os.getpid()}.log'
  with (LOG/name).open('x') as log:
   child=subprocess.Popen(['node','--import','tsx','deployment-20260914/production.ts'],cwd=RELEASE,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   code=child.wait()
  if running: time.sleep(3)
else: raise SystemExit('Usage: control.py start|stop|status|supervise')
