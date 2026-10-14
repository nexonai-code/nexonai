from PIL import Image, ImageDraw
S="../../shots/"
def rounded(im, r, border=None, bw=2):
    im = im.convert("RGBA"); w, h = im.size
    mask = Image.new("L", (w, h), 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0)); out.paste(im, (0, 0), mask)
    if border:
        ImageDraw.Draw(out).rounded_rectangle([0, 0, w - 1, h - 1], r, outline=border, width=bw)
    return out
def crop_dash(path, y0=0, out=None, width=1400):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    x0 = 488                      # without the sidebar (which carries the demo connection light)
    cw = W - x0; ch = int(cw * 10 / 16)
    box = (x0, y0, W, min(H, y0 + ch))
    im = im.crop(box)
    if im.size[1] < ch:
        pad = Image.new("RGB", (cw, ch), (236, 241, 241)); pad.paste(im, (0, 0)); im = pad
    im = im.resize((width, int(width * 10 / 16)), Image.LANCZOS)
    rounded(im, 22, (200, 212, 209, 255), 3).save(out)
def phone(path, out, h=1100):
    im = Image.open(path).convert("RGB"); w0, h0 = im.size
    inner_h = h - 24; inner_w = int(inner_h * w0 / h0)
    im = im.resize((inner_w, inner_h), Image.LANCZOS)
    pw, ph = inner_w + 24, h
    frame = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([0, 0, pw - 1, ph - 1], 60, fill=(24, 32, 34, 255))
    scr = rounded(im, 48); frame.paste(scr, (12, 12), scr)
    frame.save(out)
for L, pre, names in (("RO", "officer_", ["1_prezentare", "2_cazuri", "3_cod", "4_caz"]), ("EN", "officer_EN_", ["1_overview", "2_cases", "3_code", "4_case"])):
    crop_dash(S + pre + names[0] + ".png", 0, f"assets/dash_overview_{L}.png")
    crop_dash(S + pre + names[2] + ".png", 0, f"assets/dash_code_{L}.png")
    crop_dash(S + pre + names[3] + ".png", 0, f"assets/dash_case_{L}.png")
    for i, n in enumerate(["1_scan_qr", "2_pending", "3_status", "4_messages"], 1):
        phone(S + f"android_{L}_{n}.png", f"assets/phone_{L}_{i}.png")
# white logo for dark slides
# logo_white.png is the NexonAI Consulting logo (white variant), supplied directly - not derived here
# QR on a white rounded card
qr = Image.open("qr.png").convert("RGB"); card = Image.new("RGB", (qr.size[0] + 60, qr.size[1] + 60), "white"); card.paste(qr, (30, 30)); rounded(card, 36).save("assets/qr_card.png")
print("ok")
