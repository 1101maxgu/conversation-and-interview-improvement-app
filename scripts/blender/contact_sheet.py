"""Tile preview PNGs into one image: blender -b --python scripts/blender/contact_sheet.py -- out.png a.png b.png ..."""
import sys
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
out, files = argv[0], argv[1:]
tiles = []
for f in files:
    img = bpy.data.images.load(f)
    w, h = img.size
    tiles.append(np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4))
h, w = tiles[0].shape[:2]
cols = min(len(tiles), 3)
rows = (len(tiles) + cols - 1) // cols
canvas = np.ones((rows * h, cols * w, 4), dtype=np.float32)
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    y = (rows - 1 - r) * h
    # composite over white so transparent renders are readable
    a = t[..., 3:4]
    canvas[y:y + h, c * w:(c + 1) * w, :3] = t[..., :3] * a + (1 - a)
img = bpy.data.images.new("sheet", cols * w, rows * h)
img.pixels = canvas.ravel()
img.filepath_raw, img.file_format = out, "PNG"
img.save()
print("SHEET", out)
