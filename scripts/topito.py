# Topito's pixel art. Writes src/renderer/src/lib/topito/frames.ts; --gifs <folder> renders GIFs (needs Pillow).
# Legend: . empty, W ink (body), S shade (helmet, props), D dim, K contrast (eyes, paper), A accent.
import math
import os

CELL = 12
CW, CH = 24, 20
GROUND = 14
MX = 6
PEEK_Y = 6
OUT_Y = 3
STAND_Y = 2

THEMES = {
    'dark': {'bg': (28, 27, 27), 'W': (236, 233, 232), 'S': (142, 145, 146), 'D': (62, 61, 64), 'K': (14, 13, 13), 'A': (91, 140, 255)},
    'light': {'bg': (243, 240, 239), 'W': (28, 27, 27), 'S': (107, 111, 112), 'D': (206, 202, 200), 'K': (255, 255, 255), 'A': (47, 109, 246)},
}


def check(name, rows):
    for i, r in enumerate(rows):
        assert len(r) == len(rows[0]), f'{name}: row {i} is {len(r)} wide: {r!r}'
    return rows


def edit(rows, cells, ch):
    g = [list(r) for r in rows]
    for r, c in cells:
        if 0 <= r < len(g) and 0 <= c < len(g[0]):
            g[r][c] = ch
    return [''.join(r) for r in g]


def canvas():
    return [['.'] * CW for _ in range(CH)]


def stamp(cv, rows, x, y, below=CH, recolor=None):
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            yy, xx = y + r, x + c
            if ch != '.' and 0 <= yy < min(CH, below) and 0 <= xx < CW:
                cv[yy][xx] = recolor.get(ch, ch) if recolor else ch
    return cv


def dots(cv, cells, ch):
    for x, y in cells:
        if 0 <= y < CH and 0 <= x < CW:
            cv[y][x] = ch
    return cv


PEEK = check('peek', [
    "....SSSS....",
    "...SSASSS...",
    "..SSSSSSSS..",
    "..WWWWWWWW..",
    ".WWKWWWWKWW.",
    ".WWWWSSWWWW.",
    ".WWWWWWWWWW.",
    "WW.WWWWWW.WW",
])
BODY = check('body', [
    "....SSSS....",
    "...SSASSS...",
    "..SSSSSSSS..",
    "..WWWWWWWW..",
    ".WWKWWWWKWW.",
    ".WWWWSSWWWW.",
    ".WWWWWWWWWW.",
    "WWWWWWWWWWWW",
    "WWWWWWWWWWWW",
    ".WWWWWWWWWW.",
    ".WWWWWWWWWW.",
    "..WW....WW..",
])
BODY_NO_ARMS = edit(BODY, [(7, 0), (7, 11)], '.')


def face(rows, eyes='open', mouth=None, lamp='on'):
    rows = edit(rows, [(4, 3), (4, 8)], 'W')
    if eyes == 'open':
        rows = edit(rows, [(4, 3), (4, 8)], 'K')
    elif eyes in ('left', 'right'):
        d = -1 if eyes == 'left' else 1
        rows = edit(rows, [(4, 3 + d), (4, 8 + d)], 'K')
    elif eyes == 'up':
        rows = edit(rows, [(3, 4), (3, 9)], 'K')
    elif eyes == 'down':
        rows = edit(rows, [(5, 3), (5, 8)], 'K')
    elif eyes == 'closed':
        rows = edit(rows, [(4, 2), (4, 3), (4, 8), (4, 9)], 'S')
    elif eyes == 'happy':
        rows = edit(rows, [(4, 2), (3, 3), (4, 4), (4, 7), (3, 8), (4, 9)], 'K')
    elif eyes == 'wide':
        rows = edit(rows, [(3, 3), (4, 3), (3, 8), (4, 8)], 'K')
    elif eyes == 'worried':
        rows = edit(rows, [(4, 3), (4, 8)], 'K')
        rows = edit(rows, [(3, 2), (3, 9)], 'S')
    if mouth == 'smile':
        rows = edit(rows, [(6, 4), (7, 5), (7, 6), (6, 7)], 'K')
    elif mouth == 'open':
        rows = edit(rows, [(6, 5), (6, 6), (7, 5), (7, 6)], 'K')
    elif mouth == 'talk':
        rows = edit(rows, [(6, 5), (6, 6)], 'K')
    elif mouth == 'frown':
        rows = edit(rows, [(7, 4), (6, 5), (6, 6), (7, 7)], 'K')
    elif mouth == 'sip':
        rows = edit(rows, [(6, 5)], 'K')
    rows = edit(rows, [(1, 5)], {'on': 'A', 'off': 'D', 'dim': 'S'}[lamp])
    return rows


def ground(cv, hole=True, piles=True):
    for x in range(CW):
        dots(cv, [(x, GROUND)], 'S')
        for y in range(GROUND + 1, CH):
            dots(cv, [(x, y)], 'D')
    dots(cv, [(2, 16), (8, 18), (13, 16), (18, 19), (21, 17), (11, 19), (4, 19)], 'S')
    if hole:
        dots(cv, [(x, GROUND) for x in range(MX + 1, MX + 11)], 'K')
    if piles:
        dots(cv, [(MX - 2, GROUND - 1), (MX - 1, GROUND - 1), (MX - 1, GROUND - 2), (MX + 12, GROUND - 1), (MX + 13, GROUND - 1), (MX + 12, GROUND - 2)], 'S')
    return cv


def scene(sprite, y, hole=True, piles=True):
    cv = canvas()
    ground(cv, hole, piles)
    if sprite is not None:
        stamp(cv, sprite, MX, y, below=GROUND)
    return cv


def dirt(cv, spread):
    ch = 'S' if spread == 1 else 'D'
    return dots(cv, [(MX + 1 - spread, GROUND - 2 - spread), (MX + 10 + spread, GROUND - 2 - spread), (MX + 5, GROUND - 3 - spread)], ch)


def arm(cv, y, pose, side='right'):
    L = side == 'left'
    ax = MX - 1 if L else MX + 12
    out = -1 if L else 1
    cells = {
        'up': [(ax, y + 5), (ax, y + 6)],
        'wave1': [(ax, y + 6), (ax + out, y + 5), (ax + out, y + 4)],
        'wave2': [(ax, y + 6), (ax, y + 5), (ax, y + 4)],
        'high': [(ax, y + 5), (ax, y + 4), (ax, y + 3)],
    }[pose]
    return dots(cv, cells, 'W')


def glyph(cv, name, x, y, ch):
    G = {
        '!': [".W.", ".W.", ".W.", "...", ".W."],
        '?': ["WWW", "..W", ".WW", "...", ".W."],
        'z': ["WWWW", "..W.", ".W..", "WWWW"],
        'heart': [".W.W.", "WWWWW", ".WWW.", "..W.."],
        'spark': [".W.", "WWW", ".W."],
    }
    return stamp(cv, G[name], x, y, recolor={'W': ch})


def rise(frames_ms=(160, 130, 110, 110)):
    """Pops out of the hole: a puff of dirt, the helmet, then the head."""
    a = scene(None, 0)
    dirt(a, 1)
    b = scene(PEEK, 11)
    dirt(b, 2)
    return [(a, frames_ms[0]), (b, frames_ms[1]), (scene(PEEK, 9), frames_ms[2]), (scene(PEEK, 7), frames_ms[3])]


def sink():
    """Ducks back into the hole and the dust settles."""
    a = scene(PEEK, 8)
    b = scene(PEEK, 11)
    c = scene(None, 0)
    dirt(c, 1)
    d = scene(None, 0)
    dirt(d, 2)
    return [(a, 90), (b, 90), (c, 140), (d, 160)]


def cavando():
    frames = []
    for t, x in enumerate([5, 7, 9, 11, 13, 15, 17, 19, 17, 15, 13, 11, 9, 7]):
        cv = canvas()
        ground(cv, hole=False, piles=False)
        dots(cv, [(x - 1, GROUND - 1), (x, GROUND - 1), (x + 1, GROUND - 1), (x, GROUND - 2)], 'S')
        dots(cv, [(x, GROUND + 3)], 'A')
        if t % 2 == 0:
            dots(cv, [(x - 2, GROUND - 3), (x + 2, GROUND - 4)], 'S')
        else:
            dots(cv, [(x - 3, GROUND - 5), (x + 3, GROUND - 3)], 'D')
        frames.append((cv, 140))
    return frames


def asoma():
    frames = rise()
    up = face(PEEK)
    frames += [(scene(up, PEEK_Y), 360), (scene(face(PEEK, 'left'), PEEK_Y), 320), (scene(face(PEEK, 'right'), PEEK_Y), 320)]
    frames += [(scene(face(PEEK, lamp='off'), PEEK_Y), 160), (scene(up, PEEK_Y), 160), (scene(face(PEEK, lamp='off'), PEEK_Y), 160)]
    for i in range(4):
        cv = scene(edit(up, [(7, 10), (7, 11)], '.') if i % 2 == 0 else up, PEEK_Y)
        if i % 2 == 0:
            dots(cv, [(MX + 12, 13), (MX + 12, 12), (MX + 13, 11)], 'W')
        glyph(cv, '!', 20, 4, 'A')
        frames.append((cv, 200 if i < 3 else 320))
    cv = scene(face(PEEK, 'closed'), PEEK_Y)
    glyph(cv, '!', 20, 4, 'A')
    frames.append((cv, 140))
    cv = scene(up, PEEK_Y)
    glyph(cv, '!', 20, 4, 'A')
    frames.append((cv, 500))
    return frames


def listo():
    frames = rise()[1:]

    def jump(y, arms=True, eyes='happy', sparkle=0):
        cv = scene(face(BODY_NO_ARMS if arms else BODY, eyes, 'smile'), y)
        if arms:
            arm(cv, y, 'up', 'left')
            arm(cv, y, 'up', 'right')
        if sparkle == 1:
            glyph(cv, 'spark', 2, 5, 'A')
            glyph(cv, 'spark', 20, 2, 'A')
        elif sparkle == 2:
            dots(cv, [(3, 2), (21, 8), (19, 0)], 'S')
        return cv

    frames += [(jump(STAND_Y), 90), (jump(1, sparkle=1), 260), (jump(STAND_Y, sparkle=2), 220), (jump(STAND_Y, sparkle=1), 260),
               (jump(STAND_Y, arms=False, sparkle=2), 360), (jump(STAND_Y, arms=False, eyes='open'), 300),
               (scene(face(PEEK, mouth='smile'), PEEK_Y), 140)]
    frames += sink() + [(scene(None, 0), 500)]
    return frames


def durmiendo():
    sleepy = face(PEEK, 'closed', lamp='off')
    frames = []
    for t in range(16):
        cv = scene(sleepy, 7 if t % 4 in (2, 3) else 6)
        for k, (zx, zy) in enumerate([(16, 9), (18, 5), (20, 1)]):
            phase = (t - k * 2) % 8
            if phase < 5:
                glyph(cv, 'z', zx, zy, 'S' if phase < 3 else 'D')
        frames.append((cv, 260))
    return frames


def pensando():
    frames = rise()[1:]
    for t in range(12):
        eyes = 'up' if t % 6 < 5 else 'closed'
        cv = scene(face(BODY_NO_ARMS, eyes, lamp='on' if t % 4 else 'dim'), OUT_Y)
        dots(cv, [(MX + 8, OUT_Y + 8), (MX + 9, OUT_Y + 7)], 'S')
        arm(cv, OUT_Y, 'up', 'left') if False else dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        dots(cv, [(17, 8)], 'S')
        dots(cv, [(17, 5), (18, 5), (17, 6), (18, 6)], 'S')
        cloud = ["..SS.SS..", ".S..S..S.", "S.......S", ".SSSSSSS."]
        stamp(cv, cloud, 15, 0)
        for i in range(min(3, (t % 4))):
            dots(cv, [(17 + i * 2, 2)], 'A')
        frames.append((cv, 230))
    return frames


LAPTOP = check('laptop', [
    "SSSSSSSSSSSS",
    "SKKKKKKKKKKS",
    "SKKKKKKKKKKS",
    "SKKKKKKKKKKS",
    "SSSSSSSSSSSS",
])


def tecleando():
    frames = rise()[1:]
    code = [[(2, 5), (3, 3)], [(2, 4), (3, 6)], [(2, 2), (3, 5)]]
    for t in range(14):
        cv = scene(face(BODY_NO_ARMS, 'down' if t % 7 else 'closed', lamp='on'), OUT_Y)
        stamp(cv, LAPTOP, MX, 9, below=GROUND)
        progress = t % 12
        for line in range(3):
            length = max(0, min(8, progress * 2 - line * 5))
            for c in range(length):
                if (c + line) % 4 != 3:
                    dots(cv, [(MX + 2 + c, 10 + line)], 'A')
        dots(cv, [(MX + 3, 13) if t % 2 else (MX + 8, 13)], 'W')
        dots(cv, [(MX + 3, 12) if not t % 2 else (MX + 8, 12)], 'W')
        frames.append((cv, 120))
    return frames


PAPER = check('paper', ["KKKKKKKK", "KSSSSSKK", "KKKKKKKK", "KSSSSKKK", "KKKKKKKK", "KSSSSSSK"])


def leyendo():
    frames = rise()[1:]
    lines = ["KSSSSSKK", "KKKKKKKK", "KSSSSKKK", "KKKKKKKK", "KSSSSSSK", "KKKKKKKK", "KSSSKKKK", "KKKKKKKK"]
    for t in range(14):
        eyes = 'closed' if t == 9 else ('left' if t % 4 < 2 else 'right')
        y = OUT_Y + (1 if t % 6 == 5 else 0)
        cv = scene(face(BODY_NO_ARMS, eyes, lamp='on'), y)
        page = ["KKKKKKKK"] + [lines[(i + t // 2) % len(lines)] for i in range(4)] + ["KKKKKKKK"]
        stamp(cv, page, MX + 2, 9, below=GROUND)
        dots(cv, [(MX + 1, 11), (MX + 10, 11)], 'W')
        frames.append((cv, 200))
    return frames


ENVELOPE = check('envelope', ["KKKKKKK", "KSKKKSK", "KKSKSKK", "KKKAKKK", "KKKKKKK"])


def carta():
    frames = rise()[1:]
    held = face(BODY_NO_ARMS, 'happy', 'smile')
    for t in range(3):
        cv = scene(held if t else face(BODY_NO_ARMS, 'open', 'smile'), OUT_Y)
        stamp(cv, ENVELOPE, MX + 11, OUT_Y - 2 - t)
        dots(cv, [(MX + 12, OUT_Y + 6), (MX + 12, OUT_Y + 5), (MX + 12, OUT_Y + 4)], 'W')
        frames.append((cv, 220))
    for i, (ex, ey) in enumerate([(19, -1), (21, -3), (23, -5)]):
        cv = scene(held, OUT_Y)
        stamp(cv, ENVELOPE, ex, ey)
        arm(cv, OUT_Y, 'wave1' if i % 2 == 0 else 'wave2')
        frames.append((cv, 120))
    for i in range(4):
        cv = scene(held, OUT_Y)
        arm(cv, OUT_Y, 'wave1' if i % 2 == 0 else 'wave2')
        if i < 2:
            glyph(cv, 'spark', 20, 0, 'A' if i == 0 else 'S')
        frames.append((cv, 200))
    frames += [(scene(face(PEEK, mouth='smile'), PEEK_Y), 200)] + sink() + [(scene(None, 0), 400)]
    return frames


def nota():
    frames = rise()[1:]
    for t in range(16):
        cv = scene(face(BODY_NO_ARMS, 'down', lamp='on'), OUT_Y)
        stamp(cv, ["KKKKKKKK"] * 3, MX + 2, 11, below=GROUND)
        dots(cv, [(MX + 1, 12), (MX + 10, 12)], 'W')
        written = min(t, 12)
        for i in range(written):
            dots(cv, [(MX + 3 + i % 6, 11 + (i // 6) * 2)], 'S')
        px = MX + 3 + (written % 6)
        py = 11 + (written // 6) * 2
        if t < 12:
            dots(cv, [(px + 1, py - 1), (px + 2, py - 2)], 'S')
            dots(cv, [(px, py)], 'A')
        else:
            dots(cv, [(MX + 12, 10), (MX + 13, 11), (MX + 14, 9), (MX + 15, 8)], 'A')
        frames.append((cv, 150 if t < 12 else 260))
    frames[-1] = (scene(face(BODY_NO_ARMS, 'happy', 'smile'), OUT_Y), 500)
    return frames


def ups():
    frames = rise()[1:]
    for t in range(14):
        eyes = 'worried' if t % 5 else 'closed'
        cv = scene(face(BODY_NO_ARMS, eyes, 'frown', lamp='off' if t in (3, 5) else 'on'), OUT_Y)
        dots(cv, [(MX + 12, OUT_Y + 6), (MX + 12, OUT_Y + 5), (MX + 11, OUT_Y + (2 if t % 2 else 3))], 'W')
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        drop_y = OUT_Y + 1 + (t % 5)
        dots(cv, [(MX + 1, drop_y), (MX + 1, drop_y + 1)], 'A')
        glyph(cv, '?', 19, 1 - (1 if t % 4 < 2 else 0), 'S' if t % 3 else 'A')
        frames.append((cv, 170))
    return frames


def sorpresa():
    frames = [(scene(face(PEEK), PEEK_Y), 500)]
    shock = face(BODY_NO_ARMS, 'wide', 'open')
    for y, dx, ms in [(4, 0, 90), (1, 0, 120), (0, 0, 140), (1, 0, 110), (STAND_Y, 0, 90)]:
        cv = scene(shock, y)
        arm(cv, y, 'high', 'left')
        arm(cv, y, 'high', 'right')
        glyph(cv, '!', 20, max(0, y), 'A')
        frames.append((cv, ms))
    for dx in (1, -1, 1, 0):
        cv = canvas()
        ground(cv)
        stamp(cv, shock, MX + dx, STAND_Y, below=GROUND)
        glyph(cv, '!', 20, 1, 'A')
        frames.append((cv, 70))
    frames += [(scene(face(BODY, 'wide'), STAND_Y), 300), (scene(face(BODY, 'closed'), STAND_Y), 130), (scene(face(BODY, 'open', 'smile'), STAND_Y), 500)]
    return frames


def corazon():
    frames = rise()[1:]
    happy = face(BODY_NO_ARMS, 'happy', 'smile')
    for t in range(14):
        cv = scene(happy, OUT_Y + (1 if t % 4 == 3 else 0))
        dots(cv, [(MX + 3, OUT_Y + 9), (MX + 4, OUT_Y + 9), (MX + 7, OUT_Y + 9), (MX + 8, OUT_Y + 9)], 'S')
        big_y = OUT_Y - 1 - (t % 7)
        if big_y > -4:
            glyph(cv, 'heart', 17, big_y, 'A' if t % 7 < 5 else 'S')
        small_y = OUT_Y + 1 - ((t + 3) % 7)
        if 0 <= small_y:
            dots(cv, [(4, small_y), (6, small_y), (5, small_y + 1)], 'S')
        frames.append((cv, 170))
    return frames


def arcs(cv, x, y, n, ch, facing=1):
    for i in range(n):
        ax = x + facing * i * 2
        dots(cv, [(ax, y - i), (ax + facing, y + 1 - i + i), (ax + facing, y + 2 + i - i), (ax, y + 3 + i)], ch)
    return cv


def escucha():
    frames = rise()[1:]
    for t in range(12):
        cv = scene(face(BODY_NO_ARMS, 'right', lamp='on'), OUT_Y + (1 if t % 6 == 5 else 0))
        dots(cv, [(MX + 12, OUT_Y + 6), (MX + 12, OUT_Y + 5), (MX + 12, OUT_Y + 4)], 'W')
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        step = t % 4
        for i in range(3):
            if i < step:
                x = 22 - i * 2
                dots(cv, [(x, OUT_Y + 4), (x - 1, OUT_Y + 5), (x - 1, OUT_Y + 6), (x, OUT_Y + 7)], 'A' if i == step - 1 else 'D')
        frames.append((cv, 180))
    return frames


def habla():
    frames = rise()[1:]
    mouths = ['talk', 'open', 'talk', None, 'open', 'talk', 'open', None, 'talk', 'open', 'talk', None]
    for t, m in enumerate(mouths):
        cv = scene(face(BODY_NO_ARMS, 'closed' if t == 7 else 'open', m, lamp='on'), OUT_Y)
        dots(cv, [(MX - 1, OUT_Y + 8), (MX + 12, OUT_Y + 8)], 'W')
        step = t % 4
        for i in range(step):
            x = MX + 13 + i * 2
            dots(cv, [(x, OUT_Y + 4), (x + 1, OUT_Y + 5), (x + 1, OUT_Y + 6), (x, OUT_Y + 7)], 'A' if i == step - 1 else 'D')
        frames.append((cv, 150))
    return frames


def hola():
    frames = rise()
    happy = face(BODY_NO_ARMS, 'happy', 'smile')
    frames.append((scene(face(BODY, 'open', 'smile'), OUT_Y), 240))
    for i in range(8):
        cv = scene(happy, OUT_Y)
        arm(cv, OUT_Y, 'wave1' if i % 2 == 0 else 'wave2')
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        if i in (1, 2):
            glyph(cv, 'spark', 19, 1, 'A' if i == 1 else 'S')
        frames.append((cv, 170))
    frames.append((scene(face(BODY, 'open', 'smile'), OUT_Y), 500))
    return frames


def adios():
    happy = face(BODY_NO_ARMS, 'happy', 'smile')
    frames = [(scene(face(BODY, 'open', 'smile'), OUT_Y), 300)]
    for i in range(6):
        cv = scene(happy, OUT_Y)
        arm(cv, OUT_Y, 'wave1' if i % 2 == 0 else 'wave2')
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        frames.append((cv, 170))
    frames += [(scene(face(PEEK, 'happy', 'smile'), PEEK_Y), 200)] + sink()
    cv = scene(None, 0)
    glyph(cv, 'heart', 10, 7, 'A')
    frames.append((cv, 260))
    cv = scene(None, 0)
    glyph(cv, 'heart', 10, 5, 'S')
    frames.append((cv, 200))
    frames.append((scene(None, 0), 600))
    return frames


def buscando():
    """Its helmet lamp sweeps a spot of light along the ground, and its eyes follow the spot."""
    frames = rise()[1:]
    path = [21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    for t, spot in enumerate(path):
        eyes = 'right' if spot > MX + 8 else ('left' if spot < MX + 3 else 'open')
        cv = scene(face(PEEK, eyes, lamp='on'), PEEK_Y)
        lx, ly = MX + 5, PEEK_Y + 1
        for k in range(1, 6):
            x = round(lx + (spot - lx) * k / 6)
            y = round(ly + (GROUND - 1 - ly) * k / 6)
            if not (MX <= x < MX + 12 and y < GROUND):
                dots(cv, [(x, y)], 'D')
        dots(cv, [(spot - 1, GROUND), (spot, GROUND), (spot + 1, GROUND)], 'A')
        dots(cv, [(spot, GROUND - 1)], 'S')
        frames.append((cv, 110))
    return frames


MUG = check('mug', ["SSSS.", "SSSSS", "SSSS."])


def cafecito():
    frames = rise()[1:]
    for t in range(16):
        sip = t % 8 in (4, 5)
        cv = scene(face(BODY_NO_ARMS, 'happy' if sip else 'open', 'sip' if sip else 'smile'), OUT_Y)
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        if sip:
            stamp(cv, MUG, MX + 4, OUT_Y + 7)
            dots(cv, [(MX + 3, OUT_Y + 8)], 'W')
        else:
            mug_x, mug_y = MX + 12, OUT_Y + 8
            stamp(cv, MUG, mug_x, mug_y)
            dots(cv, [(MX + 12 - 1, mug_y + 1)], 'W')
            for i in range(3):
                sy = mug_y - 1 - i - (t % 3)
                sx = mug_x + 1 + round(math.sin(t * 0.8 + i))
                if sy >= 0:
                    dots(cv, [(sx, sy)], 'S' if i == 0 else 'D')
        frames.append((cv, 200))
    return frames

def perdido():
    """Out of his hole with no session to dig in: he looks around, scratches his helmet, shrugs and
    sweeps his lamp along the ground for something to do."""
    frames = rise()[1:]
    look = face(BODY_NO_ARMS, 'left')
    for eyes, mark in (('left', 'S'), ('right', 'A'), ('left', 'A')):
        cv = scene(face(BODY_NO_ARMS, eyes), OUT_Y)
        dots(cv, [(MX - 1, OUT_Y + 8), (MX + 12, OUT_Y + 8)], 'W')
        glyph(cv, '?', 19, 1, mark)
        frames.append((cv, 420))
    for i in range(4):
        cv = scene(face(BODY_NO_ARMS, 'up'), OUT_Y)
        dots(cv, [(MX + 12, OUT_Y + 6), (MX + 12, OUT_Y + 5), (MX + 11, OUT_Y + (2 if i % 2 else 3))], 'W')
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        glyph(cv, '?', 19, 1 - i % 2, 'A' if i % 2 else 'S')
        frames.append((cv, 170))
    for eyes, ms in (('closed', 360), ('open', 260)):
        cv = scene(face(BODY_NO_ARMS, eyes), OUT_Y + (1 if eyes == 'closed' else 0))
        y = OUT_Y + (1 if eyes == 'closed' else 0)
        dots(cv, [(MX - 1, y + 7), (MX - 2, y + 6), (MX + 12, y + 7), (MX + 13, y + 6)], 'W')
        frames.append((cv, ms))
    path = [4, 6, 8, 10, 12, 14, 16, 18, 20, 18, 16, 14, 12, 10]
    for t, spot in enumerate(path):
        eyes = 'right' if spot > MX + 8 else ('left' if spot < MX + 4 else 'down')
        cv = scene(face(BODY_NO_ARMS, eyes, lamp='on'), OUT_Y)
        dots(cv, [(MX - 1, OUT_Y + 8), (MX + 12, OUT_Y + 8)], 'W')
        lx, ly = MX + 5, OUT_Y + 1
        for k in range(1, 6):
            x = round(lx + (spot - lx) * k / 6)
            y = round(ly + (GROUND - 1 - ly) * k / 6)
            if not (MX - 1 <= x <= MX + 12 and y < GROUND):
                dots(cv, [(x, y)], 'D')
        dots(cv, [(spot - 1, GROUND), (spot, GROUND), (spot + 1, GROUND)], 'A')
        frames.append((cv, 110))
    cv = scene(look, OUT_Y)
    dots(cv, [(MX - 1, OUT_Y + 8), (MX + 12, OUT_Y + 8)], 'W')
    glyph(cv, '?', 19, 1, 'A')
    frames.append((cv, 500))
    return frames


def fuera():
    """Gone from the sidebar while he is out at the corner of the terminal: he ducks down his hole,
    which stays there for him to come back to."""
    frames = sink()
    frames.append((scene(None, 0), 1000))
    return frames


def saluda():
    """Waving at you for as long as you are reading what he has to say."""
    frames = rise()
    frames.append((scene(face(BODY, 'open', 'smile'), OUT_Y), 260))
    happy = face(BODY_NO_ARMS, 'happy', 'smile')
    for i in range(8):
        cv = scene(happy, OUT_Y)
        arm(cv, OUT_Y, 'wave1' if i % 2 == 0 else 'wave2')
        dots(cv, [(MX - 1, OUT_Y + 8)], 'W')
        if i in (2, 3):
            glyph(cv, 'spark', 19, 1, 'A' if i == 2 else 'S')
        frames.append((cv, 170))
    frames.append((scene(face(BODY, 'open', 'smile'), OUT_Y), 900))
    frames.append((scene(face(BODY, 'closed', 'smile'), OUT_Y), 120))
    frames.append((scene(face(BODY, 'open', 'smile'), OUT_Y), 700))
    return frames


CLIPS = [
    ('dig', cavando, 0),
    ('peek', asoma, 4),
    ('done', listo, 3),
    ('sleep', durmiendo, 0),
    ('think', pensando, 3),
    ('type', tecleando, 3),
    ('read', leyendo, 3),
    ('letter', carta, 3),
    ('note', nota, 3),
    ('oops', ups, 3),
    ('surprise', sorpresa, 0),
    ('listen', escucha, 3),
    ('talk', habla, 3),
    ('hello', hola, 4),
    ('bye', adios, 0),
    ('love', corazon, 3),
    ('search', buscando, 3),
    ('coffee', cafecito, 3),
    ('lost', perdido, 3),
    ('away', fuera, 4),
    ('greet', saluda, 5),
]


def encode(cv):
    """A frame as runs, row after row: '12.3W' is twelve empty cells then three ink ones."""
    flat = ''.join(''.join(row) for row in cv)
    out = []
    i = 0
    while i < len(flat):
        j = i
        while j < len(flat) and flat[j] == flat[i]:
            j += 1
        n = j - i
        out.append((str(n) if n > 1 else '') + flat[i])
        i = j
    return ''.join(out)


def export_ts(path):
    frames = []
    index = {}
    clips = {}
    for name, make, intro in CLIPS:
        seq = []
        for cv, ms in make():
            code = encode(cv)
            if code not in index:
                index[code] = len(frames)
                frames.append(code)
            seq.append((index[code], ms))
        clips[name] = (intro, seq)
    lines = [
        '// Generated by scripts/topito.py from the pixel art defined there. Do not edit by hand: change',
        '// the script and run `python scripts/topito.py`.',
        '',
        "export type TopitoClipName =",
    ]
    lines += [f"  | '{name}'" for name, _, _ in CLIPS]
    lines += [
        '',
        f'export const TOPITO_COLS = {CW}',
        f'export const TOPITO_ROWS = {CH}',
        f'export const TOPITO_GROUND = {GROUND}',
        '',
        '/** Every distinct frame, as runs of cells: a count (1 when left out) and one of . W S D K A. */',
        'export const TOPITO_FRAMES: string[] = [',
    ]
    lines += [f"  '{code}'," for code in frames]
    lines += [
        ']',
        '',
        '/** Each clip: how many of its frames are the way in, then the frames as [frame, milliseconds]. */',
        'export const TOPITO_CLIPS: Record<TopitoClipName, { intro: number; frames: Array<[number, number]> }> = {',
    ]
    for name, _, _ in CLIPS:
        intro, seq = clips[name]
        body = ', '.join(f'[{f}, {ms}]' for f, ms in seq)
        lines.append(f'  {name}: {{ intro: {intro}, frames: [{body}] }},')
    lines += ['}', '']
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print(f'{len(frames)} frames in {len(CLIPS)} clips -> {path}')


def export_gifs(folder):
    from PIL import Image, ImageDraw

    def render(cv, theme):
        t = THEMES[theme]
        img = Image.new('RGB', (CW * CELL, CH * CELL), t['bg'])
        d = ImageDraw.Draw(img)
        for r, row in enumerate(cv):
            for c, ch in enumerate(row):
                if ch != '.':
                    d.rectangle([c * CELL, r * CELL, (c + 1) * CELL - 1, (r + 1) * CELL - 1], fill=t[ch])
        return img

    os.makedirs(folder, exist_ok=True)
    for name, make, _ in CLIPS:
        frames = make()
        for theme in ('dark', 'light'):
            images = [render(cv, theme) for cv, _ in frames]
            images[0].save(os.path.join(folder, f'topito-{name}-{theme}.gif'), save_all=True, append_images=images[1:], duration=[ms for _, ms in frames], loop=0, disposal=2)
    print(f'{len(CLIPS)} clips rendered as GIFs in {folder}')


if __name__ == '__main__':
    import sys
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if len(sys.argv) > 2 and sys.argv[1] == '--gifs':
        export_gifs(sys.argv[2])
    else:
        export_ts(os.path.join(root, 'src', 'renderer', 'src', 'lib', 'topito', 'frames.ts'))
