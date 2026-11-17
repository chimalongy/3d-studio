import * as THREE from "three";

/**
 * Creates a standard Humanoid Skeleton and computes smooth distance-weighted skinning
 * with anatomical limb partitioning and bone-segment projection to prevent mesh distortion.
 */
export function buildHumanoidRig(input = {}) {
  // Accept a BufferGeometry, a mesh, or { geometry, bounds }.
  const geometry = input?.isBufferGeometry
    ? input
    : input?.geometry?.attributes?.position
      ? input.geometry
      : null;
  if (!geometry?.attributes?.position) {
    throw new Error("buildHumanoidRig requires a BufferGeometry with a position attribute.");
  }

  geometry.computeBoundingBox();
  const bounds = input?.bounds?.isBox3 ? input.bounds.clone() : geometry.boundingBox.clone();
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(size.y, 1e-4);
  const width = Math.max(size.x, height * 0.35, 1e-4);
  const depth = Math.max(size.z, height * 0.2, 1e-4);
  const minY = bounds.min.y;

  const bones = [];
  const bonesMap = {};
  const addBone = (name, parent, position) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.copy(position);
    bone.userData.initialPosition = position.clone();
    bone.userData.initialQuaternion = bone.quaternion.clone();
    bone.userData.initialScale = bone.scale.clone();
    if (parent) parent.add(bone);
    bones.push(bone);
    bonesMap[name] = bone;
    return bone;
  };

  // The rig is built in the same local coordinate space as the normalized model.
  const root = addBone("Root", null, new THREE.Vector3(center.x, minY, center.z));
  const hips = addBone("Hips", root, new THREE.Vector3(0, height * 0.48, 0));
  const spine = addBone("Spine", hips, new THREE.Vector3(0, height * 0.17, 0));
  const chest = addBone("Chest", spine, new THREE.Vector3(0, height * 0.17, 0));
  const neck = addBone("Neck", chest, new THREE.Vector3(0, height * 0.10, 0));
  addBone("Head", neck, new THREE.Vector3(0, height * 0.07, 0));

  const shoulderX = width * 0.19;
  const armDrop = height * 0.035;
  for (const side of ["Left", "Right"]) {
    const sign = side === "Left" ? 1 : -1;
    const shoulder = addBone(
      `${side}Shoulder`,
      chest,
      new THREE.Vector3(sign * shoulderX, height * 0.055, 0)
    );
    const upperArm = addBone(
      `${side}Arm`,
      shoulder,
      new THREE.Vector3(sign * width * 0.11, -armDrop, 0)
    );
    const foreArm = addBone(
      `${side}ForeArm`,
      upperArm,
      new THREE.Vector3(sign * width * 0.13, -height * 0.17, 0)
    );
    addBone(
      `${side}Hand`,
      foreArm,
      new THREE.Vector3(sign * width * 0.055, -height * 0.15, 0)
    );

    const upperLeg = addBone(
      `${side}UpLeg`,
      hips,
      new THREE.Vector3(sign * width * 0.105, -height * 0.045, 0)
    );
    const lowerLeg = addBone(
      `${side}Leg`,
      upperLeg,
      new THREE.Vector3(0, -height * 0.22, 0)
    );
    addBone(
      `${side}Foot`,
      lowerLeg,
      new THREE.Vector3(0, -height * 0.19, depth * 0.07)
    );
  }

  root.updateMatrixWorld(true);
  const world = {};
  for (const [name, bone] of Object.entries(bonesMap)) {
    world[name] = bone.getWorldPosition(new THREE.Vector3());
  }

  const segments = [
    { name: "Root", a: world.Root, b: world.Hips, region: "torso", side: 0 },
    { name: "Hips", a: world.Hips, b: world.Spine, region: "torso", side: 0 },
    { name: "Spine", a: world.Spine, b: world.Chest, region: "torso", side: 0 },
    { name: "Chest", a: world.Chest, b: world.Neck, region: "torso", side: 0 },
    { name: "Neck", a: world.Neck, b: world.Head, region: "head", side: 0 },
    { name: "Head", a: world.Head, b: world.Head.clone().add(new THREE.Vector3(0, height * 0.12, 0)), region: "head", side: 0 }
  ];

  for (const side of ["Left", "Right"]) {
    const sign = side === "Left" ? 1 : -1;
    segments.push(
      { name: `${side}Shoulder`, a: world.Chest, b: world[`${side}Shoulder`], region: "arm", side: sign },
      { name: `${side}Arm`, a: world[`${side}Shoulder`], b: world[`${side}ForeArm`], region: "arm", side: sign },
      { name: `${side}ForeArm`, a: world[`${side}ForeArm`], b: world[`${side}Hand`], region: "arm", side: sign },
      { name: `${side}Hand`, a: world[`${side}Hand`], b: world[`${side}Hand`].clone().add(new THREE.Vector3(sign * width * 0.08, -height * 0.025, 0)), region: "arm", side: sign },
      { name: `${side}UpLeg`, a: world.Hips, b: world[`${side}Leg`], region: "leg", side: sign },
      { name: `${side}Leg`, a: world[`${side}Leg`], b: world[`${side}Foot`], region: "leg", side: sign },
      { name: `${side}Foot`, a: world[`${side}Foot`], b: world[`${side}Foot`].clone().add(new THREE.Vector3(0, 0, depth * 0.14)), region: "leg", side: sign }
    );
  }

  const distanceToSegment = (point, a, b) => {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(point, a);
    const lengthSq = ab.lengthSq();
    if (lengthSq < 1e-10) return point.distanceTo(a);
    const t = THREE.MathUtils.clamp(ap.dot(ab) / lengthSq, 0, 1);
    return point.distanceTo(a.clone().addScaledVector(ab, t));
  };

  const applySkinWeights = (targetGeometry) => {
    const position = targetGeometry?.attributes?.position;
    if (!position) throw new Error("Cannot skin geometry without vertex positions.");
    const indices = new Uint16Array(position.count * 4);
    const weights = new Float32Array(position.count * 4);
    const point = new THREE.Vector3();
    const hipY = world.Hips.y;
    const chestY = world.Chest.y;
    const shoulderBand = height * 0.08;
    const blendSigma = Math.max(height * 0.075, 0.015);

    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      const relativeX = point.x - center.x;
      const side = relativeX >= 0 ? 1 : -1;
      const absX = Math.abs(relativeX);
      const belowHips = point.y < hipY - height * 0.045;
      const upperBody = point.y > chestY + shoulderBand;
      const lateralArm = absX > width * 0.205 && point.y > hipY - height * 0.10 && !upperBody;

      let candidates;
      if (belowHips) {
        candidates = segments.filter((segment) =>
          segment.region === "leg" && segment.side === side ||
          segment.name === "Hips" || segment.name === "Root"
        );
      } else if (lateralArm) {
        candidates = segments.filter((segment) =>
          segment.region === "arm" && segment.side === side ||
          (absX < width * 0.29 && segment.name === "Chest")
        );
      } else if (upperBody) {
        candidates = segments.filter((segment) =>
          segment.region === "head" || segment.name === "Chest" || segment.name === "Spine"
        );
      } else {
        candidates = segments.filter((segment) =>
          segment.region === "torso" ||
          (absX > width * 0.14 && segment.region === "arm" && segment.side === side)
        );
      }

      if (!candidates.length) candidates = segments;
      const ranked = candidates
        .map((segment) => ({
          index: bones.indexOf(bonesMap[segment.name]),
          distance: distanceToSegment(point, segment.a, segment.b)
        }))
        .filter((item) => item.index >= 0)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 4);

      const nearest = ranked[0]?.distance ?? 0;
      const influence = ranked.map((item) => Math.exp(
        -Math.pow(Math.max(0, item.distance - nearest), 2) / (2 * blendSigma * blendSigma)
      ));
      const total = influence.reduce((sum, value) => sum + value, 0) || 1;

      for (let slot = 0; slot < 4; slot++) {
        const item = ranked[slot];
        indices[i * 4 + slot] = item ? item.index : (ranked[0]?.index ?? 0);
        weights[i * 4 + slot] = item ? influence[slot] / total : 0;
      }
    }

    targetGeometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    targetGeometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    targetGeometry.attributes.skinIndex.needsUpdate = true;
    targetGeometry.attributes.skinWeight.needsUpdate = true;
    return targetGeometry;
  };

  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  if (geometry) applySkinWeights(geometry);

  return { skeleton, rootBone: root, bonesMap, bones, applySkinWeights, bounds };
}

/**
 * Creates high-detail procedural PBR materials with glowing molten magma fissures.
 */
export function createVolcanicPBRMaterial() {
  // 1. Procedural Obsidian Basalt Canvas Texture
  const canvasSize = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext("2d");

  // Base basalt stone
  ctx.fillStyle = "#16181d";
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  // Layer fine volcanic mineral flecks
  for (let i = 0; i < 40000; i++) {
    const x = Math.random() * canvasSize;
    const y = Math.random() * canvasSize;
    const gray = Math.floor(20 + Math.random() * 35);
    ctx.fillStyle = `rgb(${gray}, ${gray + 2}, ${gray + 6})`;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  // Draw dark jagged basalt cracks
  ctx.strokeStyle = "#0b0c0f";
  ctx.lineWidth = 3;
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    let cx = Math.random() * canvasSize;
    let cy = Math.random() * canvasSize;
    ctx.moveTo(cx, cy);
    for (let j = 0; j < 8; j++) {
      cx += (Math.random() - 0.5) * 80;
      cy += (Math.random() - 0.5) * 80;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  const baseTexture = new THREE.CanvasTexture(canvas);
  baseTexture.wrapS = THREE.RepeatWrapping;
  baseTexture.wrapT = THREE.RepeatWrapping;
  baseTexture.repeat.set(4, 4);

  // 2. Glowing Molten Magma Emissive Texture
  const emissiveCanvas = document.createElement("canvas");
  emissiveCanvas.width = canvasSize;
  emissiveCanvas.height = canvasSize;
  const eCtx = emissiveCanvas.getContext("2d");

  // Pure black background (non-emissive rock)
  eCtx.fillStyle = "#000000";
  eCtx.fillRect(0, 0, canvasSize, canvasSize);

  // Draw blazing branched molten magma fissures
  function drawMagmaVein(startX, startY, branches) {
    eCtx.strokeStyle = "#ff4500";
    eCtx.lineWidth = 6;
    eCtx.shadowColor = "#ff2200";
    eCtx.shadowBlur = 12;

    let x = startX;
    let y = startY;
    eCtx.beginPath();
    eCtx.moveTo(x, y);

    for (let step = 0; step < 14; step++) {
      x += (Math.random() - 0.5) * 110;
      y += (Math.random() - 0.45) * 110;
      eCtx.lineTo(x, y);

      if (branches > 0 && Math.random() > 0.65) {
        drawMagmaVein(x, y, branches - 1);
      }
    }
    eCtx.stroke();

    // Hot golden core inside the vein
    eCtx.strokeStyle = "#ffdd33";
    eCtx.lineWidth = 2.5;
    eCtx.shadowColor = "#ffaa00";
    eCtx.shadowBlur = 6;
    eCtx.stroke();
  }

  for (let i = 0; i < 28; i++) {
    drawMagmaVein(Math.random() * canvasSize, Math.random() * canvasSize, 2);
  }

  const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas);
  emissiveTexture.wrapS = THREE.RepeatWrapping;
  emissiveTexture.wrapT = THREE.RepeatWrapping;
  emissiveTexture.repeat.set(3, 3);

  // 3. PBR Standard Material
  const material = new THREE.MeshStandardMaterial({
    color: 0x1f232b,
    map: baseTexture,
    emissive: 0xff4500,
    emissiveMap: emissiveTexture,
    emissiveIntensity: 1.6,
    roughness: 0.82,
    metalness: 0.18,
    bumpMap: baseTexture,
    bumpScale: 0.04
  });

  return { material, emissiveMap: emissiveTexture };
}

/**
 * Applies procedural animation poses to the skeleton bones.
 */
export function applyPose(bonesMap, poseName, time = 0) {
  if (!bonesMap) return;

  const t = time;

  // 1. Reset all bones to their neutral bind pose & initial translation
  for (const key in bonesMap) {
    const bone = bonesMap[key];
    if (bone.userData.initialQuaternion) {
      bone.quaternion.copy(bone.userData.initialQuaternion);
    } else {
      bone.rotation.set(0, 0, 0);
    }
    if (bone.userData.initialScale) {
      bone.scale.copy(bone.userData.initialScale);
    } else {
      bone.scale.set(1, 1, 1);
    }
    if (bone.userData.initialPosition) {
      bone.position.copy(bone.userData.initialPosition);
    }
  }

  const hipsInitY = bonesMap.Hips?.userData.initialPosition?.y || 0;

  switch (poseName) {
    case "idle": {
      // Heavy Golem Idle Breathing
      const breath = Math.sin(t * 1.8);
      if (bonesMap.Spine) bonesMap.Spine.rotation.x = breath * 0.02;
      if (bonesMap.Chest) {
        bonesMap.Chest.rotation.x = breath * 0.06;
        bonesMap.Chest.scale.set(1 + breath * 0.02, 1 + breath * 0.015, 1 + breath * 0.02);
      }
      if (bonesMap.Head) bonesMap.Head.rotation.x = -breath * 0.015;
      if (bonesMap.LeftArm) {
        bonesMap.LeftArm.rotation.z = 0.10 + breath * 0.01;
        bonesMap.LeftArm.rotation.x = 0.035;
      }
      if (bonesMap.RightArm) {
        bonesMap.RightArm.rotation.z = -0.10 - breath * 0.01;
        bonesMap.RightArm.rotation.x = 0.035;
      }
      if (bonesMap.LeftForeArm) bonesMap.LeftForeArm.rotation.x = 0.12 + breath * 0.015;
      if (bonesMap.RightForeArm) bonesMap.RightForeArm.rotation.x = 0.12 + breath * 0.015;
      break;
    }

    case "combat": {
      // Low wide-stance combat ready
      if (bonesMap.Hips) bonesMap.Hips.position.y = hipsInitY - 0.035;
      if (bonesMap.Spine) bonesMap.Spine.rotation.x = 0.08;
      if (bonesMap.Chest) bonesMap.Chest.rotation.x = 0.055;
      if (bonesMap.Head) bonesMap.Head.rotation.x = -0.08;

      // Bent knees for solid stance
      if (bonesMap.LeftUpLeg) {
        bonesMap.LeftUpLeg.rotation.x = 0.16;
        bonesMap.LeftUpLeg.rotation.y = 0.15;
      }
      if (bonesMap.LeftLeg) bonesMap.LeftLeg.rotation.x = -0.25;

      if (bonesMap.RightUpLeg) {
        bonesMap.RightUpLeg.rotation.x = -0.10;
        bonesMap.RightUpLeg.rotation.y = -0.25;
      }
      if (bonesMap.RightLeg) bonesMap.RightLeg.rotation.x = -0.18;

      // Heavy boulder fists raised defensively
      if (bonesMap.LeftArm) {
        bonesMap.LeftArm.rotation.x = 0.30;
        bonesMap.LeftArm.rotation.z = 0.35;
      }
      if (bonesMap.LeftForeArm) bonesMap.LeftForeArm.rotation.x = 0.42;

      if (bonesMap.RightArm) {
        bonesMap.RightArm.rotation.x = 0.32;
        bonesMap.RightArm.rotation.z = -0.45;
      }
      if (bonesMap.RightForeArm) bonesMap.RightForeArm.rotation.x = 0.48;
      break;
    }

    case "slam": {
      // Heavy 3-Phase Ground Slam Choreography (Windup Overhead -> Seismic Smash -> Tremor Recovery)
      const speed = 1.4;
      const progress = ((t * speed) / (Math.PI * 2)) % 1;

      if (progress < 0.52) {
        // --- PHASE 1: WIND-UP & OVERHEAD COIL (0.0 -> 0.52) ---
        // Progress within windup: 0.0 -> 1.0
        const u = progress / 0.52;
        // Smooth sine ease-out: slow and imposing as arms reach maximum height
        const ease = Math.sin((u * Math.PI) / 2);

        // Torso arches slightly back to gather seismic kinetic torque
        if (bonesMap.Hips) bonesMap.Hips.position.y = hipsInitY - ease * 0.06;
        if (bonesMap.Spine) bonesMap.Spine.rotation.x = -ease * 0.08;
        if (bonesMap.Chest) bonesMap.Chest.rotation.x = -ease * 0.07;
        if (bonesMap.Head) bonesMap.Head.rotation.x = ease * 0.14; // Roaring skyward

        // Legs bend in a loaded power squat
        if (bonesMap.LeftUpLeg) {
          bonesMap.LeftUpLeg.rotation.x = ease * 0.10;
          bonesMap.LeftUpLeg.rotation.y = ease * 0.10;
        }
        if (bonesMap.LeftLeg) bonesMap.LeftLeg.rotation.x = -ease * 0.18;

        if (bonesMap.RightUpLeg) {
          bonesMap.RightUpLeg.rotation.x = ease * 0.10;
          bonesMap.RightUpLeg.rotation.y = -ease * 0.10;
        }
        if (bonesMap.RightLeg) bonesMap.RightLeg.rotation.x = -ease * 0.18;

        // Shoulders lift naturally with arm elevation
        if (bonesMap.LeftShoulder) {
          bonesMap.LeftShoulder.rotation.z = ease * 0.10;
          bonesMap.LeftShoulder.rotation.x = ease * 0.12;
        }
        if (bonesMap.RightShoulder) {
          bonesMap.RightShoulder.rotation.z = -ease * 0.10;
          bonesMap.RightShoulder.rotation.x = ease * 0.12;
        }

        // Upper Arms raise high overhead in natural abduction & forward elevation
        if (bonesMap.LeftArm) {
          bonesMap.LeftArm.rotation.z = ease * 0.55; // Raises arm UP towards ceiling
          bonesMap.LeftArm.rotation.x = ease * 0.12; // Slight forward tilt (never backwards)
          bonesMap.LeftArm.rotation.y = -ease * 0.14; // Elbow flare
        }
        if (bonesMap.RightArm) {
          bonesMap.RightArm.rotation.z = -ease * 0.55; // Raises right arm UP towards ceiling
          bonesMap.RightArm.rotation.x = ease * 0.12;
          bonesMap.RightArm.rotation.y = ease * 0.14;
        }

        // Forearms angle inwards, bringing the massive boulder hands together directly above head
        if (bonesMap.LeftForeArm) {
          bonesMap.LeftForeArm.rotation.z = ease * 0.28;
          bonesMap.LeftForeArm.rotation.x = ease * 0.10;
        }
        if (bonesMap.RightForeArm) {
          bonesMap.RightForeArm.rotation.z = -ease * 0.28;
          bonesMap.RightForeArm.rotation.x = ease * 0.10;
        }

        // Hands / Fists poised firmly overhead
        if (bonesMap.LeftHand) {
          bonesMap.LeftHand.rotation.z = ease * 0.10;
          bonesMap.LeftHand.rotation.x = ease * 0.07;
        }
        if (bonesMap.RightHand) {
          bonesMap.RightHand.rotation.z = -ease * 0.10;
          bonesMap.RightHand.rotation.x = ease * 0.07;
        }
      } else if (progress < 0.76) {
        // --- PHASE 2: EXPLOSIVE SEISMIC SLAM DOWN (0.52 -> 0.76) ---
        const u = (progress - 0.52) / 0.24;
        // Violent acceleration curve: hammers straight down
        const smash = Math.pow(u, 2.2);

        // Hips sink deep into impact
        if (bonesMap.Hips) bonesMap.Hips.position.y = hipsInitY - smash * 0.10;
        if (bonesMap.Spine) bonesMap.Spine.rotation.x = smash * 0.22;
        if (bonesMap.Chest) bonesMap.Chest.rotation.x = smash * 0.18;
        if (bonesMap.Head) bonesMap.Head.rotation.x = -smash * 0.12;

        // Deep impact squat
        if (bonesMap.LeftUpLeg) bonesMap.LeftUpLeg.rotation.x = smash * 0.24;
        if (bonesMap.LeftLeg) bonesMap.LeftLeg.rotation.x = -smash * 0.32;
        if (bonesMap.RightUpLeg) bonesMap.RightUpLeg.rotation.x = smash * 0.24;
        if (bonesMap.RightLeg) bonesMap.RightLeg.rotation.x = -smash * 0.32;

        // Shoulders brace down
        if (bonesMap.LeftShoulder) bonesMap.LeftShoulder.rotation.z = -smash * 0.12;
        if (bonesMap.RightShoulder) bonesMap.RightShoulder.rotation.z = smash * 0.12;

        // Arms smash forward and down onto the floor
        if (bonesMap.LeftArm) {
          bonesMap.LeftArm.rotation.z = 0.20 - smash * 0.15;
          bonesMap.LeftArm.rotation.x = smash * 0.52;
        }
        if (bonesMap.RightArm) {
          bonesMap.RightArm.rotation.z = -0.20 + smash * 0.15;
          bonesMap.RightArm.rotation.x = smash * 0.52;
        }

        // Forearms drive fists into ground level
        if (bonesMap.LeftForeArm) bonesMap.LeftForeArm.rotation.x = smash * 0.30;
        if (bonesMap.RightForeArm) bonesMap.RightForeArm.rotation.x = smash * 0.30;

        // Fists flat against the ground
        if (bonesMap.LeftHand) bonesMap.LeftHand.rotation.x = smash * 0.18;
        if (bonesMap.RightHand) bonesMap.RightHand.rotation.x = smash * 0.18;
      } else {
        // --- PHASE 3: IMPACT TREMOR & RISE RECOVERY (0.76 -> 1.0) ---
        const u = (progress - 0.76) / 0.24;
        const decay = 1 - u;
        // High frequency vibration simulating ground shockwave
        const tremor = Math.sin(u * Math.PI * 5) * decay * 0.035;

        if (bonesMap.Hips) bonesMap.Hips.position.y = hipsInitY - decay * 0.10 + tremor;
        if (bonesMap.Spine) bonesMap.Spine.rotation.x = decay * 0.22 + tremor;
        if (bonesMap.Chest) bonesMap.Chest.rotation.x = decay * 0.18;
        if (bonesMap.Head) bonesMap.Head.rotation.x = -decay * 0.12;

        if (bonesMap.LeftArm) {
          bonesMap.LeftArm.rotation.x = decay * 0.52;
          bonesMap.LeftArm.rotation.z = 0.20 * decay;
        }
        if (bonesMap.RightArm) {
          bonesMap.RightArm.rotation.x = decay * 0.52;
          bonesMap.RightArm.rotation.z = -0.20 * decay;
        }
        if (bonesMap.LeftForeArm) bonesMap.LeftForeArm.rotation.x = decay * 0.30;
        if (bonesMap.RightForeArm) bonesMap.RightForeArm.rotation.x = decay * 0.30;

        if (bonesMap.LeftHand) bonesMap.LeftHand.rotation.x = decay * 0.18;
        if (bonesMap.RightHand) bonesMap.RightHand.rotation.x = decay * 0.18;
      }
      break;
    }

    case "rest":
    default:
      // Neutral T-Pose / Bind pose
      break;
  }
}

