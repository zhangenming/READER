#!/usr/bin/env python3
"""
Head-swap composite: paste the head from src (img2) onto the body of base (img1).

Alignment strategy: use the detected eye midpoint + inter-eye distance in each
image to compute a similarity (scale+translate, no rotation needed for frontal
faces) transform that maps the source head into the base frame. Then warp the
source with a feathered face/neck mask on top of the base, with per-channel
color matching to blend skin tones.
"""
import cv2, numpy as np, sys

BASE="img1.jpg"; SRC="img2.jpg"
OUT="result.png"

base=cv2.imread(BASE); src=cv2.imread(SRC)
H,W=base.shape[:2]
h,w=src.shape[:2]

# ---- detected geometry (from haar cascade analysis) ----
# base face box + eyes
bL=(497,573); bR=(674,572)                 # base eye absolute coords
# source face box + eyes
sL=(367,552); sR=(573,552)                 # source eye absolute coords

# ---- similarity transform: src -> base ----
bm=np.array([(bL[0]+bR[0])/2,(bL[1]+bR[1])/2],dtype=np.float64)  # base eye midpoint
sm=np.array([(sL[0]+sR[0])/2,(sL[1]+sR[1])/2],dtype=np.float64)  # src eye midpoint
dist_b=float(np.hypot(bR[0]-bL[0],bR[1]-bL[1]))
dist_s=float(np.hypot(sR[0]-sL[0],sR[1]-sL[1]))
s_scale=dist_b/dist_s
# default: no rotation (both faces upright/frontal). Allow optional tilt via eyes.
ang_b=np.degrees(np.arctan2(bR[1]-bL[1],bR[0]-bL[0]))
ang_s=np.degrees(np.arctan2(sR[1]-sL[1],sR[0]-sL[0]))
rot=ang_b-ang_s
print(f"scale={s_scale:.4f} rot_deg={rot:.2f}")
# 2x3 affine matrix mapping src coords -> base coords
c=np.cos(np.radians(rot)); s_=np.sin(np.radians(rot))
A_lin=np.array([[s_scale*c,-s_scale*s_],[s_scale*s_,s_scale*c]],dtype=np.float64)
t=bm-A_lin.dot(sm)
A=np.hstack([A_lin,t.reshape(2,1)])

# ---- warped source into base frame ----
warp=cv2.warpAffine(src,A,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)

# ---- source mask (feathered head+neck ellipse) defined in SOURCE coords ----
fx,fy,fw,fh=268,415,503,503
cx=sm[0]; cy=sm[1]                         # use eye midpoint as head anchor
# centre the mask a bit lower (head centre is usually below eye line)
cy=cy+0.25*fh
ax=fw*0.66                                 # horizontal semi-axis
ay=fh*0.78                                 # vertical semi-axis (captures hair top + neck)
mask_src=np.zeros((h,w),np.uint8)
cv2.ellipse(mask_src,(int(cx),int(cy)),(int(ax),int(ay)),0,0,360,255,-1)
mask_src=cv2.GaussianBlur(mask_src,(0,0),sigmaX=max(ax,ay)*0.18)  # feather
mask_src=mask_src.astype(np.float32)/255.0
mask=cv2.warpAffine(mask_src,A,(W,H),flags=cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
mask=np.clip(mask,0,1)[:,:,None]

# ---- color match warped source patch to base region it covers ----
def stats(im,m):
    m3=np.repeat(m,3,axis=2)
    sel=im[m3[...,0]>0.05]
    if sel.size==0: return None
    return sel.mean(axis=0), sel.std(axis=0)+1e-6
bs=stats(base.astype(np.float32),mask)
ss=stats(warp.astype(np.float32),mask)
if bs and ss:
    mb,sb=bs; ms,ssd=ss
    warp_f=warp.astype(np.float32)
    norm=(warp_f-ms)/ssd*sb+mb
    # only apply the correction, keep alpha weighting with the residual to avoid banding
    warp=norm.clip(0,255).astype(np.uint8)

# ---- composite ----
out=base.astype(np.float32)*(1-mask)+warp.astype(np.float32)*mask
out=out.clip(0,255).astype(np.uint8)
cv2.imwrite(OUT,out)
print("wrote",OUT,"size",out.shape)

# also save aligned warped patch + mask for inspection
cv2.imwrite("_warp.png",warp)
cv2.imwrite("_mask.png",(cv2.warpAffine(mask_src,A,(W,H),borderMode=cv2.BORDER_REPLICATE)*255).astype(np.uint8))
