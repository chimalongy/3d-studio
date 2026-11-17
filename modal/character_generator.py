"""
Character-generation pipeline implementation.
Integrates with the dedicated Hunyuan3D L4 GPU service when configured,
or returns structured rigged metadata for the Three.js procedural engine.
"""

import os
import urllib.request
import json

HUNYUAN3D_ENDPOINT = os.getenv(
    "HUNYUAN3D_ENDPOINT",
    "https://abisola-mercy-odeshola--hunyuan3d-service-api.us-east.modal.run"
)


def generate_character(spec: dict) -> dict:
    name = spec.get("name", "Character")
    style = spec.get("style", "stylized")
    desc = spec.get("visual_identity") or spec.get("description", "")
    endpoint = os.getenv("HUNYUAN3D_ENDPOINT", HUNYUAN3D_ENDPOINT)

    # 1. If dedicated Hunyuan3D L4 Service is active, forward generation to it
    if endpoint:
        try:
            req = urllib.request.Request(
                f"{endpoint.rstrip('/')}/generate",
                data=json.dumps({"prompt": desc, "character_name": name, "style": style}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if data.get("ok"):
                    res = data.get("result", {})
                    return {
                        "characterName": name,
                        "style": style,
                        "glbUrl": res.get("glbUrl"),
                        "assetUrl": res.get("glbUrl"),
                        "previewUrl": res.get("previewUrl"),
                        "engine": "tencent-hunyuan3d-l4",
                        "rigMetadata": {
                            "skeleton": "HumanoidStandardBiped",
                            "bones": [
                                "Root", "Hips", "Spine", "Chest", "Neck", "Head",
                                "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
                                "RightShoulder", "RightArm", "RightForeArm", "RightHand",
                                "LeftUpLeg", "LeftLeg", "LeftFoot",
                                "RightUpLeg", "RightLeg", "RightFoot"
                            ],
                            "vertexCount": 12500,
                            "materials": ["PBR_BaseColor", "PBR_Normal", "PBR_RoughnessMetallic"],
                            "proportions": spec.get("proportions", "standard humanoid"),
                            "palette": spec.get("palette", [])
                        }
                    }
        except Exception as err:
            print(f"Warning: Hunyuan3D service call failed ({err}), falling back to local engine.")

    # 2. Standard Structured Specification for Three.js
    return {
        "characterName": name,
        "style": style,
        "engine": "threejs-procedural",
        "rigMetadata": {
            "skeleton": "HumanoidStandardBiped",
            "bones": [
                "Root", "Hips", "Spine", "Chest", "Neck", "Head",
                "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
                "RightShoulder", "RightArm", "RightForeArm", "RightHand",
                "LeftUpLeg", "LeftLeg", "LeftFoot",
                "RightUpLeg", "RightLeg", "RightFoot"
            ],
            "vertexCount": 1850,
            "materials": ["PrimaryMaterial", "SecondaryMaterial", "AccentMaterial", "EyeGlowMaterial"],
            "proportions": spec.get("proportions", "standard humanoid"),
            "palette": spec.get("palette", ["#737982", "#3d2817", "#588157", "#00f0ff", "#ffd166"])
        }
    }
