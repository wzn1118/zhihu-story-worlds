"""Local character masks; retain source RGB pixels, dimensions and immutable originals."""
import argparse
import hashlib
import json
import os
import time
import sys
from datetime import datetime, timezone
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
import cv2

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'output/imagegen/character-cutouts-20260910'
PUBLIC = ROOT / 'public/generated-art/cutouts'
SESSION = None

def digest(data):
    return hashlib.sha256(data).hexdigest()

def save_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)

def prepare():
    WORK.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ROOT / 'public/generated-art/production-manifest.json').read_text(encoding='utf-8'))
    rows, excluded = [], []
    for world in manifest['worlds']:
        for row in world['assets']:
            if row['assetKind'] not in ('character-anchor', 'character-reaction') or row['review'] != 'approved' or not row.get('bindingReady'):
                continue
            entry = dict(row, worldId=world['worldId'], storyId=world['storyId'])
            review_file = ROOT / 'output/imagegen/scene-production/formal-production-20260907/reviews' / (row['jobId'] + '.json')
            if review_file.exists():
                review = json.loads(review_file.read_text(encoding='utf-8'))
                if review.get('decision') != 'approved' or review.get('sha256') != row['asset']['sha256']:
                    excluded.append(dict(entry, reason='latest-original-review-is-not-approved'))
                    continue
            rows.append(entry)
    plan = dict(createdAt=time.time(), sourceManifestAt=manifest['generatedAt'], entries=rows, excluded=excluded)
    save_json(WORK / 'plan.json', plan)
    return plan

def init_worker():
    global SESSION
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = 3
    options.inter_op_num_threads = 1
    cv2.setNumThreads(1)
    model = Path(os.environ.get('USERPROFILE', 'C:/Users/10847')) / '.u2net/u2net.onnx'
    SESSION = ort.InferenceSession(str(model), options, providers=['CPUExecutionProvider'])

def make_preview(rgb, alpha, name):
    rgba = rgb.copy().convert('RGBA'); rgba.putalpha(alpha)
    size = (min(550, rgb.width), min(820, rgb.height))
    small = rgba.copy(); small.thumbnail(size)
    canvas = Image.new('RGB', (small.width * 2, small.height + 34), '#ddd')
    for x, color in [(0, '#20392e'), (small.width, '#eee7df')]:
        bg = Image.new('RGBA', small.size, color); bg.alpha_composite(small)
        canvas.paste(bg.convert('RGB'), (x, 34))
    ImageDraw.Draw(canvas).text((8, 8), name, fill='#111')
    preview = WORK / 'previews' / (name + '.jpg'); preview.parent.mkdir(exist_ok=True)
    canvas.save(preview, quality=93)
    # Unscaled crops sample the actual silhouette at head, upper body and lower body.
    a = np.asarray(alpha)
    nonzero = np.argwhere(a > 127)
    if len(nonzero):
        top, left = nonzero.min(axis=0); bottom, right = nonzero.max(axis=0)
        points = []
        for ratio in [.08, .36, .70, .93]:
            y = int(top + (bottom-top)*ratio)
            line = np.flatnonzero(a[y] > 127)
            if len(line): points.extend([(int(line[0]), y), (int(line[-1]), y)])
        tile = 320
        edges = Image.new('RGB', (tile * 4, tile * 2), '#20392e')
        for i, (x, y) in enumerate(points[:8]):
            x = max(0, min(rgb.width-tile, x-tile//2)); y = max(0, min(rgb.height-tile, y-tile//2))
            crop = rgba.crop((x,y,x+tile,y+tile))
            bg = Image.new('RGBA', (tile,tile), '#20392e'); bg.alpha_composite(crop)
            edges.paste(bg.convert('RGB'), ((i%4)*tile,(i//4)*tile))
        edge_path = WORK / 'edges' / (name + '.png'); edge_path.parent.mkdir(exist_ok=True)
        edges.save(edge_path)
    return str(preview.relative_to(ROOT))

def process(entry):
    started = time.time()
    asset = entry['asset']; name = entry['jobId'] + '-' + asset['sha256'][:12]
    metadata = WORK / 'results' / (name + '.json'); metadata.parent.mkdir(exist_ok=True)
    if metadata.exists():
        old = json.loads(metadata.read_text(encoding='utf-8'))
        target = ROOT / 'public' / old['url'].lstrip('/')
        start_record = json.loads((WORK/'five-threads/started-1.json').read_text(encoding='utf-8-sig'))
        run_started = datetime.fromisoformat(start_record['startedAt'].replace('Z','+00:00')).timestamp()
        if metadata.stat().st_mtime >= run_started and old.get('method') == 'local-u2net-connected-studio-alpha-v5' and target.exists() and digest(target.read_bytes()) == old['sha256']:
            return old
    source = ROOT / 'public' / asset['url'].lstrip('/')
    data = source.read_bytes()
    if digest(data) != asset['sha256']: raise ValueError('SOURCE_SHA_MISMATCH ' + entry['jobId'])
    rgb = Image.open(source).convert('RGB')
    if rgb.size != (asset['width'], asset['height']): raise ValueError('SOURCE_SIZE_MISMATCH')
    sample = np.asarray(rgb.resize((320,320), Image.Resampling.LANCZOS)).astype(np.float32)
    sample /= max(float(sample.max()), 1e-6)
    sample = (sample - np.array([.485,.456,.406], dtype=np.float32)) / np.array([.229,.224,.225], dtype=np.float32)
    tensor = sample.transpose((2,0,1))[None].astype(np.float32)
    raw = SESSION.run(None, {SESSION.get_inputs()[0].name:tensor})[0][0,0]
    raw = (raw-raw.min())/max(float(raw.max()-raw.min()),1e-6)
    # Refine with original image colors so salient-object confidence does not make
    # dark shoulders translucent or keep a flat backdrop between loose hair strands.
    working = rgb.copy(); working.thumbnail((1600,1600))
    probability = cv2.resize(raw, working.size, interpolation=cv2.INTER_LINEAR)
    labels = np.where(probability > .14, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
    # Background certainty must be connected to the image border; saliency models
    # often assign almost-zero scores to the lower half of a dark robe.
    working_rgb = np.asarray(working)
    h,w = probability.shape
    corners = np.array([working_rgb[y,x] for y in (0,max(1,h//30)) for x in (0,w-1)],dtype=np.float32)
    bg_color = np.median(corners,axis=0)
    studio = float(np.max(np.std(corners,axis=0))) < 24 and float(np.ptp(bg_color)) < 35
    color_distance = np.max(np.abs(working_rgb.astype(np.float32)-bg_color),axis=2)
    if studio:
        labels = np.where(color_distance > 25,cv2.GC_PR_FGD,cv2.GC_PR_BGD).astype(np.uint8)
        # Only background-colored regions touching the outside can be certain
        # background: a gray shirt or shadow inside the person is still opaque.
        _, connected = cv2.connectedComponents((color_distance<22).astype(np.uint8),connectivity=8)
        border_ids = np.unique(np.concatenate([connected[0],connected[-1],connected[:,0],connected[:,-1]]))
        border_ids = border_ids[border_ids!=0]
        exterior = np.isin(connected,border_ids)
        labels[exterior] = cv2.GC_BGD
        core = cv2.erode((color_distance>55).astype(np.uint8),np.ones((3,3),np.uint8))
        labels[core>0] = cv2.GC_FGD
    else:
        edge = np.zeros((h,w),np.uint8);edge[:2]=1;edge[-2:]=1;edge[:,:2]=1;edge[:,-2:]=1
        labels[(probability < .03)&(edge>0)] = cv2.GC_BGD
    sure_fg = cv2.erode((probability > .97).astype(np.uint8), np.ones((5,5),np.uint8))
    labels[sure_fg > 0] = cv2.GC_FGD
    background_model = np.zeros((1,65),np.float64); foreground_model = np.zeros((1,65),np.float64)
    cv2.grabCut(cv2.cvtColor(np.asarray(working),cv2.COLOR_RGB2BGR), labels, None, background_model, foreground_model, 3, cv2.GC_INIT_WITH_MASK)
    mask = np.where((labels==cv2.GC_FGD)|(labels==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    # Restore enclosed body regions accidentally assigned to background. Outside
    # gaps remain background; interiors are solid cel color, never translucent.
    contour,_ = cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(mask,contour,-1,255,cv2.FILLED)
    alpha = Image.fromarray(mask).resize(rgb.size, Image.Resampling.LANCZOS)
    alpha = alpha.point(lambda v: max(0,min(255,round((v-32)*255/191))))
    rgba = rgb.convert('RGBA'); rgba.putalpha(alpha)
    target = PUBLIC / (name + '.png'); rgba.save(target)
    histogram = alpha.histogram()
    preview = make_preview(rgb, alpha, name)
    result = dict(worldId=entry['worldId'], nodeId=entry['nodeId'], jobId=entry['jobId'],
        assetKind=entry['assetKind'], sourceHash=entry['sourceHash'], sourceUrl=asset['url'], sourceSha256=asset['sha256'],
        url='/generated-art/cutouts/'+target.name, sha256=digest(target.read_bytes()),
        width=rgb.width, height=rgb.height, review='pending',
        alpha=dict(transparent=histogram[0],opaque=histogram[255],partial=sum(histogram[1:255])),
        rgbUnchanged=True, pixelsResized=False, method='local-u2net-connected-studio-alpha-v5', studioBackdrop=studio, preview=preview,
        seconds=round(time.time()-started,2))
    save_json(metadata, result)
    return result

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--prepare',action='store_true'); parser.add_argument('--limit',type=int)
    parser.add_argument('--workers',type=int,default=3); parser.add_argument('--job-id',action='append',default=[])
    parser.add_argument('--plan-file')
    args=parser.parse_args()
    plan=json.loads(Path(args.plan_file).read_text(encoding='utf-8')) if args.plan_file else prepare() if args.prepare or not (WORK/'plan.json').exists() else json.loads((WORK/'plan.json').read_text(encoding='utf-8'))
    rows=plan['entries']
    if args.job_id: rows=[row for row in rows if row['jobId'] in args.job_id]
    if args.limit: rows=rows[:args.limit]
    print(json.dumps(dict(selected=len(rows),excluded=len(plan['excluded']),workers=args.workers)),flush=True)
    errors=[]; results=[]
    with ProcessPoolExecutor(max_workers=args.workers,initializer=init_worker) as pool:
        futures={pool.submit(process,row):row for row in rows}
        for future in as_completed(futures):
            try:
                result=future.result(); results.append(result)
                print(json.dumps(dict(done=len(results),jobId=result['jobId'],seconds=result['seconds'],review=result['review'])),flush=True)
            except Exception as error:
                item=dict(jobId=futures[future]['jobId'],error=str(error));errors.append(item);print(json.dumps(item),flush=True)
    save_json(WORK/(Path(args.plan_file).stem+'-processing.json' if args.plan_file else 'processing.json'),dict(entries=results,errors=errors))
    if errors: raise SystemExit(1)

def lane_utilities():
    plan = json.loads((WORK/'five-threads/lane-1.json').read_text(encoding='utf-8'))['entries']
    if '--source-index' in sys.argv:
        for k,arg in enumerate(sys.argv):
            if arg!='--source-index': continue
            i=int(sys.argv[k+1]);e=plan[i];im=Image.open(ROOT/'public'/e['asset']['url'].lstrip('/')).convert('RGB');ratio=im.width/512;im.thumbnail((512,768));d=ImageDraw.Draw(im)
            for x in range(0,im.width,100):d.line((x,0,x,im.height),fill=(255,30,30),width=1);d.text((x+2,5),str(round(x*ratio)),fill=(255,0,0))
            for y in range(0,im.height,100):d.line((0,y,im.width,y),fill=(255,30,30),width=1);d.text((2,y+2),str(round(y*ratio)),fill=(255,0,0))
            im.save(WORK/f'five-threads/lane-1-source-{i}.jpg')
        return True
    if any(x in sys.argv for x in ('--erase','--clean','--polygon','--restore')):
        for k,arg in enumerate(sys.argv):
            if arg not in ('--erase','--clean','--polygon','--restore'): continue
            ix, coordinates, tolerance = sys.argv[k+1].split('|'); e=plan[int(ix)]
            key=e['jobId']+'-'+e['asset']['sha256'][:12]; f=WORK/'results'/(key+'.json');r=json.loads(f.read_text(encoding='utf-8'))
            source=ROOT/'public'/e['asset']['url'].lstrip('/');target=ROOT/'public'/r['url'].lstrip('/')
            rgb=Image.open(source).convert('RGB'); a=np.array(Image.open(target).getchannel('A'))
            history=WORK/'five-threads/lane-1-history';history.mkdir(exist_ok=True)
            Image.fromarray(a).save(history/(key+'-'+r['sha256'][:12]+'-alpha.png'))
            erasure=np.zeros(a.shape,np.uint8)
            if arg == '--restore':
                prior=sorted(history.glob(key+'-*-alpha.png'),key=lambda x:x.stat().st_mtime)[0]
                prior_a=np.array(Image.open(prior));x1,y1,x2,y2=map(int,coordinates.split(','));a[y1:y2,x1:x2]=prior_a[y1:y2,x1:x2];points=[]
            elif arg == '--polygon':
                cv2.fillPoly(erasure,[np.array([list(map(int,p.split(','))) for p in coordinates.split(';')],np.int32)],255)
                points=[]
            elif arg == '--clean':
                region, seeds=coordinates.split(':');x1,y1,x2,y2=map(int,region.split(','))
                image_array=np.array(rgb).astype(np.float32); bg=np.median([image_array[int(pt.split(',')[1]),int(pt.split(',')[0])] for pt in seeds.split(';')],axis=0)
                difference=np.max(np.abs(image_array-bg),axis=2);erasure[y1:y2,x1:x2]=np.where(difference[y1:y2,x1:x2]<int(tolerance),255,0)
                points=[]
            else: points=coordinates.split(';')
            for point in points:
                x,y=map(int,point.split(','));flood=np.zeros((a.shape[0]+2,a.shape[1]+2),np.uint8)
                cv2.floodFill(np.array(rgb),flood,(x,y),(0,0,0),loDiff=(int(tolerance),)*3,upDiff=(int(tolerance),)*3,flags=4|cv2.FLOODFILL_FIXED_RANGE|cv2.FLOODFILL_MASK_ONLY|(255<<8))
                erasure=np.maximum(erasure,flood[1:-1,1:-1])
            changed=int(np.count_nonzero((erasure>0)&(a>0)));a[erasure>0]=int(tolerance) if arg=='--polygon' else 0
            rgba=rgb.convert('RGBA');rgba.putalpha(Image.fromarray(a));rgba.save(target)
            r.update(sha256=digest(target.read_bytes()),review='pending',method='local-u2net-connected-studio-alpha-v5-lane1-seeded-color-repair')
            r.setdefault('manualRepairs',[]).append(dict(seeds=coordinates,tolerance=int(tolerance),pixelsErased=changed,at=datetime.now(timezone.utc).isoformat()))
            hist=Image.fromarray(a).histogram();r['alpha']=dict(transparent=hist[0],opaque=hist[255],partial=sum(hist[1:255]));make_preview(rgb,Image.fromarray(a),key);save_json(f,r)
            print(json.dumps(dict(index=int(ix),pixelsErased=changed,sha256=r['sha256'])))
        return True
    if '--contact-start' in sys.argv:
        start = int(sys.argv[sys.argv.index('--contact-start')+1])
        canvas=Image.new('RGB',(1440,1150),'#cfcfcf')
        for j,e in enumerate(plan[start:start+4]):
            key=e['jobId']+'-'+e['asset']['sha256'][:12]
            im=Image.open(WORK/'previews'/(key+'.jpg')); im.thumbnail((720,550))
            x=(j%2)*720;y=(j//2)*575;canvas.paste(im,(x,y+24))
            ImageDraw.Draw(canvas).text((x+8,y+3),f'{start+j} '+e['worldId']+' '+e['nodeId'],fill='black')
        canvas.save(WORK/f'five-threads/lane-1-sheet-{start}.jpg')
        return True
    if '--record' in sys.argv:
        for k,arg in enumerate(sys.argv):
            if arg != '--record': continue
            ix, decision, note = sys.argv[k+1].split('|',2); e=plan[int(ix)]
            key=e['jobId']+'-'+e['asset']['sha256'][:12]; f=WORK/'results'/(key+'.json')
            r=json.loads(f.read_text(encoding='utf-8')); src=ROOT/'public'/e['asset']['url'].lstrip('/'); dst=ROOT/'public'/r['url'].lstrip('/')
            a=np.asarray(Image.open(src).convert('RGB')); b=np.asarray(Image.open(dst).convert('RGBA'))
            checks=dict(sourceShaMatches=digest(src.read_bytes())==e['asset']['sha256'], derivativeShaMatches=digest(dst.read_bytes())==r['sha256'], rgbUnchanged=a.shape==b[:,:,:3].shape and np.array_equal(a,b[:,:,:3]), originalSize=Image.open(dst).size==(e['asset']['width'],e['asset']['height']), hasTransparent=bool(np.any(b[:,:,3]==0)), hasOpaque=bool(np.any(b[:,:,3]==255)))
            if not all(checks.values()): raise ValueError(str(checks))
            review=dict(jobId=e['jobId'],sourceSha256=e['asset']['sha256'],sha256=r['sha256'],decision=decision,fullImageViewed=True,nativeDetailViewed=True,reviewer='cutout-thread-1',notes=note,at=datetime.now(timezone.utc).isoformat(),verification=checks)
            rf=WORK/'reviews'/(e['jobId']+'.json'); rf.parent.mkdir(exist_ok=True)
            if rf.exists():
                prior=json.loads(rf.read_text(encoding='utf-8')); history=WORK/'five-threads/lane-1-history';history.mkdir(exist_ok=True)
                hf=history/(e['jobId']+'-'+prior.get('sha256','unknown')[:12]+'.json')
                if not hf.exists():save_json(hf,prior)
            save_json(rf,review);r['review']=decision;r['verification']=checks;save_json(f,r)
            print(json.dumps(dict(index=int(ix),decision=decision,sha256=r['sha256'])))
        return True
    return False

if __name__=='__main__':
    if not lane_utilities(): main()
