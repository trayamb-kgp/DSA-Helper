"""Generate the placeholder DSA Helper icons (binary-tree glyph) into public/icons.

Run: python tools/gen-placeholder-icons.py
These are stand-ins; replace public/icons/*.png with the real artwork when ready.

Pure stdlib: no Pillow. Renders at 4x and box-downsamples for antialiasing.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "icons"
)
SS = 4  # supersample factor

# palette
BG_TOP = (79, 70, 229)     # indigo-600  #4f46e5
BG_BOT = (124, 58, 237)    # violet-600  #7c3aed
FG = (255, 255, 255)

# glyph geometry in unit space (0..1)
CORNER_R = 0.22
ROOT = (0.50, 0.255)
LEFT = (0.235, 0.735)
RIGHT = (0.765, 0.735)
NODE_R = 0.135
EDGE_W = 0.075


def rounded_rect_inside(x, y, r):
    """x, y in 0..1; r = corner radius in unit space."""
    cx = min(max(x, r), 1.0 - r)
    cy = min(max(y, r), 1.0 - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def dist_point_seg(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    denom = vx * vx + vy * vy
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / denom))
    qx, qy = ax + t * vx, ay + t * vy
    return math.hypot(px - qx, py - qy)


def glyph_inside(x, y):
    for cx, cy in (ROOT, LEFT, RIGHT):
        if math.hypot(x - cx, y - cy) <= NODE_R:
            return True
    for child in (LEFT, RIGHT):
        if dist_point_seg(x, y, ROOT[0], ROOT[1], child[0], child[1]) <= EDGE_W / 2:
            return True
    return False


def render(size):
    hi = size * SS
    # accumulate RGBA at high res, then box-downsample
    hi_rows = []
    for j in range(hi):
        y = (j + 0.5) / hi
        row = []
        for i in range(hi):
            x = (i + 0.5) / hi
            if not rounded_rect_inside(x, y, CORNER_R):
                row.append((0, 0, 0, 0))
                continue
            if glyph_inside(x, y):
                row.append((FG[0], FG[1], FG[2], 255))
            else:
                r = round(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * y)
                g = round(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * y)
                b = round(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * y)
                row.append((r, g, b, 255))
        hi_rows.append(row)

    out = []
    n = SS * SS
    for j in range(size):
        row = bytearray()
        for i in range(size):
            ar = ag = ab = aa = 0
            for dj in range(SS):
                src = hi_rows[j * SS + dj]
                for di in range(SS):
                    r, g, b, a = src[i * SS + di]
                    # premultiply so transparent pixels don't darken edges
                    ar += r * a
                    ag += g * a
                    ab += b * a
                    aa += a
            if aa == 0:
                row += bytes((0, 0, 0, 0))
            else:
                row += bytes((
                    min(255, round(ar / aa)),
                    min(255, round(ag / aa)),
                    min(255, round(ab / aa)),
                    min(255, round(aa / n)),
                ))
        out.append(bytes(row))
    return out


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + r for r in rows)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (16, 32, 48, 128):
        rows = render(size)
        path = os.path.join(OUT_DIR, "icon%d.png" % size)
        write_png(path, rows, size)
        print("wrote", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
