"""生成 TipJar 项目 logo —— 480x480 PNG，用于 Arc Microgrants 提交表单。"""

from PIL import Image, ImageDraw, ImageFont
import os

S = 480
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

GOLD = (212, 175, 55)
GOLD_B = (234, 179, 8)
DARK = (9, 9, 11)
CARD = (20, 20, 24)

# ---- 圆角方形底（深色 + 金色描边）----
R = 96
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=R, fill=DARK, outline=GOLD, width=5)

# ---- 内层柔和金色光晕（用多层同心圆模拟渐变）----
cx, cy = S // 2, S // 2 - 26
for i in range(120, 0, -1):
    a = int(26 * (1 - i / 120) ** 2)
    r = i * 1.55
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(GOLD[0], GOLD[1], GOLD[2], a))

# ---- 对话气泡（TipJar 的品牌符号：帖子 / 留言）----
bw, bh = 200, 150
bx0, by0 = cx - bw // 2, cy - bh // 2 - 10
bx1, by1 = bx0 + bw, by0 + bh
d.rounded_rectangle([bx0, by0, bx1, by1], radius=44, fill=GOLD)
# 气泡的小尾巴
d.polygon([(cx - 34, by1 - 4), (cx + 10, by1 - 4), (cx - 30, by1 + 46)], fill=GOLD)
# 气泡里的三条"文字"线（深色镂空）
for i, w in enumerate([118, 92, 64]):
    yy = by0 + 40 + i * 30
    d.rounded_rectangle([cx - 59, yy, cx - 59 + w, yy + 15], radius=7, fill=DARK)

# ---- 金币（打赏的符号），叠在气泡右下角 ----
ccx, ccy, cr = cx + 76, cy + 66, 46
d.ellipse([ccx - cr, ccy - cr, ccx + cr, ccy + cr], fill=DARK, outline=GOLD, width=5)
d.ellipse([ccx - cr + 9, ccy - cr + 9, ccx + cr - 9, ccy + cr - 9], fill=GOLD)
# 币面上的 "$"
try:
    fcoin = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 52)
except Exception:
    fcoin = ImageFont.load_default()
tb = d.textbbox((0, 0), '$', font=fcoin)
d.text((ccx - (tb[2] - tb[0]) / 2 - tb[0], ccy - (tb[3] - tb[1]) / 2 - tb[1]),
       '$', font=fcoin, fill=DARK)

# ---- 文字 "TipJar" ----
try:
    f1 = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 62)
except Exception:
    try:
        f1 = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 62)
    except Exception:
        f1 = ImageFont.load_default()
txt = 'TipJar'
tb = d.textbbox((0, 0), txt, font=f1)
tw = tb[2] - tb[0]
d.text(((S - tw) / 2 - tb[0], 330), txt, font=f1, fill=(250, 250, 249))

# ---- 小字 "ARC MAINNET" ----
try:
    f2 = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 22)
except Exception:
    f2 = ImageFont.load_default()
sub = 'ARC MAINNET'
tb2 = d.textbbox((0, 0), sub, font=f2)
sw = tb2[2] - tb2[0]
d.text(((S - sw) / 2 - tb2[0], 406), sub, font=f2, fill=GOLD)

out = os.path.join(os.environ.get('TMPDIR', '.'), 'tipjar-logo.png')
img.save(out, 'PNG', optimize=True)
print('saved:', out, os.path.getsize(out), 'bytes')
print('size:', img.size)
