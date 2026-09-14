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
METHOD = 'local-u2net-connected-studio-alpha-v6-lane2-roi'
LANE = WORK / 'five-threads'

def utc():
    return datetime.now(timezone.utc).isoformat()

def polygon_mask(points, size):
    im = Image.new('L', size)
    ImageDraw.Draw(im).polygon([(round(x*size[0]/1024),round(y*size[1]/1536)) for x,y in points],fill=255)
    return np.asarray(im)>0

def archive(entry, reason):
    name = entry['jobId'] + '-' + entry['asset']['sha256'][:12]
    history = LANE / 'lane-2-history'; history.mkdir(exist_ok=True)
    for kind,path in [('review',WORK/'reviews'/(entry['jobId']+'.json')),('result',WORK/'results'/(name+'.json'))]:
        if path.exists():
            value=json.loads(path.read_text('utf-8-sig'))
            token=value.get('sha256','unknown')[:16]
            dest=history/(name+'-'+token+'-'+kind+'.json')
            if not dest.exists(): save_json(dest,dict(archivedAt=utc(),reason=reason,value=value))

def corrections(entry):
    path=LANE/'lane-2-corrections.json'
    return json.loads(path.read_text('utf-8')).get(entry['jobId'],{}) if path.exists() else {}

def correct_alpha(rgb,alpha,fix):
    arr=np.array(alpha); pixels=np.asarray(rgb).astype(np.int16)
    for points in fix.get('fg',[]): arr[polygon_mask(points,rgb.size)]=255
    for start,end in fix.get('row_span',[]):
        for y in range(round(start*rgb.height/1536),min(rgb.height,round(end*rgb.height/1536))):
            line=np.flatnonzero(arr[y]>127)
            if len(line): arr[y,line[0]:line[-1]+1]=255
    for points in fix.get('bg',[]): arr[polygon_mask(points,rgb.size)]=0
    for spec in fix.get('bg_color',[]):
        region=polygon_mask(spec['polygon'],rgb.size)
        sx,sy=spec['sample'];sx=round(sx*rgb.width/1024);sy=round(sy*rgb.height/1536)
        color=np.median(pixels[max(0,sy-3):sy+4,max(0,sx-3):sx+4],axis=(0,1))
        distance=np.max(np.abs(pixels-color),axis=2)
        arr[region & (distance<spec.get('tolerance',22))]=0
    return Image.fromarray(arr)

def patch_only(entry):
    archive(entry,'native-detail-alpha-correction')
    key=entry['jobId']+'-'+entry['asset']['sha256'][:12]
    path=WORK/'results'/(key+'.json'); result=json.loads(path.read_text('utf-8'))
    source=ROOT/'public'/entry['asset']['url'].lstrip('/'); target=ROOT/'public'/result['url'].lstrip('/')
    rgb=Image.open(source).convert('RGB'); alpha=Image.open(target).convert('RGBA').getchannel('A')
    alpha=correct_alpha(rgb,alpha,corrections(entry)); out=rgb.convert('RGBA');out.putalpha(alpha);out.save(target)
    decoded=np.asarray(Image.open(target).convert('RGBA'))
    assert digest(source.read_bytes())==entry['asset']['sha256']
    assert decoded.shape[:2]==(entry['asset']['height'],entry['asset']['width'])
    assert np.array_equal(decoded[:,:,:3],np.asarray(rgb))
    hist=alpha.histogram(); assert hist[0]>0 and hist[255]>0
    result.update(sha256=digest(target.read_bytes()),review='pending',generatedAt=utc(),method=METHOD+'-native-repair',corrections=corrections(entry),alpha=dict(transparent=hist[0],opaque=hist[255],partial=sum(hist[1:255])))
    result['preview']=make_preview(rgb,alpha,key);save_json(path,result)
    review=WORK/'reviews'/(entry['jobId']+'.json')
    if review.exists(): save_json(review,dict(jobId=entry['jobId'],sourceSha256=entry['asset']['sha256'],sha256=result['sha256'],decision='pending',fullImageViewed=False,nativeDetailViewed=False,reviewer='cutout-thread-2',notes='Native correction awaiting visual review',at=utc()))
    print(json.dumps(dict(patched=entry['jobId'],sha256=result['sha256'])),flush=True)

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
    archive(entry, 'fresh-five-thread-reprocessing-no-prior-approval-reused')
    fix=corrections(entry)
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
    studio = fix.get('studio', studio)
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
    for points in fix.get('uncertain',[]): labels[polygon_mask(points,working.size)]=cv2.GC_PR_FGD
    for points in fix.get('fg_seed',[]): labels[polygon_mask(points,working.size)]=cv2.GC_FGD
    background_model = np.zeros((1,65),np.float64); foreground_model = np.zeros((1,65),np.float64)
    cv2.grabCut(cv2.cvtColor(np.asarray(working),cv2.COLOR_RGB2BGR), labels, None, background_model, foreground_model, 3, cv2.GC_INIT_WITH_MASK)
    mask = np.where((labels==cv2.GC_FGD)|(labels==cv2.GC_PR_FGD),255,0).astype(np.uint8)
    # Restore enclosed body regions accidentally assigned to background. Outside
    # gaps remain background; interiors are solid cel color, never translucent.
    contour,_ = cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(mask,contour,-1,255,cv2.FILLED)
    alpha = Image.fromarray(mask).resize(rgb.size, Image.Resampling.LANCZOS)
    alpha = alpha.point(lambda v: max(0,min(255,round((v-32)*255/191))))
    alpha = correct_alpha(rgb,alpha,fix)
    rgba = rgb.convert('RGBA'); rgba.putalpha(alpha)
    target = PUBLIC / (name + '.png'); rgba.save(target)
    reread=np.asarray(Image.open(target).convert('RGBA'))
    verified_rgb=bool(np.array_equal(reread[:,:,:3],np.asarray(rgb)))
    if not verified_rgb or reread.shape[:2]!=(rgb.height,rgb.width): raise ValueError('DERIVATIVE_PIXEL_INVARIANT_FAILED')
    if digest(source.read_bytes())!=asset['sha256']: raise ValueError('SOURCE_CHANGED_DURING_PROCESS')
    histogram = alpha.histogram()
    preview = make_preview(rgb, alpha, name)
    result = dict(worldId=entry['worldId'], nodeId=entry['nodeId'], jobId=entry['jobId'],
        assetKind=entry['assetKind'], sourceHash=entry['sourceHash'], sourceUrl=asset['url'], sourceSha256=asset['sha256'],
        url='/generated-art/cutouts/'+target.name, sha256=digest(target.read_bytes()),
        width=rgb.width, height=rgb.height, review='pending',
        alpha=dict(transparent=histogram[0],opaque=histogram[255],partial=sum(histogram[1:255])),
        rgbUnchanged=verified_rgb, pixelsResized=False, method=METHOD, studioBackdrop=studio, preview=preview,
        generatedAt=utc(),corrections=fix,verification=dict(sourceShaVerified=True,sourceSizeVerified=True,rgbPixelsCompared=True,derivativeDecoded=True),
        seconds=round(time.time()-started,2))
    save_json(metadata, result)
    old_review=WORK/'reviews'/(entry['jobId']+'.json')
    if old_review.exists():
        old=json.loads(old_review.read_text('utf-8-sig'))
        save_json(old_review,dict(jobId=entry['jobId'],sourceSha256=asset['sha256'],sha256=result['sha256'],decision='pending',fullImageViewed=False,nativeDetailViewed=False,reviewer='cutout-thread-2',notes='Regenerated; awaiting current SHA visual review',at=utc()))
    return result

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--prepare',action='store_true'); parser.add_argument('--limit',type=int)
    parser.add_argument('--workers',type=int,default=3); parser.add_argument('--job-id',action='append',default=[])
    parser.add_argument('--plan-file')
    parser.add_argument('--patch-only',action='store_true')
    args=parser.parse_args()
    plan=json.loads(Path(args.plan_file).read_text(encoding='utf-8')) if args.plan_file else prepare() if args.prepare or not (WORK/'plan.json').exists() else json.loads((WORK/'plan.json').read_text(encoding='utf-8'))
    rows=plan['entries']
    if args.job_id: rows=[row for row in rows if row['jobId'] in args.job_id]
    if args.limit: rows=rows[:args.limit]
    if args.patch_only:
        for entry in rows: patch_only(entry)
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

if __name__=='__main__': main()
