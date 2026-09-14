from pathlib import Path
import subprocess,sys,shlex
script=Path(sys.argv[1])
name='/data/zhihu-project/shared/'+script.name
remote="python3 -c "+shlex.quote("import sys;from pathlib import Path;p=Path("+repr(name)+");p.open('xb').write(sys.stdin.buffer.read())")
subprocess.run(['ssh','-o','ClearAllForwardings=yes','ocean-intelligence',remote],input=script.read_bytes(),check=True)
subprocess.run(['ssh','-o','ClearAllForwardings=yes','ocean-intelligence','python3 '+shlex.quote(name)],check=True)
