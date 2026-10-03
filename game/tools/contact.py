import sys, glob, os
from PIL import Image
d = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
suffix = sys.argv[2] if len(sys.argv) > 2 else '_c.jpg'
files = sorted(glob.glob(os.path.join(d, '*' + suffix)))
cell = 256; cols = 6
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * cell, rows * cell), (20, 20, 20))
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((cell, cell))
    sheet.paste(im, ((i % cols) * cell, (i // cols) * cell))
sheet.save(sys.argv[1]); print(len(files), 'textures ->', sys.argv[1])
