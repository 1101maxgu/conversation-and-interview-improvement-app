"""Builds Elena (the interview companion) from scratch with MPFB, seats her at a desk and renders previews.

Run in the background, from the repo root:
  blender -b --python scripts/blender/elena_build.py -- [--no-render] [--samples 96] [--res 1024]
  optional: --skin NAME --hair NAME --tag _x   (quick comparisons; a tagged run does not overwrite elena.blend)

Everything about her look lives in CONFIG below, so the character is reproducible.
Needs the MPFB extension plus these asset packs: system assets, faceunits01, visemes02, suits01, hair01,
skins01, eyebrows01, eyelashes01.
"""
import glob
import math
import os
import sys
from importlib import import_module

import bpy
from mathutils import Matrix, Vector

PKG = "bl_ext.blender_org.mpfb"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ART = os.path.join(ROOT, "art", "elena")
PREVIEWS = os.path.join(ART, "previews")

CONFIG = {
    # 0 = female .. 1 = male; age 0.5 is about 25, 0.6 is about 40.
    "macro": {"gender": 0.0, "age": 0.56, "muscle": 0.42, "weight": 0.47, "proportions": 0.72,
              "height": 0.55, "cupsize": 0.45, "firmness": 0.55,
              "race": {"asian": 0.05, "caucasian": 0.90, "african": 0.05}},
    "skin": "darthfurby_caucasian_female",
    # ENHANCED_SSS looks best in Cycles previews; the web export bakes it down to plain textures.
    "skin_type": "ENHANCED_SSS",
    "eye_material": "PROCEDURAL_EYES",
    "subdiv": 1,
    "rig": "default",
    "eyes": "high-poly",
    "eyebrows": "mindfront_eyebrows_03",
    "eyelashes": "mindfront_eyelashes_02",
    "teeth": "teeth_base",
    "tongue": "tongue01",
    "hair": "toigo_curled_under_bob",
    "clothes": ["toigo_female_suit"],
    # Grey-green iris for the procedural eye shader (linear RGBA).
    "eye_colours": {"IrisMajorColor": (0.20, 0.30, 0.22, 1.0), "IrisMinorColor": (0.10, 0.13, 0.09, 1.0),
                    "IrisSection4Color": (0.03, 0.04, 0.03, 1.0)},
    # Face shaping: MPFB target name -> weight. "lr:" applies the l- and r- variants together.
    "targets": {
        "head-oval": 0.45, "head-fat-decr": 0.15, "head-scale-vert-decr": 0.15,
        "forehead-scale-vert-decr": 0.60,
        "lr:eye-scale-incr": 0.20, "lr:eye-corner2-up": 0.18, "lr:eye-bag-decr": 0.20, "lr:eye-height2-decr": 0.25,
        "eyebrows-trans-up": 0.15, "eyebrows-angle-up": 0.10,
        "nose-scale-horiz-decr": 0.30, "nose-point-up": 0.15, "nose-width2-decr": 0.25, "nose-volume-decr": 0.20,
        "mouth-angles-up": 0.55, "mouth-upperlip-volume-incr": 0.30, "mouth-lowerlip-volume-incr": 0.35,
        "mouth-cupidsbow-incr": 0.20, "mouth-scale-horiz-incr": 0.15,
        "chin-width-decr": 0.30, "chin-bones-decr": 0.25, "chin-jaw-drop-decr": 0.20,
        "lr:cheek-bones-incr": 0.40, "lr:cheek-volume-decr": 0.10,
        "neck-scale-horiz-decr": 0.15,
        # Narrower, softer shoulders so the jacket does not balloon once the arms come down.
        "measure-shoulder-dist-decr": 0.60, "lr:upperarm-shoulder-muscle-decr": 0.60, "lr:upperarm-fat-decr": 0.30,
        "torso-vshape-decr": 0.30,
        # Real faces are not symmetrical: small one-sided offsets remove the doll look.
        "asym-brown-1-l": 0.18, "asym-eye-3-r": 0.14, "asym-mouth-1-l": 0.12, "asym-nose-2-r": 0.10,
        "asym-jaw-1-l": 0.10, "asym-cheek-1-r": 0.10,
        "mouth-laugh-lines-out": 0.25,
    },
    # Realism pass. Skin and eye values are inputs of MPFB's shader groups.
    "skin_shader": {"Pore strength": 0.38, "Roughness": 0.43, "SSS strength": 0.26, "SSS radius scale": 0.12,
                    "Clearcoat": 0.06, "colorMixInStrength": 0.08},
    "eye_shader": {"EyeWhiteColor": (0.80, 0.78, 0.76, 1.0), "PupilSize": 0.27, "IrisToEyeWhiteRelation": 0.42,
                   "OuterLayerRoughness": 0.02},
    "hair_hsv": (0.525, 0.70, 0.50),    # hue, saturation, value: turns the auburn into a neutral chestnut brown
    "hdri": "interior.exr",             # bundled with Blender (datafiles/studiolights/world)
    "render_subdiv": 2,
    # Seated at a desk, forearms resting on it. Directions are world-space (x = her left, -y = towards camera, z = up).
    "pose": [
        ("spine03", "tilt_x", 4.0),          # lean in slightly
        ("upperarm01.L", "aim", (0.16, -0.32, -1.0)),
        ("upperarm01.R", "aim", (-0.16, -0.32, -1.0)),
        ("lowerarm01.L", "aim", (-0.50, -0.86, -0.05)),
        ("lowerarm01.R", "aim", (0.50, -0.86, -0.05)),
        ("wrist.L", "aim", (-0.62, -0.78, -0.02)),
        ("wrist.R", "aim", (0.62, -0.78, -0.02)),
        ("head", "tilt_x", -2.0),            # chin level after the lean
        ("head", "tilt_y", 2.5),             # a slight head tilt reads as attentive, and less like a mannequin
    ],
}


def args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    get = lambda flag, default: (argv[argv.index(flag) + 1] if flag in argv else default)
    for key in ("skin", "hair"):
        CONFIG[key] = get(f"--{key}", CONFIG[key])
    return {"render": "--no-render" not in argv, "samples": int(get("--samples", 96)), "res": int(get("--res", 1024)),
            "tag": get("--tag", "")}


def services():
    bpy.ops.preferences.addon_enable(module=PKG)  # in-memory only; background Blender does not save preferences
    mod = lambda name: import_module(f"{PKG}.services.{name}")
    return {
        "human": mod("humanservice").HumanService,
        "target": mod("targetservice").TargetService,
        "location": mod("locationservice").LocationService,
        "face": mod("faceservice").FaceService,
    }


def asset(data_dir, kind, name, ext):
    """Path of the single *.ext file in <data>/<kind>/<name>/."""
    hits = glob.glob(os.path.join(data_dir, kind, name, f"*.{ext}"))
    if not hits:
        raise FileNotFoundError(f"No .{ext} for {kind}/{name}. Is its asset pack installed?")
    return hits[0]


def build(svc):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.preferences.addon_enable(module=PKG)
    human, target, data = svc["human"], svc["target"], svc["location"].get_user_data()

    base = human.create_human(scale=0.1, macro_detail_dict=CONFIG["macro"])
    base.name = "Elena"

    # Shape the face before fitting hair and clothes, so they fit the final head.
    for name, weight in CONFIG["targets"].items():
        for n in ([f"l-{name[3:]}", f"r-{name[3:]}"] if name.startswith("lr:") else [name]):
            path = target.target_full_path(n)
            if not path:
                raise FileNotFoundError(f"No target named {n}")
            target.load_target(base, path, weight=weight, name=n)

    rig = human.add_builtin_rig(base, CONFIG["rig"], import_weights=True)

    human.set_character_skin(asset(data, "skins", CONFIG["skin"], "mhmat"), base, skin_type=CONFIG["skin_type"],
                             material_instances=False)
    if CONFIG["subdiv"]:
        mod = base.modifiers.new("Smooth", "SUBSURF")
        mod.levels = mod.render_levels = CONFIG["subdiv"]

    parts = [("eyes", CONFIG["eyes"], "Eyes"), ("eyebrows", CONFIG["eyebrows"], "Eyebrows"),
             ("eyelashes", CONFIG["eyelashes"], "Eyelashes"), ("teeth", CONFIG["teeth"], "Teeth"),
             ("tongue", CONFIG["tongue"], "Tongue"), ("hair", CONFIG["hair"], "Hair")]
    made = {}
    for kind, name, asset_type in parts:
        made[kind] = human.add_mhclo_asset(asset(data, kind, name, "mhclo"), base, asset_type=asset_type,
                                           subdiv_levels=CONFIG["subdiv"],
                                           material_type=CONFIG["eye_material"] if kind == "eyes" else "MAKESKIN")
    for mat in made["eyes"].data.materials if made.get("eyes") else []:
        for node in mat.node_tree.nodes:
            for socket in node.inputs:
                if socket.name in CONFIG["eye_colours"]:
                    socket.default_value = CONFIG["eye_colours"][socket.name]
    for name in CONFIG["clothes"]:
        made[name] = human.add_mhclo_asset(asset(data, "clothes", name, "mhclo"), base, asset_type="Clothes",
                                           subdiv_levels=CONFIG["subdiv"], material_type="MAKESKIN")
    # Animation shapes: the 52 ARKit face units and the 15 Meta/Oculus visemes, copied onto lashes, brows, teeth
    # and tongue so they follow the face.
    face = svc["face"]
    face.load_targets(base, load_microsoft_visemes=False, load_meta_visemes=True, load_arkit_faceunits=True)
    face.interpolate_targets(base)
    return base, rig, made


def _insert_before_bsdf(mat, socket_name, make_node):
    """Put a new node between whatever feeds a Principled BSDF input and the BSDF itself."""
    tree = mat.node_tree
    bsdf = next((n for n in tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if not bsdf or not bsdf.inputs[socket_name].is_linked:
        return bsdf, None
    source = bsdf.inputs[socket_name].links[0].from_socket
    node = make_node(tree)
    tree.links.new(source, node.inputs["Color"])
    tree.links.new(node.outputs["Color"], bsdf.inputs[socket_name])
    return bsdf, node


def _set(bsdf, name, value):
    if bsdf and name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def realism(base, made):
    """Shader and geometry tweaks that move her from game asset towards portrait."""
    for mod in base.modifiers:
        if mod.type == "SUBSURF":
            mod.render_levels = CONFIG["render_subdiv"]

    def group_inputs(obj, values):
        for mat in obj.data.materials:
            for node in mat.node_tree.nodes:
                if node.bl_idname == "ShaderNodeGroup":
                    for name, value in values.items():
                        if name in node.inputs:
                            node.inputs[name].default_value = value

    group_inputs(base, CONFIG["skin_shader"])
    group_inputs(made["eyes"], CONFIG["eye_shader"])

    # Hair: tone the colour, add anisotropic highlights.
    def hsv(tree):
        n = tree.nodes.new("ShaderNodeHueSaturation")
        hue, sat, val = CONFIG["hair_hsv"]
        n.inputs["Hue"].default_value = hue
        n.inputs["Saturation"].default_value = sat
        n.inputs["Value"].default_value = val
        return n

    for mat in made["hair"].data.materials:
        bsdf, _ = _insert_before_bsdf(mat, "Base Color", hsv)
        _set(bsdf, "Roughness", 0.36)
        _set(bsdf, "Anisotropic", 0.7)
        _set(bsdf, "Specular IOR Level", 0.35)
        _set(bsdf, "Sheen Weight", 0.15)

    # Teeth: the stock texture is dull and dark between the teeth.
    def brighten(tree):
        n = tree.nodes.new("ShaderNodeBrightContrast")
        n.inputs["Bright"].default_value = 0.22
        n.inputs["Contrast"].default_value = -0.15
        return n

    for mat in made["teeth"].data.materials:
        bsdf, _ = _insert_before_bsdf(mat, "Base Color", brighten)
        _set(bsdf, "Roughness", 0.22)
        _set(bsdf, "Subsurface Weight", 0.15)

    # Cloth: matte wool with a soft sheen, not plastic.
    for name in CONFIG["clothes"]:
        for mat in made[name].data.materials:
            bsdf = next((n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
            _set(bsdf, "Roughness", 0.82)
            _set(bsdf, "Sheen Weight", 0.35)
            _set(bsdf, "Specular IOR Level", 0.25)


def pose(rig):
    """Apply CONFIG["pose"]. "aim" points a bone along a world direction; tilt_x/y/z rotate it by degrees."""
    to_rig = rig.matrix_world.inverted().to_3x3()
    for name, kind, value in CONFIG["pose"]:
        bone = rig.pose.bones[name]
        bpy.context.view_layer.update()
        m = bone.matrix.copy()
        pivot = m.to_translation()
        if kind == "aim":
            want = (to_rig @ Vector(value)).normalized()
            turn = (m.to_3x3() @ Vector((0, 1, 0))).rotation_difference(want).to_matrix().to_4x4()
        else:
            axis = to_rig @ Vector({"tilt_x": (1, 0, 0), "tilt_y": (0, 1, 0), "tilt_z": (0, 0, 1)}[kind])
            turn = Matrix.Rotation(math.radians(value), 4, axis)
        bone.matrix = Matrix.Translation(pivot) @ turn @ Matrix.Translation(-pivot) @ m
    bpy.context.view_layer.update()


def bone_world(rig, name, tail=False):
    b = rig.pose.bones[name]
    return rig.matrix_world @ (b.tail if tail else b.head)


def desk(rig):
    """A plain desk whose top sits just under the hands and whose back edge meets her body."""
    top = min(bone_world(rig, "wrist.L", tail=True).z, bone_world(rig, "wrist.R", tail=True).z) - 0.035
    back = bone_world(rig, "spine03").y - 0.10
    front = back - 1.1
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.active_object
    obj.name = "Desk"
    obj.scale = (1.9, back - front, 0.04)
    obj.location = (0.0, (back + front) / 2, top - 0.02)
    mat = bpy.data.materials.new("DeskTop")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.62, 0.45, 0.30, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.45
    obj.data.materials.append(mat)
    return obj, top


def head_centre(rig):
    return bone_world(rig, "head", tail=False).z + 0.05


def aim_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def studio(rig, desk_top, res):
    scene = bpy.context.scene
    head_z = head_centre(rig)
    focus = (0.0, bone_world(rig, "head").y, head_z)

    cam_data = bpy.data.cameras.new("MeetingCam")
    cam_data.lens = 50
    cam = bpy.data.objects.new("MeetingCam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def light(name, loc, energy, size, colour=(1, 1, 1)):
        data = bpy.data.lights.new(name, "AREA")
        data.energy, data.color, data.size = energy, colour, size
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = loc
        aim_at(obj, focus)

    # Soft front-left key (like a window or screen glow), gentle fill, hair light from behind.
    light("Key", (0.9, focus[1] - 1.4, head_z + 0.45), 5, 1.2, (1.0, 0.97, 0.93))
    light("Fill", (-1.2, focus[1] - 1.2, head_z + 0.05), 2, 1.5, (0.93, 0.96, 1.0))
    light("Rim", (-0.6, focus[1] + 1.2, head_z + 0.6), 10, 0.6)

    # Real-room lighting and reflections from an HDRI that ships with Blender. The film stays transparent,
    # so the room lights her but is not in the picture.
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    tree = world.node_tree
    background = tree.nodes["Background"]
    hdri = os.path.join(bpy.utils.resource_path("LOCAL"), "datafiles", "studiolights", "world", CONFIG["hdri"])
    if os.path.exists(hdri):
        env = tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri)
        mapping, coords = tree.nodes.new("ShaderNodeMapping"), tree.nodes.new("ShaderNodeTexCoord")
        mapping.inputs["Rotation"].default_value = (0, 0, math.radians(120))
        tree.links.new(coords.outputs["Generated"], mapping.inputs["Vector"])
        tree.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        tree.links.new(env.outputs["Color"], background.inputs["Color"])
        background.inputs["Strength"].default_value = 0.75
    else:
        background.inputs["Color"].default_value = (0.75, 0.75, 0.78, 1)
        background.inputs["Strength"].default_value = 0.35
    scene.world = world

    # Shallow depth of field, focused on the eyes.
    target = bpy.data.objects.new("FocusTarget", None)
    scene.collection.objects.link(target)
    target.location = (0.0, focus[1] - 0.09, head_z + 0.02)
    cam_data.dof.use_dof = True
    cam_data.dof.focus_object = target
    cam_data.dof.aperture_fstop = 2.8
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass

    scene.render.engine = "CYCLES"
    scene.render.film_transparent = True
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == kind
            if any(d.use for d in prefs.devices):
                scene.cycles.device = "GPU"
                break
        except Exception:
            continue
    return cam, focus


def render(name, samples):
    scene = bpy.context.scene
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.filepath = os.path.join(PREVIEWS, name)
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath + ".png")


def main():
    opts = args()
    os.makedirs(PREVIEWS, exist_ok=True)
    svc = services()
    base, rig, made = build(svc)
    keys = [k.name for k in base.data.shape_keys.key_blocks]
    print("BUILT", base.name, "rig:", rig.name if rig else None, "missing:", sorted(k for k, v in made.items() if not v),
          "| face units:", sum(k.startswith("!ex-") for k in keys), "| visemes:", sum("viseme" in k.lower() for k in keys))
    realism(base, made)
    pose(rig)
    _, desk_top = desk(rig)
    cam, focus = studio(rig, desk_top, opts["res"])
    tag = opts["tag"]
    if not tag:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ART, "elena.blend"))
    if opts["render"]:
        # The "virtual meeting" shot: eye-level, head to desk.
        # Frame from just above the hair to just below the hands.
        mid = (focus[0], focus[1], ((focus[2] + 0.24) + (desk_top - 0.12)) / 2)
        cam.location = (0.0, focus[1] - 1.22, focus[2] - 0.02)
        aim_at(cam, mid)
        render(f"meeting{tag}", opts["samples"])
        cam.data.lens = 85
        cam.location = (0.0, focus[1] - 1.0, focus[2])
        aim_at(cam, focus)
        render(f"face{tag}", opts["samples"])
        # Proof that the animation shapes work: mid-sentence, with a smile and raised brows.
        face = svc["face"]
        face.set_expression(base, {"jawOpen": 0.32, "mouthSmileLeft": 0.55, "mouthSmileRight": 0.55,
                                   "browInnerUp": 0.35, "cheekSquintLeft": 0.3, "cheekSquintRight": 0.3,
                                   "mouthUpperUpLeft": 0.2, "mouthUpperUpRight": 0.2})
        face.interpolate_targets(base)
        render(f"speaking{tag}", opts["samples"])
        face.clear_expression(base)
        face.set_expression(base, {"eyeBlinkLeft": 1.0, "eyeBlinkRight": 1.0})
        render(f"blink{tag}", max(24, opts["samples"] // 2))
        face.clear_expression(base)


main()
