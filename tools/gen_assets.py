"""ComfyUI でこはるのゲーム用画像を生成するスクリプト。

使い方:
    python tools/gen_assets.py               # 全アセットを生成
    python tools/gen_assets.py normal happy  # 指定したものだけ生成
    python tools/gen_assets.py --list        # 一覧

生成設定は ComfyUI の履歴にあるこはる生成と同じものを使う:
  Anima-Base-v1.0 + Koharu-Koharu-epoch100 (0.8) + anima-style-epoch35-lr5e5 (0.8)
  euler / simple / 24 steps / cfg 4.5
立ち絵は birefnet で背景を抜いて透過 PNG にする。
"""
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops

COMFY = "http://127.0.0.1:8189"
ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
RAW = ROOT / "tools" / "_raw"

CHAR = (
    "koharu_rikka, anima_style, masterpiece, best quality, 1girl, solo, Koharu Rikka, "
    "silver gray hair, medium hair with bangs, double bun, two small hair buns on top of head, "
    "pink heart hairpin, pink eyes, white collared short sleeve shirt, navy blue denim overalls, "
)
SPRITE = (
    "upper body portrait, cowboy shot from chest up, looking at viewer, facing viewer, "
    "arms down at sides, hands out of frame, simple plain white background, "
    "visual novel character sprite, clean lineart, soft cel shading, "
)
NEG = (
    "worst quality, low quality, blurry, photorealistic, 3d render, bad anatomy, extra fingers, "
    "missing fingers, fused fingers, deformed hands, extra limbs, duplicate girl, multiple girls, "
    "wrong hair color, long hair, ribbon bow tie, washed out colors, overexposure, "
    "real brand logos, text, letters, gibberish text, watermark, signature"
)
NEG_SPRITE = NEG + ", detailed background, scenery, hands, holding, props, cropped head"

# name: (prompt, width, height, seed, remove_bg)
SPECS = {
    # --- 立ち絵（表情差分） ---
    "normal": (CHAR + SPRITE + "gentle smile, closed mouth, calm friendly expression", 896, 1152, 71001, True),
    "happy": (CHAR + SPRITE + "very happy, big smile, open mouth, sparkling eyes, light blush", 896, 1152, 71002, True),
    "surprised": (CHAR + SPRITE + "surprised, wide open eyes, small open mouth, raised eyebrows", 896, 1152, 71003, True),
    "worried": (CHAR + SPRITE + "worried, troubled eyebrows, small frown, slightly downcast eyes, sweat drop", 896, 1152, 71004, True),
    "thinking": (CHAR + SPRITE + "thinking, pondering, eyes looking up and to the side, closed mouth, head tilt", 896, 1152, 71005, True),
    "wink": (CHAR + SPRITE + "wink, one eye closed, cheerful smile, open mouth", 896, 1152, 71006, True),
    # --- イベント CG ---
    "cg_title": (
        CHAR + "detailed anime visual novel game key visual, she stands on a grassy hill in the foreground, "
        "smiling at viewer, wind blowing hair, behind her a small peaceful Japanese countryside town with "
        "red and blue roofs, winding roads, green trees, distant mountains, blue sky with fluffy clouds, morning sunlight, "
        "wide shot, upper body",
        1344, 768, 72001, False),
    "cg_festival": (
        CHAR + "detailed anime visual novel game event CG, summer night festival in a small town plaza, "
        "rows of glowing red paper lanterns, food stalls, fireworks in the night sky, she smiles happily at viewer, "
        "warm light, upper body",
        1344, 768, 72002, False),
    "cg_growth": (
        CHAR + "detailed anime visual novel game event CG, bright sunny day in a lively small Japanese town street, "
        "shops with awnings, flower planters, townspeople walking far in the background, colorful confetti and sparkles, "
        "she is overjoyed, big smile, upper body",
        1344, 768, 72003, False),
    "cg_evening": (
        CHAR + "detailed anime visual novel game event CG, sunset over a small Japanese town seen from a riverside, "
        "orange sky, warm windows lighting up, gentle smile, hair swaying, peaceful nostalgic atmosphere, upper body",
        1344, 768, 72004, False),
}


def workflow(prompt, w, h, seed, prefix, remove_bg):
    wf = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "Anima-Base-v1.0.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_06b_base.safetensors", "type": "qwen_image"}},
        "3": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["1", 0], "lora_name": "Koharu-Koharu-epoch100.safetensors", "strength_model": 0.8}},
        "4": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["3", 0], "lora_name": "anima-style-epoch35-lr5e5.safetensors", "strength_model": 0.8}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG_SPRITE if remove_bg else NEG}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                                                    "seed": seed, "steps": 24, "cfg": 4.5, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAELoader", "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["9", 0]}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": f"town_game/{prefix}"}},
    }
    if remove_bg:
        wf["12"] = {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}}
        wf["13"] = {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["12", 0], "image": ["10", 0]}}
        wf["14"] = {"class_type": "MaskToImage", "inputs": {"mask": ["13", 0]}}
        wf["15"] = {"class_type": "SaveImage", "inputs": {"images": ["14", 0], "filename_prefix": f"town_game/{prefix}_mask"}}
    return wf


def http_json(url, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"} if body else {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def fetch_image(info):
    q = urllib.parse.urlencode({"filename": info["filename"], "subfolder": info["subfolder"], "type": info["type"]})
    with urllib.request.urlopen(f"{COMFY}/view?{q}", timeout=60) as r:
        return Image.open(BytesIO(r.read())).copy()


def run(name):
    prompt, w, h, seed, remove_bg = SPECS[name]
    client = str(uuid.uuid4())
    pid = http_json(f"{COMFY}/prompt", {"prompt": workflow(prompt, w, h, seed, name, remove_bg), "client_id": client})["prompt_id"]
    print(f"[{name}] queued {pid}", flush=True)
    t0 = time.time()
    while True:
        time.sleep(2)
        hist = http_json(f"{COMFY}/history/{pid}")
        if pid in hist:
            entry = hist[pid]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"{name}: ComfyUI error {json.dumps(status)[:800]}")
            if status.get("completed") or entry.get("outputs"):
                break
        if time.time() - t0 > 900:
            raise TimeoutError(name)
    outs = entry["outputs"]
    img = fetch_image(outs["11"]["images"][0]).convert("RGB")
    RAW.mkdir(parents=True, exist_ok=True)
    img.save(RAW / f"{name}.png")
    if remove_bg:
        mask = fetch_image(outs["15"]["images"][0]).convert("L")
        mask.save(RAW / f"{name}_mask.png")
        rgba = img.convert("RGBA")
        rgba.putalpha(mask)
        bbox = mask.point(lambda v: 255 if v > 16 else 0).getbbox()
        if bbox:
            pad = 8
            l, t, r, b = bbox
            rgba = rgba.crop((max(0, l - pad), max(0, t - pad), min(w, r + pad), min(h, b)))
        out = ASSETS / "koharu" / f"{name}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        rgba.save(out, optimize=True)
    else:
        out = ASSETS / "cg" / f"{name}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, quality=90)
    print(f"[{name}] done in {time.time() - t0:.0f}s -> {out.relative_to(ROOT)}", flush=True)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--list"]:
        print("\n".join(SPECS))
        sys.exit(0)
    names = args or list(SPECS)
    for n in names:
        if n not in SPECS:
            sys.exit(f"unknown asset: {n}")
    for n in names:
        run(n)
