"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  createVolcanicPBRMaterial,
  applyPose
} from "../lib/characterRigging.js";

function hasUsableSkinning(scene) {
  let found = false;
  scene.traverse((node) => {
    if (
      node.isSkinnedMesh &&
      node.skeleton?.bones?.length &&
      node.geometry?.attributes?.skinIndex &&
      node.geometry?.attributes?.skinWeight
    ) {
      found = true;
    }
  });
  return found;
}

function findAuthoredHumanoidHierarchy(scene) {
  const expectedNames = [
    "Root", "Hips", "Spine", "Chest", "Neck", "Head",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot",
    "RightUpLeg", "RightLeg", "RightFoot"
  ];
  const bonesMap = {};
  scene.traverse((node) => {
    if (expectedNames.includes(node.name)) {
      bonesMap[node.name] = node;
      // GLTF files do not preserve arbitrary userData. Capture the actual
      // loaded bind transform so pose resets never snap a joint to the origin.
      node.userData.initialPosition = node.position.clone();
      node.userData.initialQuaternion = node.quaternion.clone();
      node.userData.initialScale = node.scale.clone();
    }
  });

  const required = ["Root", "Hips", "Spine", "Chest", "Head"];
  return required.every((name) => bonesMap[name]) ? bonesMap : null;
}

function createNamedHierarchyHelper(scene, bonesMap) {
  const pairs = Object.values(bonesMap).filter((node) => bonesMap[node.parent?.name] === node.parent);
  if (!pairs.length) return null;

  const positions = new Float32Array(pairs.length * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: 0x7dd3fc });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.userData.update = () => {
    const parentPosition = new THREE.Vector3();
    const childPosition = new THREE.Vector3();
    const attribute = geometry.attributes.position;
    pairs.forEach((child, index) => {
      child.parent.getWorldPosition(parentPosition);
      child.getWorldPosition(childPosition);
      attribute.setXYZ(index * 2, parentPosition.x, parentPosition.y, parentPosition.z);
      attribute.setXYZ(index * 2 + 1, childPosition.x, childPosition.y, childPosition.z);
    });
    attribute.needsUpdate = true;
  };
  lines.userData.update();
  scene.add(lines);
  return lines;
}

function disposeMaterial(material) {
  const list = Array.isArray(material) ? material : [material];
  list.filter(Boolean).forEach((item) => {
    for (const value of Object.values(item)) {
      if (value?.isTexture) value.dispose();
    }
    item.dispose?.();
  });
}

export default function Model3DViewer({ glbUrl, characterName }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [materialMode, setMaterialMode] = useState("original");
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [currentPose, setCurrentPose] = useState("idle");
  const [vertexStats, setVertexStats] = useState(null);
  const [rigMode, setRigMode] = useState("loading");

  const rigRef = useRef(null);
  const materialsRef = useRef({});
  const skeletonHelperRef = useRef(null);
  const currentPoseRef = useRef(currentPose);
  const materialModeRef = useRef(materialMode);
  const showSkeletonRef = useRef(showSkeleton);

  useEffect(() => { currentPoseRef.current = currentPose; }, [currentPose]);
  useEffect(() => { showSkeletonRef.current = showSkeleton; }, [showSkeleton]);

  useEffect(() => {
    materialModeRef.current = materialMode;
    const rig = rigRef.current;
    if (!rig) return;
    for (const mesh of rig.meshes || []) {
      if (materialMode === "original") {
        mesh.material = mesh.userData.originalMaterial;
      } else if (materialMode === "clay") {
        mesh.material = materialsRef.current.clay;
      } else if (materialMode === "wireframe") {
        mesh.material = materialsRef.current.wireframe;
      } else {
        mesh.material = materialsRef.current.volcanic;
      }
    }
  }, [materialMode]);

  useEffect(() => {
    if (!glbUrl || !containerRef.current) return undefined;

    let renderer;
    let scene;
    let camera;
    let controls;
    let animationFrame;
    let resizeObserver;
    let mixer = null;
    let modelRoot = null;
    let disposed = false;
    const ownedMaterials = [];
    const container = containerRef.current;

    setLoading(true);
    setLoadError(null);
    setRigMode("loading");
    setVertexStats(null);
    rigRef.current = null;
    skeletonHelperRef.current = null;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight || 480, 1);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0d14);

    const grid = new THREE.GridHelper(12, 24, 0x475569, 0x1e293b);
    grid.position.y = -1;
    scene.add(grid);

    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1.6, 3.8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controls.minDistance = 1;
    controls.maxDistance = 12;
    controls.target.set(0, 0.15, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const keyLight = new THREE.DirectionalLight(0xffeedd, 2.0);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x60a5fa, 1.4);
    rimLight.position.set(-3, 3, -3);
    scene.add(rimLight);
    const fillLight = new THREE.PointLight(0xff8a45, 1.2, 8);
    fillLight.position.set(0, -0.4, 1.2);
    scene.add(fillLight);

    const { material: volcanicMaterial } = createVolcanicPBRMaterial();
    const clayMaterial = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, roughness: 0.72, metalness: 0.06
    });
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, wireframe: true
    });
    materialsRef.current = {
      volcanic: volcanicMaterial,
      clay: clayMaterial,
      wireframe: wireframeMaterial
    };
    ownedMaterials.push(volcanicMaterial, clayMaterial, wireframeMaterial);

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (disposed) return;

        const sourceScene = gltf.scene;
        sourceScene.updateMatrixWorld(true);
        const sourceRootInverse = sourceScene.matrixWorld.clone().invert();

        // Work in the GLTF scene's own local space so rig bones and baked
        // mesh vertices share one coordinate system, even with root transforms.
        const sourceBounds = new THREE.Box3()
          .setFromObject(sourceScene)
          .applyMatrix4(sourceRootInverse);
        if (sourceBounds.isEmpty()) {
          setLoadError("The GLB contains no visible mesh geometry.");
          setLoading(false);
          return;
        }

        const size = sourceBounds.getSize(new THREE.Vector3());
        const center = sourceBounds.getCenter(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, size.z);
        const scale = maxDimension > 0 ? 2 / maxDimension : 1;

        modelRoot = new THREE.Group();
        modelRoot.name = "NormalizedCharacterRoot";
        modelRoot.scale.setScalar(scale);
        modelRoot.position.set(
          -center.x * scale,
          -1 - sourceBounds.min.y * scale,
          -center.z * scale
        );
        scene.add(modelRoot);

        const nativeRig = hasUsableSkinning(sourceScene);
        const authoredBonesMap = nativeRig ? null : findAuthoredHumanoidHierarchy(sourceScene);
        const renderMeshes = [];
        let totalVertices = 0;
        let totalFaces = 0;

        if (nativeRig || authoredBonesMap) {
          // Preserve the complete authored GLTF hierarchy, all mesh parts,
          // materials, skin weights, bone indices and any source animations.
          modelRoot.add(sourceScene);
          sourceScene.traverse((node) => {
            if (!node.isMesh) return;
            renderMeshes.push(node);
            node.userData.originalMaterial = node.material;
            totalVertices += node.geometry?.attributes?.position?.count || 0;
            const geometry = node.geometry;
            totalFaces += geometry?.index
              ? geometry.index.count / 3
              : (geometry?.attributes?.position?.count || 0) / 3;
          });

          if (nativeRig && gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(sourceScene);
            const clip = gltf.animations[0];
            mixer.clipAction(clip).reset().play();
          }

          const firstSkinned = renderMeshes.find((node) => node.isSkinnedMesh);
          const authoredRoot = authoredBonesMap?.Root || null;
          if (firstSkinned) {
            const helper = new THREE.SkeletonHelper(firstSkinned);
            helper.visible = showSkeletonRef.current;
            scene.add(helper);
            skeletonHelperRef.current = helper;
          } else if (authoredRoot) {
            const helper = createNamedHierarchyHelper(scene, authoredBonesMap);
            if (helper) {
              helper.visible = showSkeletonRef.current;
              skeletonHelperRef.current = helper;
            }
          }

          rigRef.current = { meshes: renderMeshes, bonesMap: authoredBonesMap };
          setRigMode(
            nativeRig
              ? (gltf.animations?.length ? "native-animation" : "native-rig")
              : "authored-rig"
          );
        } else {
          // Static generated meshes have no reliable joint weights. Preserve
          // their authored geometry rather than deforming them with guessed weights.
          modelRoot.add(sourceScene);
          sourceScene.traverse((node) => {
            if (!node.isMesh) return;
            renderMeshes.push(node);
            node.userData.originalMaterial = node.material;
            totalVertices += node.geometry?.attributes?.position?.count || 0;
            const geometry = node.geometry;
            totalFaces += geometry?.index
              ? geometry.index.count / 3
              : (geometry?.attributes?.position?.count || 0) / 3;
          });

          if (!renderMeshes.length) {
            setLoadError("The GLB contains no supported triangle meshes.");
            setLoading(false);
            return;
          }

          if (gltf.animations?.length) {
            mixer = new THREE.AnimationMixer(sourceScene);
            mixer.clipAction(gltf.animations[0]).reset().play();
          }

          rigRef.current = { meshes: renderMeshes };
          setRigMode(gltf.animations?.length ? "native-animation" : "static-mesh");
        }

        for (const mesh of renderMeshes) {
          if (!mesh.userData.originalMaterial) {
            mesh.userData.originalMaterial = mesh.material;
          }
        }

        // Apply the selected shader without changing the original source materials.
        const selectedMode = materialModeRef.current;
        for (const mesh of rigRef.current?.meshes || []) {
          if (selectedMode === "clay") mesh.material = clayMaterial;
          else if (selectedMode === "wireframe") mesh.material = wireframeMaterial;
          else if (selectedMode === "volcanic") mesh.material = volcanicMaterial;
          else mesh.material = mesh.userData.originalMaterial;
        }

        setVertexStats({ vertices: totalVertices, faces: totalFaces });
        setLoading(false);
      },
      undefined,
      (error) => {
        if (disposed) return;
        console.error("Error loading 3D model:", error);
        setLoadError("Could not load the 3D GLB file. Check that the asset URL is accessible and contains valid GLB data.");
        setLoading(false);
      }
    );

    const clock = new THREE.Clock();
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      if (mixer) {
        mixer.update(delta);
      } else if (rigRef.current?.bonesMap) {
        applyPose(rigRef.current.bonesMap, currentPoseRef.current, elapsed);
      }

      if (modelRoot) modelRoot.updateMatrixWorld(true);
      if (skeletonHelperRef.current && showSkeletonRef.current) {
        if (skeletonHelperRef.current.userData.update) skeletonHelperRef.current.userData.update();
        else skeletonHelperRef.current.update();
      }

      const pulse = 1.15 + Math.sin(elapsed * 1.8) * 0.12;
      volcanicMaterial.emissiveIntensity = pulse;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !renderer) return;
      const nextWidth = Math.max(container.clientWidth, 1);
      const nextHeight = Math.max(container.clientHeight || 480, 1);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    } else {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      disposed = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
      controls?.dispose();
      mixer?.stopAllAction();
      if (skeletonHelperRef.current) {
        scene.remove(skeletonHelperRef.current);
        skeletonHelperRef.current.geometry?.dispose?.();
        disposeMaterial(skeletonHelperRef.current.material);
        skeletonHelperRef.current = null;
      }
      // Dispose only viewer-owned generated materials.
      ownedMaterials.forEach((material) => disposeMaterial(material));
      renderer?.dispose();
      if (renderer?.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      rigRef.current = null;
    };
  }, [glbUrl]);

  return (
    <div className="space-y-3">
      <div className="relative w-full h-[480px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shadow-2xl">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {loading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <div className="w-9 h-9 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-300 font-medium">
              Loading all model parts and validating the character rig...
            </span>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-sm text-rose-300">{loadError}</p>
            <a href={glbUrl} target="_blank" rel="noreferrer" className="text-xs text-violet-300 underline mt-1">
              Download / View {characterName || "Character"} .glb directly
            </a>
          </div>
        )}

        {!loading && vertexStats && (
          <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-center gap-3 pointer-events-none">
            <span><strong>{vertexStats.vertices.toLocaleString()}</strong> Vertices</span>
            <span className="text-slate-600">|</span>
            <span><strong>{Math.round(vertexStats.faces).toLocaleString()}</strong> Polygons</span>
          </div>
        )}

        {!loading && !loadError && (
          <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 pointer-events-none">
            Rotate: Left Click · Pan: Right Click · Zoom: Scroll
          </div>
        )}
      </div>

      {!loading && !loadError && (
        <div className="panel p-4 flex flex-wrap items-center justify-between gap-4 border border-slate-800 bg-slate-900/60 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Shader:</span>
            <div className="flex rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 p-0.5 text-xs">
              {[
                ["original", "Original"],
                ["volcanic", "Volcanic PBR"],
                ["clay", "Digital Clay"],
                ["wireframe", "Wireframe"]
              ].map(([mode, label]) => (
                <button key={mode} onClick={() => setMaterialMode(mode)}
                  className={`px-3 py-1 rounded-md transition font-medium ${materialMode === mode ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-white"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {rigMode !== "static-mesh" && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer select-none bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-700/80 hover:border-violet-500 transition">
                <input type="checkbox" checked={showSkeleton} onChange={(event) => setShowSkeleton(event.target.checked)}
                  className="rounded border border-slate-700 text-violet-600 focus:ring-0 cursor-pointer" />
                <span>Show Bones / Rig</span>
              </label>
            </div>
          )}

          {rigMode === "authored-rig" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pose:</span>
              <div className="flex rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 p-0.5 text-xs">
                {[
                  ["rest", "Neutral"],
                  ["idle", "Idle"],
                  ["combat", "Combat"],
                  ["slam", "Slam"]
                ].map(([pose, label]) => (
                  <button key={pose} onClick={() => setCurrentPose(pose)}
                    className={`px-3 py-1 rounded-md transition font-medium ${currentPose === pose ? "bg-violet-600 text-white shadow" : "text-slate-400 hover:text-white"}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <span className="text-[11px] text-slate-500">
            {rigMode === "authored-rig"
              ? "Original bone-parented mesh hierarchy preserved"
              : rigMode === "native-animation"
                ? "Original GLTF animation preserved"
                : rigMode === "static-mesh"
                  ? "Original static mesh preserved · no rig data"
                  : "Original GLTF skinning preserved"}
          </span>
        </div>
      )}
    </div>
  );
}
