#!/usr/bin/env python3
"""Head-swap: paste source head (img2) onto base body (img1).
Uses face-box-width scale + face-center anchor (validated by two independent analyses),
silhouette-adaptive source mask (skin+hair, trimmed above the clothing), feathered composite,
per-channel color match to blend skin tone."""
import cv2, numpy as np

BASE="img1.jpg"; SRC="img2.jpg"; OUT="result.png"
base=cv2.imread(BASE); src=cv2.imread(SRC)
H,W=base.shape[:2]; h,w=src.shape[:2]

# ---- face boxes (validated, two sets averaged) ----
# base face box (subagent (376,415,521,521); ours (396,432,477,477)) -> use subagent's cleaner box
bf_box=(376,415,521,521)
sf_box=(249,391,546,546)
bfx,bfy,bfw,bfh=bf_box; sfx,sfy,sfw,sfh=sf_box
b_fc=(bfx+bfw/2, bfy+bfh/2)   # base face center
s_fc=(sfx+sfw/2, sfy+sfh/2)   # source face center
scale=bfw/sfw                  # ~0.95
# map source faces onto base: similarity (scale + translation, no rotation for frontal faces)
t=(b_fc[0]-scale*s_fc[0], b_fc[1]-scale*s_fc[1])
A=np.array([[scale,0,t[0]],[0,scale,t[1]]],dtype=np.float64)

# ---- source head silhouette mask ----
fx,fy,fw,fh=sfx,sfy,sfw,sfh
hsv=cv2.cvtColor(src,cv2.COLOR_BGR2HSV)
skin=cv2.inRange(hsv,(0,30,40),(25,170,255))|cv2.inRange(hsv,(150,30,40),(180,170,255))
lab=cv2.cvtColor(src,cv2.COLOR_BGR2LAB); L=lab[...,0]
dark=(L<95).astype(np.uint8)*255
box=np.zeros_like(skin); box[int(fy-0.38*fh):int(fy+1.10*fh),int(fx-0.30*fw):int(fx+1.30*fw)]=255
head=((skin|dark)&box)
head=cv2.morphologyEx(head,cv2.MORPH_CLOSE,np.ones((31,31),np.uint8))
head=cv2.dilate(head,np.ones((21,21),np.uint8))
n,lbl,st,ce=cv2.connectedComponentsWithStats(head)
if n>1:
    idx=1+int(np.argmax(st[1:,cv2.CC_STAT_AREA])); head=(lbl==idx).astype(np.uint8)*255
chin=fy+fh
head[int(chin+0.10*fh):,:]=0                       # trim clothing below the neck
head=cv2.morphologyEx(head,cv2.MORPH_OPEN,np.ones((7,7),np.uint8))
core=cv2.GaussianBlur(head.astype(np.float32),(0,0),sigmaX=12)/255.0
core=np.clip(core,0,1)
# soft outer feather on the retained silhouette (avoids hard stub against base hair/shoulders)
feather=cv2.GaussianBlur((core>0).astype(np.float32),(0,0),sigmaX=26); feather=np.clip(feather*1.6,0,1)
mask_src=np.maximum(core, feather*(core>0).astype(np.float32))
mask_src=np.clip(mask_src,0,1)

# ---- warp source + mask into base frame ----
warp=cv2.warpAffine(src,A,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
mask=cv2.warpAffine(mask_src,A,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
mask=np.clip(mask,0,1)[:,:,None]

# ---- color match the source patch to the base head region it covers ----
def stats(im,m):
    sel=im[m[...,0]>0.25]
    return (sel.mean(axis=0), sel.std(axis=0)+1e-6) if sel.size else None
bs=stats(base.astype(np.float32),mask); ss=stats(warp.astype(np.float32),mask)
if bs and ss:
    (mb,sb),(ms,ssd)=bs,ss
    warp=np.clip((warp.astype(np.float32)-ms)/ssd*sb+mb,0,255).astype(np.uint8)

# ---- composite ----
out=base.astype(np.float32)*(1-mask)+warp.astype(np.float32)*mask
out=out.clip(0,255).astype(np.uint8)
cv2.imwrite(OUT,out)
cv2.imwrite("_mask2.png",(mask*255).astype(np.uint8))
cv2.imwrite("_warp2.png",warp)

# diagnostics: coverage of base head region by the pasted mask
fxb,fyb,fwb,fhb=bf_box
cov=(mask[int(fyb):int(fyb+fhb),int(fxb):int(fxb+fwb)]>0.25).mean()
print("scale=%.3f  A=\n%s"%(scale,np.array2string(A,precision=2)))
print("base head-region coverage by pasted mask: %.1f%%"%(cov*100))
print("mask base bbox:",cv2.boundingRect((mask*255).astype(np.uint8)))
print("wrote",OUT,out.shape)
