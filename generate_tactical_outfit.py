import json
import struct
import math
import os
from PIL import Image, ImageDraw, ImageFilter

def build_tactical_texture():
    with open('public/models/leon.glb', 'rb') as f:
        glb = f.read()

    json_len = struct.unpack_from('<I', glb, 12)[0]
    gltf = json.loads(glb[20:20+json_len].decode('utf-8'))
    bin_start = 20 + json_len + 8
    look_mesh = next(m for m in gltf['meshes'] if m['name'] == 'avaturn_look_0')
    p = look_mesh['primitives'][0]

    acc_pos = gltf['accessors'][p['attributes']['POSITION']]
    bv_pos = gltf['bufferViews'][acc_pos['bufferView']]
    start = bin_start + bv_pos.get('byteOffset', 0)
    stride = bv_pos['byteStride']

    ind_acc = gltf['accessors'][p['indices']]
    bv_ind = gltf['bufferViews'][ind_acc['bufferView']]
    ind_start = bin_start + bv_ind.get('byteOffset', 0) + ind_acc.get('byteOffset', 0)

    verts = []
    for i in range(acc_pos['count']):
        vo = start + i * stride
        x, y, z = struct.unpack_from('<fff', glb, vo)
        nx, ny, nz = struct.unpack_from('<fff', glb, vo + 12)
        u, v = struct.unpack_from('<ff', glb, vo + 24)
        verts.append({'x': x, 'y': y, 'z': z, 'nx': nx, 'ny': ny, 'nz': nz, 'u': u, 'v': v})

    W, H = 1024, 1024
    # Base background color: tactical dark graphite
    img = Image.new('RGBA', (W, H), (24, 27, 33, 255))
    draw = ImageDraw.Draw(img)

    # 1. First pass: render all base polygons with smooth continuous transitions (no faceted triangle steps)
    for i in range(0, ind_acc['count'], 3):
        i0 = struct.unpack_from('<H', glb, ind_start + i * 2)[0]
        i1 = struct.unpack_from('<H', glb, ind_start + (i+1) * 2)[0]
        i2 = struct.unpack_from('<H', glb, ind_start + (i+2) * 2)[0]
        v0, v1, v2 = verts[i0], verts[i1], verts[i2]

        my = (v0['y'] + v1['y'] + v2['y']) / 3.0
        mx = (v0['x'] + v1['x'] + v2['x']) / 3.0
        mnz = (v0['nz'] + v1['nz'] + v2['nz']) / 3.0

        # Uniform Tactical Long-Sleeve Compression Jacket/Shirt, Waist & Cargo Pants
        # Smooth continuous vertical tone across torso, sleeves and pants (no jagged triangle steps)
        t = max(0.0, min(1.0, (my - 0.50) / 0.85))
        base_r = 23.0 + 3.0 * t
        base_g = 26.0 + 4.0 * t
        base_b = 32.0 + 5.0 * t
        shade = 0.96 + 0.04 * max(-0.3, mnz)

        r = int(min(255, max(0, round(base_r * shade))))
        g = int(min(255, max(0, round(base_g * shade))))
        b = int(min(255, max(0, round(base_b * shade))))

        pts = [
            (int(v0['u'] * (W - 1)), int(v0['v'] * (H - 1))),
            (int(v1['u'] * (W - 1)), int(v1['v'] * (H - 1))),
            (int(v2['u'] * (W - 1)), int(v2['v'] * (H - 1)))
        ]
        draw.polygon(pts, fill=(r, g, b, 255))

    # 2. Smooth anti-aliasing pass to eliminate any UV seam or polygon edge artifacts
    img = img.filter(ImageFilter.SMOOTH_MORE)

    # Save the output directly into public/models/leon_outfit.png
    out_path = 'public/models/leon_outfit.png'
    img.save(out_path, format='PNG', optimize=True)
    print(f'Successfully generated Tactical Operator outfit texture at {out_path} ({os.path.getsize(out_path)} bytes)')

    dist_path = 'dist/models/leon_outfit.png'
    if os.path.exists('dist/models'):
        import shutil
        shutil.copy2(out_path, dist_path)
        print(f'Synchronized texture to {dist_path}')

if __name__ == '__main__':
    build_tactical_texture()
