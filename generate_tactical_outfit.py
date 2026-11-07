import io
import json
import math
import os
import shutil
import struct
from PIL import Image, ImageChops, ImageDraw, ImageFilter


def build_tactical_texture():
    glb_path = 'public/models/leon.glb'
    with open(glb_path, 'rb') as f:
        glb = f.read()

    json_len = struct.unpack_from('<I', glb, 12)[0]
    gltf = json.loads(glb[20:20 + json_len].decode('utf-8'))
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

    W, H = 2048, 2048
    # Base background: deep tactical slate-olive to avoid any bright seam bleed
    img = Image.new('RGB', (W, H), (36, 42, 40))
    draw = ImageDraw.Draw(img)

    # 1. Render anatomical multi-material zones across UV triangles
    for i in range(0, ind_acc['count'], 3):
        i0 = struct.unpack_from('<H', glb, ind_start + i * 2)[0]
        i1 = struct.unpack_from('<H', glb, ind_start + (i + 1) * 2)[0]
        i2 = struct.unpack_from('<H', glb, ind_start + (i + 2) * 2)[0]
        v0, v1, v2 = verts[i0], verts[i1], verts[i2]

        mx = (v0['x'] + v1['x'] + v2['x']) / 3.0
        my = (v0['y'] + v1['y'] + v2['y']) / 3.0
        mz = (v0['z'] + v1['z'] + v2['z']) / 3.0
        mnx = (v0['nx'] + v1['nx'] + v2['nx']) / 3.0
        mny = (v0['ny'] + v1['ny'] + v2['ny']) / 3.0
        mnz = (v0['nz'] + v1['nz'] + v2['nz']) / 3.0
        ax = abs(mx)

        if my > 0.935:
            # UPPER BODY: Tactical Combat Shirt / Ripstop Field Jacket (Ranger Olive-Graphite)
            t_up = max(0.0, min(1.0, (my - 0.935) / 0.55))
            base_r = 44.0 + 14.0 * t_up
            base_g = 54.0 + 16.0 * t_up
            base_b = 50.0 + 14.0 * t_up

            # Reinforced dark graphite shoulder yoke & upper back panel
            if my > 1.34 and ax < 0.34:
                w_yoke = min(1.0, (my - 1.34) / 0.08)
                base_r = base_r * (1.0 - 0.28 * w_yoke)
                base_g = base_g * (1.0 - 0.26 * w_yoke)
                base_b = base_b * (1.0 - 0.22 * w_yoke)

            # Reinforced abrasion elbow / forearm pads on sleeves
            if 0.30 < ax < 0.52 and mz < 0.02:
                base_r *= 0.82
                base_g *= 0.83
                base_b *= 0.86

            # Tactical wrist cuffs transitioning into gloves
            if ax >= 0.52:
                base_r, base_g, base_b = 24.0, 27.0, 32.0

            # Center front zipper & seam line
            if ax < 0.018 and mz > 0.04 and my > 0.96:
                base_r, base_g, base_b = 26.0, 30.0, 34.0

        elif my > 0.875:
            # WAIST / BELT ZONE: Matte dark tactical webbing under the 3D duty belt
            base_r, base_g, base_b = 24.0, 26.0, 30.0

        else:
            # LOWER BODY: Tactical Cargo Pants in contrasting Coyote-Taupe / Warm Slate
            t_leg = max(0.0, min(1.0, (my - 0.14) / 0.74))
            base_r = 68.0 + 18.0 * t_leg
            base_g = 64.0 + 16.0 * t_leg
            base_b = 56.0 + 14.0 * t_leg

            # Side thigh cargo pocket panels (structured contrast)
            if 0.56 < my < 0.77 and ax > 0.142:
                base_r *= 0.86
                base_g *= 0.86
                base_b *= 0.85
                # Pocket flap highlight at top of cargo pocket
                if 0.735 < my < 0.765:
                    base_r *= 1.12
                    base_g *= 1.12
                    base_b *= 1.10

            # Articulated Cordura knee reinforcement panels
            if 0.41 < my < 0.55 and mz > -0.01:
                base_r = 44.0
                base_g = 46.0
                base_b = 48.0

            # Inseam & outer seam subtle darkening
            if ax < 0.035 or ax > 0.172:
                base_r *= 0.90
                base_g *= 0.90
                base_b *= 0.90

        # Directional 3D surface normal shading to emphasize anatomical volume & folds
        hemi = 0.92 + 0.10 * max(-0.4, mny) + 0.08 * max(-0.5, mnz) + 0.04 * abs(mnx)
        r = int(min(255, max(0, round(base_r * hemi))))
        g = int(min(255, max(0, round(base_g * hemi))))
        b = int(min(255, max(0, round(base_b * hemi))))

        pts = [
            (int(v0['u'] * (W - 1)), int(v0['v'] * (H - 1))),
            (int(v1['u'] * (W - 1)), int(v1['v'] * (H - 1))),
            (int(v2['u'] * (W - 1)), int(v2['v'] * (H - 1))),
        ]
        draw.polygon(pts, fill=(r, g, b))

    # Smooth polygon transitions slightly while keeping zone boundaries crisp
    img = img.filter(ImageFilter.GaussianBlur(radius=1.4))

    # 2. Extract embedded Normal & Ambient Occlusion maps from leon.glb to bake genuine PBR cloth folds
    try:
        look_mat = gltf['materials'][p['material']]
        occ_tex_idx = look_mat['occlusionTexture']['index']
        norm_tex_idx = look_mat['normalTexture']['index']

        occ_img_idx = gltf['textures'][occ_tex_idx]['source']
        norm_img_idx = gltf['textures'][norm_tex_idx]['source']

        bv_occ = gltf['bufferViews'][gltf['images'][occ_img_idx]['bufferView']]
        bv_norm = gltf['bufferViews'][gltf['images'][norm_img_idx]['bufferView']]

        occ_bytes = glb[bin_start + bv_occ.get('byteOffset', 0):bin_start + bv_occ.get('byteOffset', 0) + bv_occ['byteLength']]
        norm_bytes = glb[bin_start + bv_norm.get('byteOffset', 0):bin_start + bv_norm.get('byteOffset', 0) + bv_norm['byteLength']]

        occ_map = Image.open(io.BytesIO(occ_bytes)).convert('L').resize((W, H), Image.Resampling.BICUBIC)
        norm_map = Image.open(io.BytesIO(norm_bytes)).convert('RGB').resize((W, H), Image.Resampling.BICUBIC)

        # Extract Y/Z normal channels to accentuate cloth fold ridges and valleys
        _, ny_ch, nz_ch = norm_map.split()
        fold_lighting = ImageChops.add(ny_ch, nz_ch, scale=2.0, offset=-12)

        # Combine occlusion map and normal fold cavity map into a rich shading multiplier
        ao_shaded = ImageChops.multiply(occ_map, fold_lighting)
        # Remap brightness so dark creases are deep and highlights pop on fold ridges
        ao_shaded = ao_shaded.point(lambda v: int(min(255, max(125, 130 + (v - 90) * 0.95))))
        ao_rgb = Image.merge('RGB', (ao_shaded, ao_shaded, ao_shaded))
        img = ImageChops.multiply(img, ao_rgb)
    except Exception as exc:
        print('Warning: could not blend embedded AO/Normal maps:', exc)

    # 3. Overlay subtle micro-ripstop tactical fabric grid at 2048x2048 resolution
    ripstop = Image.new('L', (W, H), 250)
    r_draw = ImageDraw.Draw(ripstop)
    step = 6
    for x in range(0, W, step):
        r_draw.line([(x, 0), (x, H)], fill=236, width=1)
    for y in range(0, H, step):
        r_draw.line([(0, y), (W, y)], fill=236, width=1)
    rip_rgb = Image.merge('RGB', (ripstop, ripstop, ripstop))
    img = ImageChops.multiply(img, rip_rgb)

    out_path = 'public/models/leon_outfit.png'
    img.save(out_path, format='PNG', optimize=True)
    print(f'Successfully generated PS5 Tactical Operator texture at {out_path} ({os.path.getsize(out_path)} bytes)')

    dist_path = 'dist/models/leon_outfit.png'
    if os.path.exists('dist/models'):
        shutil.copy2(out_path, dist_path)
        print(f'Synchronized texture to {dist_path}')


if __name__ == '__main__':
    build_tactical_texture()
