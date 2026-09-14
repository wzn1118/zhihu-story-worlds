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
    history = WORK / 'five-threads/lane-3-history'
    history.mkdir(parents=True, exist_ok=True)
    for prior in (metadata, WORK / 'reviews' / (entry['jobId'] + '.json')):
        if prior.exists():
            (history / (prior.stem + '-' + str(time.time_ns()) + '.json')).write_bytes(prior.read_bytes())
    review_path = WORK / 'reviews' / (entry['jobId'] + '.json')
    if review_path.exists():
        review_path.unlink()
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
    with Image.open(target) as check:
        if check.size != rgb.size or not np.array_equal(np.asarray(check.convert('RGB')), np.asarray(rgb)):
            raise ValueError('DERIVATIVE_RGB_OR_SIZE_MISMATCH')
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
    started_path=WORK / 'five-threads/started-3.json'
    if not started_path.exists(): save_json(started_path, dict(lane=3, startedAt=datetime.now(timezone.utc).isoformat(), pid=os.getpid(), phase='processing', script=__file__))
    parser=argparse.ArgumentParser(); parser.add_argument('--prepare',action='store_true'); parser.add_argument('--limit',type=int)
    parser.add_argument('--workers',type=int,default=3); parser.add_argument('--job-id',action='append',default=[])
    parser.add_argument('--plan-file'); parser.add_argument('--repair',action='store_true'); parser.add_argument('--contacts',action='store_true');parser.add_argument('--cleanup',action='store_true')
    args=parser.parse_args()
    plan=json.loads(Path(args.plan_file).read_text(encoding='utf-8')) if args.plan_file else prepare() if args.prepare or not (WORK/'plan.json').exists() else json.loads((WORK/'plan.json').read_text(encoding='utf-8'))
    rows=plan['entries']
    if args.job_id: rows=[row for row in rows if row['jobId'] in args.job_id]
    if args.limit: rows=rows[:args.limit]
    if args.contacts:
        contacts(rows);return
    if args.cleanup:
        for row in rows: cleanup(row)
        return
    if args.repair:
        for row in rows: repair(row)
        return
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

def repair(entry):
    name=entry['jobId']+'-'+entry['asset']['sha256'][:12]
    source=ROOT/'public'/entry['asset']['url'].lstrip('/')
    rgb=Image.open(source).convert('RGB'); arr=np.asarray(rgb)
    work=rgb.copy();work.thumbnail((1600,1600)); a=np.asarray(work);h,w=a.shape[:2]
    bg=np.median(np.concatenate([a[:10,:30].reshape(-1,3),a[:10,-30:].reshape(-1,3)]),axis=0)
    d=np.max(np.abs(a.astype(float)-bg),axis=2)
    gray=cv2.GaussianBlur(cv2.cvtColor(a,cv2.COLOR_RGB2GRAY),(5,5),1.2)
    edge=cv2.Canny(gray,25,55)
    edge=cv2.dilate(edge,np.ones((3,3),np.uint8))
    allowed=((d<55)&(edge==0)).astype(np.uint8)
    _,lab=cv2.connectedComponents(allowed,connectivity=4)
    ids=np.unique(np.concatenate([lab[0,:int(w*.12)],lab[0,int(w*.88):]]));ids=ids[ids>0]
    exterior=np.isin(lab,ids)
    exterior=cv2.dilate(exterior.astype(np.uint8),np.ones((3,3),np.uint8))>0
    mask=(~exterior).astype(np.uint8)*255
    n,lab,stats,_=cv2.connectedComponentsWithStats(mask,8)
    keep=np.argmax(stats[1:,cv2.CC_STAT_AREA])+1
    mask=(lab==keep).astype(np.uint8)*255
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(mask,contours,-1,255,cv2.FILLED)
    # A narrow trimap keeps solid garments while cleaning textured backdrop flecks.
    eroded=cv2.erode(mask,np.ones((15,15),np.uint8))
    dilated=cv2.dilate(mask,np.ones((11,11),np.uint8))
    labels=np.where(mask>0,cv2.GC_PR_FGD,cv2.GC_PR_BGD).astype(np.uint8)
    labels[eroded>0]=cv2.GC_FGD;labels[dilated==0]=cv2.GC_BGD
    cv2.grabCut(cv2.cvtColor(a,cv2.COLOR_RGB2BGR),labels,None,np.zeros((1,65)),np.zeros((1,65)),3,cv2.GC_INIT_WITH_MASK)
    mask=np.where((labels==cv2.GC_FGD)|(labels==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    # Top-only seeds preserve garments that meet the canvas sides or bottom.
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(mask,contours,-1,255,cv2.FILLED)
    alpha=Image.fromarray(mask).resize(rgb.size,Image.Resampling.LANCZOS).point(lambda v: max(0,min(255,round((v-32)*255/191))))
    target=PUBLIC/(name+'.png'); rgba=rgb.convert('RGBA');rgba.putalpha(alpha);rgba.save(target)
    meta=WORK/'results'/(name+'.json'); result=json.loads(meta.read_text(encoding='utf-8'))
    history=WORK/'five-threads/lane-3-history';history.mkdir(exist_ok=True)
    (history/(name+'-'+str(time.time_ns())+'.json')).write_bytes(meta.read_bytes())
    result.update(sha256=digest(target.read_bytes()),method='local-u2net-connected-studio-alpha-v8b-top-seeded',review='pending',preview=make_preview(rgb,alpha,name))
    hist=alpha.histogram();result['alpha']=dict(transparent=hist[0],opaque=hist[255],partial=sum(hist[1:255]))
    save_json(meta,result);print(name,flush=True)

def contacts(rows):
    for start in range(0,len(rows),4):
        canvas=Image.new('RGB',(1600,1320),'white')
        for j,row in enumerate(rows[start:start+4]):
            key=row['jobId']+'-'+row['asset']['sha256'][:12]
            im=Image.open(WORK/'previews'/(key+'.jpg'));im.thumbnail((800,630))
            x=j%2*800;y=j//2*660;canvas.paste(im,(x,y+30))
            ImageDraw.Draw(canvas).text((x+8,y+6),str(start+j+1)+' '+row['worldId']+' '+row['nodeId'],fill='black')
        canvas.save(WORK/'five-threads'/('lane-3-contact-'+str(start+1)+'.jpg'),quality=94)

def cleanup(entry):
    cfg_path=WORK/'five-threads/lane-3-cleanup.json'
    cfg=json.loads(cfg_path.read_text(encoding='utf-8')); conf=cfg.get(entry['jobId'])
    if not conf:return
    key=entry['jobId']+'-'+entry['asset']['sha256'][:12];target=PUBLIC/(key+'.png')
    rgba=Image.open(target).convert('RGBA');arr=np.asarray(rgba);rgb=arr[:,:,:3];alpha=arr[:,:,3].copy();h,w=alpha.shape
    for region in conf.get('regions',[]):
        roi=np.zeros((h,w),np.uint8)
        pts=np.array([[round(x*w),round(y*h)] for x,y in region['polygon']],np.int32)
        cv2.fillPoly(roi,[pts],255)
        if region.get('restore'):
            alpha[roi>0]=255;continue
        lum=rgb.mean(axis=2);chroma=np.ptp(rgb.astype(np.int16),axis=2)
        cutoff=region.get('threshold',60);upper=region.get('upper',160)
        eliminate=(roi>0)&(lum>cutoff)&(lum<upper)&(chroma<region.get('chroma',18))
        alpha[eliminate]=0
    rgba.putalpha(Image.fromarray(alpha));rgba.save(target)
    meta=WORK/'results'/(key+'.json');result=json.loads(meta.read_text(encoding='utf-8'))
    history=WORK/'five-threads/lane-3-history';(history/(key+'-'+str(time.time_ns())+'.json')).write_bytes(meta.read_bytes())
    result.update(sha256=digest(target.read_bytes()),method='local-u2net-connected-studio-alpha-v9-reviewed-local-regions',review='pending',preview=make_preview(Image.fromarray(rgb),Image.fromarray(alpha),key))
    hist=Image.fromarray(alpha).histogram();result['alpha']=dict(transparent=hist[0],opaque=hist[255],partial=sum(hist[1:255]));save_json(meta,result)

if __name__=='__main__': main()
