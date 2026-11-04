"""Draws the five pictures of levels 11-15 (32 x 32, base-36 colour ids) and prints them as TypeScript.
Run: python qa/gen-art.py > qa/results/new-art.ts.txt   (and python qa/gen-art.py --preview for ASCII)
Colour ids: 0 Blush 1 Poppy 2 Sunbeam 3 Tangerine 4 Amber 5 Maroon 6 Lime 7 Forest 8 Cobalt 9 Aqua a Cream
"""
import math
import sys

N = 32


def canvas(bg):
    return [[bg] * N for _ in range(N)]


def rect(g, x0, y0, x1, y1, c):
    for y in range(max(0, y0), min(N, y1 + 1)):
        for x in range(max(0, x0), min(N, x1 + 1)):
            g[y][x] = c


def disc(g, cx, cy, r, c, ry=None):
    ry = r if ry is None else ry
    for y in range(N):
        for x in range(N):
            if ((x - cx) / r) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                g[y][x] = c


def poly(g, pts, c):
    for y in range(N):
        for x in range(N):
            inside = False
            j = len(pts) - 1
            for i in range(len(pts)):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > y + 0.5) != (yj > y + 0.5) and x + 0.5 < (xj - xi) * (y + 0.5 - yi) / (yj - yi) + xi:
                    inside = not inside
                j = i
            if inside:
                g[y][x] = c


def apple():
    g = canvas('9')
    rect(g, 0, 27, 31, 31, '7')  # grass
    disc(g, 16, 18, 10, '1', 9)
    disc(g, 11, 17, 4, '1', 6)
    rect(g, 15, 7, 17, 11, '5')  # stem
    poly(g, [(18, 9), (26, 4), (27, 9), (22, 12)], '7')  # leaf
    disc(g, 12, 14, 2, 'a')  # shine
    rect(g, 10, 26, 22, 26, '5')  # shadow row
    return g


def mushroom():
    g = canvas('8')
    rect(g, 0, 26, 31, 31, '7')
    rect(g, 12, 16, 19, 27, '4')  # stem
    for y in range(N):  # cap: the top half of an ellipse
        for x in range(N):
            if y <= 16 and ((x - 16) / 13) ** 2 + ((y - 16) / 11) ** 2 <= 1:
                g[y][x] = '1'
    for cx, cy, r in [(11, 10, 2), (20, 8, 2), (16, 13, 1), (23, 13, 1), (8, 13, 1)]:
        disc(g, cx, cy, r, 'a')
    return g


def sunflower():
    g = canvas('9')
    rect(g, 0, 28, 31, 31, '7')
    rect(g, 15, 15, 16, 28, '7')  # stem
    poly(g, [(16, 24), (6, 20), (9, 25)], '6')
    poly(g, [(16, 21), (26, 17), (23, 23)], '6')
    for k in range(10):
        a = k * math.tau / 10
        disc(g, 16 + math.cos(a) * 8, 12 + math.sin(a) * 8, 3, '2')
    disc(g, 16, 12, 5, '5')
    return g


def rocket():
    g = canvas('8')
    for x, y in [(3, 3), (27, 5), (6, 22), (28, 20), (22, 28), (10, 9)]:
        g[y][x] = 'a'
    poly(g, [(16, 2), (22, 9), (22, 22), (10, 22), (10, 9)], 'a')  # body
    poly(g, [(16, 2), (19, 6), (13, 6)], '1')  # nose
    disc(g, 16, 13, 3, '9')  # window
    poly(g, [(10, 16), (4, 25), (10, 22)], '1')  # fins
    poly(g, [(22, 16), (28, 25), (22, 22)], '1')
    poly(g, [(12, 23), (20, 23), (16, 31)], '3')  # flame
    poly(g, [(14, 23), (18, 23), (16, 28)], 'a')
    return g


def castle():
    g = canvas('9')
    rect(g, 0, 27, 31, 31, '6')
    rect(g, 7, 12, 24, 27, '4')  # keep
    rect(g, 3, 8, 9, 27, '4')  # towers
    rect(g, 22, 8, 28, 27, '4')
    for x in (3, 6, 22, 25):
        rect(g, x, 6, x + 2, 8, '4')
    for x in (10, 14, 18, 22):
        rect(g, x, 10, x + 1, 12, '4')
    poly(g, [(3, 6), (6, 1), (9, 6)], '1')  # roofs
    poly(g, [(22, 6), (25, 1), (28, 6)], '1')
    rect(g, 6, 0, 6, 1, '5')
    rect(g, 25, 0, 25, 1, '5')
    rect(g, 6, 1, 8, 2, '2')  # flag
    rect(g, 13, 19, 18, 27, '5')  # door
    disc(g, 15.5, 19, 3, '5')
    for x, y in [(5, 14), (24, 14)]:
        rect(g, x, y, x + 1, y + 2, '5')
    return g


ARTS = [('Apple', apple), ('Mushroom', mushroom), ('Sunflower', sunflower), ('Rocket', rocket), ('Castle', castle)]

if '--preview' in sys.argv:
    for name, fn in ARTS:
        print(name)
        for row in fn():
            print(''.join(row).replace('9', '.').replace('8', '.'))
else:
    for name, fn in ARTS:
        print('  { name: "%s", w: 32, h: 32, rows: [' % name)
        for row in fn():
            print("    '%s'," % ''.join(row))
        print('  ] },')
