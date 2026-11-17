import modal

app = modal.App("test-hy3d")
weights_volume = modal.Volume.from_name("hunyuan3d-weights")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "git",
        "ffmpeg",
        "libgl1",
        "libglib2.0-0",
        "libgomp1",
        "ninja-build",
        "build-essential"
    )
    .pip_install(
        "torch>=2.4.0",
        "torchvision",
        "torchaudio",
        extra_index_url="https://download.pytorch.org/whl/cu121"
    )
    .pip_install(
        "transformers==4.46.3",
        "diffusers==0.31.0",
        "accelerate>=0.33.0",
        "trimesh>=4.4.0",
        "einops>=0.8.0",
        "huggingface_hub>=0.24.0",
        "pymeshlab>=2023.12",
        "scipy>=1.13.0",
        "imageio>=2.34.0",
        "Pillow>=10.4.0",
        "opencv-python-headless",
        "rembg",
        "onnxruntime",
        "pybind11",
        "pygltflib",
        "xatlas",
        "omegaconf"
    )
    .run_commands("git clone https://github.com/Tencent/Hunyuan3D-2.git /root/Hunyuan3D-2")
)

@app.function(
    image=image,
    gpu=["A10G", "L4"],
    timeout=900,
    volumes={"/weights": weights_volume}
)
def test_generate_mesh(prompt: str):
    import sys
    sys.path.append("/root/Hunyuan3D-2")
    import os
    import time
    import torch
    from PIL import Image
    import rembg
    from diffusers import AutoPipelineForText2Image
    from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline

    print(f"[{time.strftime('%X')}] Generating concept image with SD-turbo...")
    t2i = AutoPipelineForText2Image.from_pretrained(
        "stabilityai/sd-turbo",
        torch_dtype=torch.float16,
        variant="fp16"
    ).to("cuda")
    
    t2i_prompt = f"Full body 3D character asset render of {prompt}, standing pose, centered, solid clean plain white background, vibrant colors, game ready asset"
    concept_img = t2i(prompt=t2i_prompt, num_inference_steps=1, guidance_scale=0.0).images[0]
    
    # Remove background with rembg
    print(f"[{time.strftime('%X')}] Removing background with rembg...")
    cutout = rembg.remove(concept_img)
    
    # Free 2D model from GPU memory for 3D model
    del t2i
    torch.cuda.empty_cache()

    print(f"[{time.strftime('%X')}] Loading Hunyuan3D-2 Turbo Pipeline...")
    weights_path = "/weights/hunyuan3d-2"
    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        weights_path,
        subfolder="hunyuan3d-dit-v2-0-turbo",
        device="cuda"
    )

    print(f"[{time.strftime('%X')}] Running 3D Flow Matching generation...")
    mesh = pipeline(
        image=cutout,
        num_inference_steps=20,
        octree_resolution=256
    )[0]

    output_path = "/weights/generated/test_model.glb"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    mesh.export(output_path)
    weights_volume.commit()

    file_size = os.path.getsize(output_path)
    print(f"[{time.strftime('%X')}] Successfully exported 3D GLB! Size: {file_size} bytes, Vertices: {len(mesh.vertices)}, Faces: {len(mesh.faces)}")
    return {
        "status": "completed",
        "file_size": file_size,
        "vertex_count": len(mesh.vertices),
        "face_count": len(mesh.faces)
    }

@app.local_entrypoint()
def main():
    res = test_generate_mesh.remote("Gideon the Clockwork Sentinel with burnished brass plates and glowing seafoam eyes")
    print("Result:", res)
