#!/usr/bin/env python3
# 生成掼蛋 PWA 图标。
# 设计要点：① 平滑爱心(参数方程) ② 双牌微展、构图居中平衡
#          ③ 内容收进中心安全区——maskable 落在 80% 安全圆内，主屏圆角/圆形遮罩都不裁切。
# 用法：python3 icons/gen_icons.py （项目根目录执行）
import os, math
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "/System/Library/Fonts/PingFang.ttc"
SS = 4  # 超采样


def font(px, idx=8):
    return ImageFont.truetype(FONT, px, index=idx)


def vgrad(size, top, bot):
    g = Image.new("RGB", (1, size), 0)
    px = g.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return g.resize((size, size))


def heart_pts(cx, cy, w, h):
    # 经典平滑爱心参数方程，归一化到给定包围盒
    pts = []
    for i in range(241):
        t = i / 240 * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
        pts.append((x, y))
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    sx = w / (maxx - minx); sy = h / (maxy - miny)
    out = []
    for x, y in pts:
        nx = cx + (x - (minx + maxx) / 2) * sx
        ny = cy - (y - (miny + maxy) / 2) * sy   # y 翻转：心尖朝下
        out.append((nx, ny))
    return out


def draw_card(canvas, cx, cy, w, h, angle, mark=False):
    # 单张白牌（圆角 + 细描边 + 轻微竖向渐变），可选红桃 A 标记；独立图层旋转后贴回
    pad = int(max(w, h) * 0.45)
    cw, ch = w + 2 * pad, h + 2 * pad
    layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = int(w * 0.13)
    # 阴影
    d.rounded_rectangle([pad + w*0.04, pad + h*0.05, pad + w + w*0.04, pad + h + h*0.05],
                        radius=r, fill=(0, 0, 0, 60))
    # 牌面渐变
    face = vgrad(max(w, h), (255, 255, 255), (236, 240, 246)).convert("RGBA").resize((w, h))
    fmask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(fmask).rounded_rectangle([0, 0, w-1, h-1], radius=r, fill=255)
    layer.paste(face, (pad, pad), fmask)
    d.rounded_rectangle([pad, pad, pad + w - 1, pad + h - 1], radius=r,
                        outline=(205, 210, 220, 255), width=max(2, w // 80))
    if mark:
        red = (210, 59, 52, 255)
        d.polygon(heart_pts(pad + w*0.5, pad + h*0.5, w*0.46, h*0.34), fill=red)
        f = font(int(w * 0.26))
        d.text((pad + w*0.14, pad + h*0.08), "A", font=f, fill=red)
        d.polygon(heart_pts(pad + w*0.205, pad + h*0.30, w*0.16, h*0.12), fill=red)
    layer = layer.rotate(angle, resample=Image.BICUBIC, center=(cw//2, ch//2))
    canvas.alpha_composite(layer, (int(cx - cw//2), int(cy - ch//2)))


def emblem(canvas, S, cy, fit):
    # 在以 (S/2, cy) 为中心、高度 = fit*S 的范围内绘制「双牌 + 掼蛋」整组徽标
    EH = fit * S
    cw, ch = int(EH * 0.42), int(EH * 0.58)        # 单牌尺寸（牌组占徽标上 ~62%）
    cards_cy = cy - int(EH * 0.16)
    draw_card(canvas, S//2 + int(EH*0.17), cards_cy - int(EH*0.02), cw, ch, -13, mark=False)
    draw_card(canvas, S//2 - int(EH*0.11), cards_cy + int(EH*0.02), cw, ch, 7, mark=True)
    # 金字"掼蛋"
    d = ImageDraw.Draw(canvas)
    f = font(int(EH * 0.26))
    bb = d.textbbox((0, 0), "掼蛋", font=f)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    tx = (S - tw)//2 - bb[0]
    ty = cy + int(EH*0.30) - bb[1]
    d.text((tx + S//260, ty + S//260), "掼蛋", font=f, fill=(0, 0, 0, 120))
    d.text((tx, ty), "掼蛋", font=f, fill=(240, 205, 110, 255))


def make(px, maskable=False):
    S = px * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = vgrad(S, (28, 168, 112), (9, 74, 50)).convert("RGBA")
    if maskable:
        img.paste(bg, (0, 0))                       # 满铺，遮罩自行裁角
    else:
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S-1, S-1], radius=int(S*0.22), fill=255)
        img.paste(bg, (0, 0), m)
    # 顶部柔光
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([int(S*0.08), int(-S*0.5), int(S*0.92), int(S*0.42)],
                                 fill=(255, 255, 255, 24))
    img.alpha_composite(glow)
    # 内容安全区：maskable 收进 80% 安全圆 → 徽标高 0.60；普通图标可略大 0.72
    emblem(img, S, S//2, fit=0.60 if maskable else 0.72)
    return img.resize((px, px), Image.LANCZOS)


def circle_preview(src, px):  # 模拟主流圆形遮罩，自检内容是否被裁
    im = make(px, maskable=True)
    m = Image.new("L", (px, px), 0)
    ImageDraw.Draw(m).ellipse([int(px*0.1), int(px*0.1), int(px*0.9), int(px*0.9)], fill=255)
    out = Image.new("RGBA", (px, px), (20, 20, 20, 255))
    out.paste(im, (0, 0), m)
    out.save(os.path.join(OUT, "_preview-circle.png"))


for px, name, mask in [(192, "icon-192.png", False), (512, "icon-512.png", False),
                       (512, "icon-maskable-512.png", True), (180, "apple-touch-icon.png", False),
                       (32, "favicon-32.png", False)]:
    make(px, mask).save(os.path.join(OUT, name))
    print("wrote", name)
circle_preview(None, 256)
print("wrote _preview-circle.png (自检用，不发布)")
print("done")
