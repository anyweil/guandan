#!/usr/bin/env python3
# 生成掼蛋 PWA 图标：绿色牌桌底 + 双扑克牌(红桃) + 金字"掼蛋"
# 用法：python3 icons/gen_icons.py   （在项目根目录执行）
import os, math
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "/System/Library/Fonts/PingFang.ttc"
SS = 4  # 超采样倍率，画大后缩小，边缘更顺滑


def font(px, idx=8):  # idx 8 ≈ PingFang Semibold/Heavy
    return ImageFont.truetype(FONT, px, index=idx)


def rounded(draw, box, r, fill):
    draw.rounded_rectangle(box, radius=r, fill=fill)


def heart(draw, cx, cy, s, fill):
    # 用两圆 + 多边形拼一个心形
    r = s * 0.28
    draw.ellipse([cx - s*0.5, cy - r, cx - s*0.5 + 2*r, cy - r + 2*r], fill=fill)
    draw.ellipse([cx + s*0.5 - 2*r, cy - r, cx + s*0.5, cy - r + 2*r], fill=fill)
    draw.polygon([(cx - s*0.62, cy + r*0.25), (cx + s*0.62, cy + r*0.25),
                  (cx, cy + s*0.82)], fill=fill)


def vgrad(size, top, bot):
    base = Image.new("RGB", (1, size), top)
    px = base.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return base.resize((size, size))


def draw_card(canvas, cx, cy, w, h, angle, with_mark=True):
    # 单张白牌（含红桃 + 角标 A），独立图层后旋转贴回
    pad = int(max(w, h) * 0.4)
    cw, ch = w + pad * 2, h + pad * 2
    layer = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # 阴影
    rounded(d, [pad + 6, pad + 10, pad + w + 6, pad + h + 10], int(w * 0.12), (0, 0, 0, 70))
    # 牌面
    rounded(d, [pad, pad, pad + w, pad + h], int(w * 0.12), (252, 250, 245, 255))
    rounded(d, [pad, pad, pad + w, pad + h], int(w * 0.12), None)
    d.rounded_rectangle([pad, pad, pad + w, pad + h], radius=int(w * 0.12),
                        outline=(0, 0, 0, 25), width=max(2, w // 90))
    if with_mark:
        red = (210, 59, 52, 255)
        # 中央大红桃
        heart(d, pad + w // 2, pad + int(h * 0.46), int(w * 0.5), red)
        # 左上角标 A + 小心
        f = font(int(w * 0.22))
        d.text((pad + int(w * 0.13), pad + int(h * 0.07)), "A", font=f, fill=red)
        heart(d, pad + int(w * 0.2), pad + int(h * 0.27), int(w * 0.16), red)
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=False, center=(cw // 2, ch // 2))
    canvas.alpha_composite(layer, (int(cx - cw // 2), int(cy - ch // 2)))


def make(px, maskable=False):
    S = px * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # 背景：径向感的绿色渐变（用竖向渐变近似 + 顶部高光）
    bg = vgrad(S, (26, 160, 106), (10, 77, 51)).convert("RGBA")
    if maskable:
        img.paste(bg, (0, 0))            # 满铺，留安全区
    else:
        # 圆角方底
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=int(S * 0.22), fill=255)
        img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img)
    # 顶部柔光
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([int(S*0.1), int(-S*0.45), int(S*0.9), int(S*0.45)],
                                 fill=(255, 255, 255, 26))
    img.alpha_composite(glow)

    inset = 0.0 if not maskable else 0.0
    cw, ch = int(S * 0.34), int(S * 0.47)
    cx, cy = S // 2, int(S * 0.40)
    draw_card(img, cx + int(S*0.075), cy - int(S*0.02), cw, ch, -14, with_mark=False)
    draw_card(img, cx - int(S*0.045), cy + int(S*0.02), cw, ch, 7, with_mark=True)

    # 金字"掼蛋"
    gold = (240, 205, 110, 255)
    f = font(int(S * 0.17))
    txt = "掼蛋"
    bb = d.textbbox((0, 0), txt, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx, ty = (S - tw) // 2 - bb[0], int(S * 0.74) - bb[1]
    d.text((tx + S//220, ty + S//220), txt, font=f, fill=(0, 0, 0, 110))  # 描影
    d.text((tx, ty), txt, font=f, fill=gold)

    return img.resize((px, px), Image.LANCZOS)


for px, name, mask in [(192, "icon-192.png", False), (512, "icon-512.png", False),
                       (512, "icon-maskable-512.png", True), (180, "apple-touch-icon.png", False),
                       (32, "favicon-32.png", False)]:
    make(px, mask).save(os.path.join(OUT, name))
    print("wrote", name)
print("done")
