"""Local character masks; retain source RGB pixels, dimensions and immutable originals."""
import argparse
import hashlib
import json
import os
import time
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
    history = WORK / 'five-threads/lane-4-history'
    history.mkdir(parents=True, exist_ok=True)
    review_file = WORK / 'reviews' / (entry['jobId'] + '.json')
    for old_file in (metadata, review_file):
        if old_file.exists():
            old = json.loads(old_file.read_text(encoding='utf-8'))
            save_json(history / (old_file.stem + '-' + old_file.parent.name + '-' + str(time.time_ns()) + '.json'), old)
    if review_file.exists():
        save_json(review_file, dict(jobId=entry['jobId'],sourceSha256=asset['sha256'],decision='pending',reviewer='cutout-thread-4',at=datetime.now(timezone.utc).isoformat(),notes='Regenerating every lane-4 derivative; historical approval is not reused.'))
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
    actual = np.asarray(Image.open(target).convert('RGBA'))
    if not np.array_equal(actual[:,:,:3], np.asarray(rgb)): raise ValueError('RGB_CHANGED')
    if not (np.any(actual[:,:,3] == 0) and np.any(actual[:,:,3] == 255)): raise ValueError('ALPHA_EXTREMES_MISSING')
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
    save_json(WORK / 'five-threads/started-4.json', dict(lane=4, pid=os.getpid(), startedAt=datetime.now(timezone.utc).isoformat(), reviewer='cutout-thread-4', status='processing', planFile=str(WORK / 'five-threads/lane-4.json')))
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

def lane_rows():
    return json.loads((WORK / 'five-threads/lane-4.json').read_text(encoding='utf-8'))['entries']

def sheet(start, end, source=False):
    rows=lane_rows()
    tiles=[]
    for idx in (start if isinstance(start,list) else range(start,end+1)):
        e=rows[idx-1]; key=e['jobId']+'-'+e['asset']['sha256'][:12]
        p=ROOT/'public'/e['asset']['url'].lstrip('/') if source else WORK/'previews'/(key+'.jpg')
        im=Image.open(p).convert('RGB'); im.thumbnail((700,550))
        tile=Image.new('RGB',(700,580),'#ccc');tile.paste(im,((700-im.width)//2,30))
        ImageDraw.Draw(tile).text((8,8),str(idx)+' '+e['worldId']+' '+e['nodeId'],fill='black');tiles.append(tile)
    canvas=Image.new('RGB',(1400,580*((len(tiles)+1)//2)),'#ccc')
    for i,tile in enumerate(tiles):canvas.paste(tile,((i%2)*700,(i//2)*580))
    path=WORK/'five-threads'/('lane-4-'+('sources' if source else 'sheet')+(('-'+','.join(map(str,start))) if isinstance(start,list) else f'-{start}-{end}')+'.jpg')
    canvas.save(path,quality=95);print(path)

def review_one(idx, decision, notes):
    e=lane_rows()[idx-1];key=e['jobId']+'-'+e['asset']['sha256'][:12]
    rp=WORK/'results'/(key+'.json');r=json.loads(rp.read_text(encoding='utf-8'))
    source=ROOT/'public'/e['asset']['url'].lstrip('/');target=ROOT/'public'/r['url'].lstrip('/')
    sa=np.asarray(Image.open(source).convert('RGB'));ta=np.asarray(Image.open(target).convert('RGBA'))
    assert digest(source.read_bytes())==e['asset']['sha256']
    assert digest(target.read_bytes())==r['sha256']
    assert ta.shape[:2]==sa.shape[:2] and np.array_equal(sa,ta[:,:,:3])
    assert np.any(ta[:,:,3]==0) and np.any(ta[:,:,3]==255)
    rp2=WORK/'reviews'/(e['jobId']+'.json');rp2.parent.mkdir(exist_ok=True)
    evidence=dict(jobId=e['jobId'],sourceSha256=e['asset']['sha256'],sha256=r['sha256'],decision=decision,fullImageViewed=True,nativeDetailViewed=True,reviewer='cutout-thread-4',notes=notes,at=datetime.now(timezone.utc).isoformat())
    save_json(rp2,evidence);r['review']=decision;r['reviewNotes']=notes;r['verification']=dict(sourceShaMatched=True,derivativeShaMatched=True,rgbPixelEquality=True,originalSize=True,alphaZeroAnd255=True);save_json(rp,r)
    print(idx,decision,key)

def repair_one(idx, ops):
    e=lane_rows()[idx-1];key=e['jobId']+'-'+e['asset']['sha256'][:12]
    rp=WORK/'results'/(key+'.json');r=json.loads(rp.read_text(encoding='utf-8'))
    target=ROOT/'public'/r['url'].lstrip('/');rgb=Image.open(ROOT/'public'/e['asset']['url'].lstrip('/')).convert('RGB')
    a=np.asarray(Image.open(target).getchannel('A')).copy(); arr=np.asarray(rgb);h,w=a.shape
    for op in ops:
        poly=Image.new('L',(w,h));ImageDraw.Draw(poly).polygon([(int(x*w),int(y*h)) for x,y in op['polygon']],fill=255);region=np.asarray(poly)>0
        if op['action']=='restore':a[region]=255
        elif op['action']=='erase':a[region]=0
        elif op['action']=='close':
            closed=cv2.morphologyEx(a,cv2.MORPH_CLOSE,np.ones((op.get('size',15),op.get('size',15)),np.uint8))
            a[region]=closed[region]
        elif op['action']=='neutral':
            color=arr.astype(float);chroma=color.max(2)-color.min(2);mean=color.mean(2)
            cut=region&(chroma<op.get('chroma',14))&(mean>op.get('min',65))&(mean<op.get('max',220));a[cut]=0
    oldrev=WORK/'reviews'/(e['jobId']+'.json');hist=WORK/'five-threads/lane-4-history';hist.mkdir(exist_ok=True)
    for p in [rp,oldrev]:
        if p.exists():save_json(hist/(p.stem+'-'+p.parent.name+'-'+str(time.time_ns())+'.json'),json.loads(p.read_text(encoding='utf-8')))
    alpha=Image.fromarray(a);out=rgb.convert('RGBA');out.putalpha(alpha);out.save(target)
    r['sha256']=digest(target.read_bytes());r['method']='local-u2net-connected-studio-alpha-v5-lane4-manual-refinement';r['review']='pending';r.setdefault('manualRepairs',[]).append(dict(at=datetime.now(timezone.utc).isoformat(),operations=ops))
    histo=alpha.histogram();r['alpha']=dict(transparent=histo[0],opaque=histo[255],partial=sum(histo[1:255]));r['preview']=make_preview(rgb,alpha,key);save_json(rp,r)
    save_json(oldrev,dict(jobId=e['jobId'],sourceSha256=e['asset']['sha256'],sha256=r['sha256'],decision='pending',reviewer='cutout-thread-4',notes='Mask repaired; waiting for fresh full and native inspection.'))
    print(idx,key,r['sha256'])

if __name__=='__main__':
    import sys
    if '--sheet' in sys.argv:sheet(int(sys.argv[2]),int(sys.argv[3]),'--source' in sys.argv)
    elif '--select-sheet' in sys.argv:sheet([int(x) for x in sys.argv[2].split(',')],None,'--source' in sys.argv)
    elif '--repair-batch' in sys.argv:
        for task in json.loads(Path(sys.argv[2]).read_text(encoding='utf-8')):repair_one(task['index'],task['ops'])
    elif '--review-batch' in sys.argv:
        for task in json.loads(Path(sys.argv[2]).read_text(encoding='utf-8')):review_one(task['index'],task['decision'],task['notes'])
    elif '--review' in sys.argv:review_one(int(sys.argv[2]),sys.argv[3],sys.argv[4])
    elif '--repair' in sys.argv:repair_one(int(sys.argv[2]),json.loads(Path(sys.argv[3]).read_text(encoding='utf-8')))
    else:main()
