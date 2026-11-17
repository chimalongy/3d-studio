import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "fs/promises";
import path from "path";

// Ensure Node.js environment has FileReader polyfill for Three.js GLTFExporter
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class NodeFileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (typeof this.onloadend === "function") this.onloadend();
      }).catch((err) => {
        if (typeof this.onerror === "function") this.onerror(err);
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = "data:" + (blob.type || "application/octet-stream") + ";base64," + Buffer.from(buf).toString("base64");
        if (typeof this.onloadend === "function") this.onloadend();
      }).catch((err) => {
        if (typeof this.onerror === "function") this.onerror(err);
      });
    }
  };
}

const DESCRIPTIVE_COLORS = {
  "river stone": "#737982",
  "stone": "#737982",
  "granite": "#626770",
  "bark": "#3d2817",
  "oak": "#4a3319",
  "wood": "#5c3d2e",
  "brown": "#4a3525",
  "moss": "#588157",
  "lime": "#70e000",
  "green": "#40916c",
  "turquoise": "#00f5d4",
  "luminous turquoise": "#00f0ff",
  "cyan": "#00e5ff",
  "buttercup": "#ffd166",
  "yellow": "#ffea00",
  "deep navy": "#0d1b2a",
  "navy": "#1d2d44",
  "space": "#0f172a",
  "bone": "#e0e1dd",
  "white": "#f8f9fa",
  "tungsten": "#415a77",
  "gray": "#70757d",
  "grey": "#70757d",
  "amber": "#fb8500",
  "orange": "#ffb703",
  "brass": "#d4af37",
  "copper": "#b87333",
  "bronze": "#cd7f32",
  "warm bronze": "#b06d2c",
  "teal": "#008080",
  "oxidized copper": "#4e9a8f",
  "seafoam": "#5eead4",
  "mahogany": "#4a1914",
  "rust": "#b7410e",
  "gold": "#d4af37",
  "silver": "#c0c0c0",
  "iron": "#43464b",
  "steel": "#71797e",
  "red": "#e63946",
  "purple": "#7209b7",
  "violet": "#8338ec",
  "blue": "#3a86ff",
  "black": "#1b263b"
};

/**
 * Normalizes color hex strings, descriptions, or names into THREE.Color
 */
function parseColor(input, fallback = 0x888888) {
  if (!input) return new THREE.Color(fallback);
  try {
    const col = new THREE.Color();
    const str = String(input).trim().toLowerCase();
    if (str.startsWith("#")) {
      col.set(str);
      return col;
    }

    // Check descriptive palette keywords
    for (const [phrase, hex] of Object.entries(DESCRIPTIVE_COLORS)) {
      if (str.includes(phrase)) {
        col.set(hex);
        return col;
      }
    }

    // Try standard CSS name
    col.set(str);
    return col;
  } catch {
    return new THREE.Color(fallback);
  }
}

/**
 * Parses palette from spec into an array of THREE.Color
 */
function extractPalette(spec) {
  const defaultColors = [0x787878, 0x4a3525, 0x6db33f, 0x00f0ff, 0xffd166];
  if (!spec.palette || !Array.isArray(spec.palette) || spec.palette.length === 0) {
    return defaultColors.map((c) => new THREE.Color(c));
  }
  return spec.palette.map((c, i) => parseColor(c, defaultColors[i % defaultColors.length]));
}

/**
 * Procedurally builds a dynamic 3D Character matching the Gemini specification.
 * Supports Golems, Humanoids, Droids, Creatures, and Stylized beings.
 */
export function buildProceduralCharacterScene(spec = {}) {
  const scene = new THREE.Scene();
  scene.name = spec.name || "ProceduralCharacter";

  const palette = extractPalette(spec);
  const primaryColor = palette[0] || new THREE.Color(0x787878);
  const secondaryColor = palette[1] || new THREE.Color(0x4a3525);
  const accentColor = palette[2] || new THREE.Color(0x6db33f);
  const glowColor = palette[3] || new THREE.Color(0x00f0ff);
  const highlightColor = palette[4] || new THREE.Color(0xffd166);

  // Analyze prompt keywords & archetype
  const desc = (spec.visual_identity || spec.description || "").toLowerCase();
  const name = (spec.name || "").toLowerCase();
  const isGolem = desc.includes("golem") || desc.includes("boulder") || desc.includes("stone") || desc.includes("rock") || name.includes("golem") || name.includes("pip");
  const isRobot = desc.includes("robot") || desc.includes("droid") || desc.includes("mech") || desc.includes("cyborg") || desc.includes("metal");
  const isExplorer = desc.includes("space") || desc.includes("suit") || desc.includes("explorer") || desc.includes("captain") || desc.includes("mira");

  // Proportions
  let bodyScale = { width: 1.0, height: 1.0, depth: 1.0 };
  let legScale = { length: 1.0, radius: 0.18 };
  let armScale = { length: 1.0, radius: 0.16 };
  let headSize = 0.5;

  if (isGolem) {
    // Stout, broad, heavy torso, short stubby legs, large stone head
    bodyScale = { width: 1.4, height: 1.1, depth: 1.3 };
    legScale = { length: 0.55, radius: 0.28 };
    armScale = { length: 0.8, radius: 0.24 };
    headSize = 0.65;
  } else if (isExplorer || isRobot) {
    // Athletic, upright proportions
    bodyScale = { width: 0.9, height: 1.2, depth: 0.7 };
    legScale = { length: 1.25, radius: 0.16 };
    armScale = { length: 1.1, radius: 0.14 };
    headSize = 0.42;
  }

  // Create PBR Materials
  const primaryMaterial = new THREE.MeshStandardMaterial({
    color: primaryColor,
    roughness: isRobot ? 0.3 : 0.85,
    metalness: isRobot ? 0.7 : 0.1,
    name: "PrimaryMaterial"
  });

  const secondaryMaterial = new THREE.MeshStandardMaterial({
    color: secondaryColor,
    roughness: 0.9,
    metalness: 0.05,
    name: "SecondaryMaterial"
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    roughness: 0.7,
    metalness: 0.2,
    name: "AccentMaterial"
  });

  const eyeGlowMaterial = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: 3.0,
    roughness: 0.1,
    metalness: 0.0,
    name: "EyeGlowMaterial"
  });

  const highlightMaterial = new THREE.MeshStandardMaterial({
    color: highlightColor,
    roughness: 0.5,
    metalness: 0.2,
    name: "HighlightMaterial"
  });

  // Base Humanoid Rig Skeleton Hierarchy
  const rootBone = new THREE.Bone();
  rootBone.name = "Root";

  const hipsBone = new THREE.Bone();
  hipsBone.name = "Hips";
  hipsBone.position.y = legScale.length * 1.5;
  rootBone.add(hipsBone);

  const spineBone = new THREE.Bone();
  spineBone.name = "Spine";
  spineBone.position.y = bodyScale.height * 0.4;
  hipsBone.add(spineBone);

  const chestBone = new THREE.Bone();
  chestBone.name = "Chest";
  chestBone.position.y = bodyScale.height * 0.4;
  spineBone.add(chestBone);

  const neckBone = new THREE.Bone();
  neckBone.name = "Neck";
  neckBone.position.y = bodyScale.height * 0.35;
  chestBone.add(neckBone);

  const headBone = new THREE.Bone();
  headBone.name = "Head";
  headBone.position.y = 0.15;
  neckBone.add(headBone);

  // Arms
  const leftShoulder = new THREE.Bone();
  leftShoulder.name = "LeftShoulder";
  leftShoulder.position.set(bodyScale.width * 0.55, bodyScale.height * 0.2, 0);
  chestBone.add(leftShoulder);

  const leftArm = new THREE.Bone();
  leftArm.name = "LeftArm";
  leftArm.position.set(0.1, -0.1, 0);
  leftShoulder.add(leftArm);

  const leftForeArm = new THREE.Bone();
  leftForeArm.name = "LeftForeArm";
  leftForeArm.position.set(0, -armScale.length * 0.5, 0);
  leftArm.add(leftForeArm);

  const leftHand = new THREE.Bone();
  leftHand.name = "LeftHand";
  leftHand.position.set(0, -armScale.length * 0.5, 0);
  leftForeArm.add(leftHand);

  const rightShoulder = new THREE.Bone();
  rightShoulder.name = "RightShoulder";
  rightShoulder.position.set(-bodyScale.width * 0.55, bodyScale.height * 0.2, 0);
  chestBone.add(rightShoulder);

  const rightArm = new THREE.Bone();
  rightArm.name = "RightArm";
  rightArm.position.set(-0.1, -0.1, 0);
  rightShoulder.add(rightArm);

  const rightForeArm = new THREE.Bone();
  rightForeArm.name = "RightForeArm";
  rightForeArm.position.set(0, -armScale.length * 0.5, 0);
  rightArm.add(rightForeArm);

  const rightHand = new THREE.Bone();
  rightHand.name = "RightHand";
  rightHand.position.set(0, -armScale.length * 0.5, 0);
  rightForeArm.add(rightHand);

  // Legs
  const leftUpLeg = new THREE.Bone();
  leftUpLeg.name = "LeftUpLeg";
  leftUpLeg.position.set(bodyScale.width * 0.25, 0, 0);
  hipsBone.add(leftUpLeg);

  const leftLeg = new THREE.Bone();
  leftLeg.name = "LeftLeg";
  leftLeg.position.set(0, -legScale.length * 0.5, 0);
  leftUpLeg.add(leftLeg);

  const leftFoot = new THREE.Bone();
  leftFoot.name = "LeftFoot";
  leftFoot.position.set(0, -legScale.length * 0.5, 0.1);
  leftLeg.add(leftFoot);

  const rightUpLeg = new THREE.Bone();
  rightUpLeg.name = "RightUpLeg";
  rightUpLeg.position.set(-bodyScale.width * 0.25, 0, 0);
  hipsBone.add(rightUpLeg);

  const rightLeg = new THREE.Bone();
  rightLeg.name = "RightLeg";
  rightLeg.position.set(0, -legScale.length * 0.5, 0);
  rightUpLeg.add(rightLeg);

  const rightFoot = new THREE.Bone();
  rightFoot.name = "RightFoot";
  rightFoot.position.set(0, -legScale.length * 0.5, 0.1);
  rightLeg.add(rightFoot);

  // --- MESH ATTACHMENTS ---
  const characterGroup = new THREE.Group();
  characterGroup.name = "CharacterModel";

  // 1. Torso
  let torsoGeom;
  if (isGolem) {
    // Rounded boulder torso
    torsoGeom = new THREE.DodecahedronGeometry(bodyScale.width * 0.65, 2);
    torsoGeom.scale(1.1, 0.95, 0.9);
  } else if (isRobot) {
    torsoGeom = new THREE.BoxGeometry(bodyScale.width * 0.9, bodyScale.height * 0.8, bodyScale.depth * 0.8);
  } else {
    torsoGeom = new THREE.CylinderGeometry(bodyScale.width * 0.45, bodyScale.width * 0.35, bodyScale.height * 0.8, 16);
  }
  const torsoMesh = new THREE.Mesh(torsoGeom, primaryMaterial);
  torsoMesh.position.y = bodyScale.height * 0.3;
  chestBone.add(torsoMesh);

  // 2. Head
  let headGeom;
  if (isGolem) {
    // Rough granite river boulder head
    headGeom = new THREE.DodecahedronGeometry(headSize, 2);
    headGeom.scale(1.15, 0.95, 1.05);
  } else if (isRobot) {
    headGeom = new THREE.BoxGeometry(headSize * 1.5, headSize * 1.3, headSize * 1.4);
  } else {
    headGeom = new THREE.SphereGeometry(headSize, 20, 20);
    headGeom.scale(0.9, 1.1, 0.95);
  }
  const headMesh = new THREE.Mesh(headGeom, primaryMaterial);
  headMesh.position.y = headSize * 0.8;
  headBone.add(headMesh);

  // 3. Eyes / Visor
  if (isExplorer) {
    // Curved helmet visor
    const visorGeom = new THREE.SphereGeometry(headSize * 0.82, 16, 16, 0, Math.PI, 0, Math.PI * 0.5);
    visorGeom.rotateX(Math.PI / 2);
    const visorMaterial = new THREE.MeshStandardMaterial({
      color: 0x112233,
      roughness: 0.1,
      metalness: 0.9,
      emissive: glowColor,
      emissiveIntensity: 0.4
    });
    const visorMesh = new THREE.Mesh(visorGeom, visorMaterial);
    visorMesh.position.set(0, headSize * 0.8, headSize * 0.25);
    headBone.add(visorMesh);
  } else {
    // Glowing turquoise eyes (Pip the Moss Golem / Robot)
    const eyeGeom = new THREE.SphereGeometry(headSize * 0.2, 12, 12);
    const leftEye = new THREE.Mesh(eyeGeom, eyeGlowMaterial);
    leftEye.position.set(headSize * 0.35, headSize * 0.85, headSize * 0.85);
    headBone.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeom, eyeGlowMaterial);
    rightEye.position.set(-headSize * 0.35, headSize * 0.85, headSize * 0.85);
    headBone.add(rightEye);
  }

  // 4. Distinct Features (Moss clusters & Seedling horn for Golem, Thruster pack for Explorer)
  if (isGolem) {
    // Seedling horn curving from right crown
    const hornGeom = new THREE.ConeGeometry(headSize * 0.15, headSize * 0.7, 8);
    hornGeom.rotateZ(-0.4);
    hornGeom.rotateX(0.2);
    const hornMesh = new THREE.Mesh(hornGeom, secondaryMaterial);
    hornMesh.position.set(headSize * 0.55, headSize * 1.6, headSize * 0.1);
    headBone.add(hornMesh);

    // Patches of lush velvet-green moss sprouting on shoulders and head
    const mossGeom = new THREE.DodecahedronGeometry(0.18, 1);
    const mossPositions = [
      [headSize * 0.2, headSize * 1.5, 0],
      [-headSize * 0.4, headSize * 1.4, headSize * 0.2],
      [bodyScale.width * 0.45, bodyScale.height * 0.6, headSize * 0.2],
      [-bodyScale.width * 0.45, bodyScale.height * 0.6, -headSize * 0.1],
      [0, bodyScale.height * 0.7, -headSize * 0.4]
    ];
    mossPositions.forEach((pos, idx) => {
      const mossCluster = new THREE.Mesh(mossGeom, accentMaterial);
      mossCluster.position.set(pos[0], pos[1], pos[2]);
      mossCluster.scale.set(1.2, 0.7, 1.1);
      chestBone.add(mossCluster);

      // Yellow buttercups
      if (idx % 2 === 0) {
        const flowerGeom = new THREE.SphereGeometry(0.06, 6, 6);
        const flowerMesh = new THREE.Mesh(flowerGeom, highlightMaterial);
        flowerMesh.position.set(pos[0], pos[1] + 0.12, pos[2]);
        chestBone.add(flowerMesh);
      }
    });
  } else if (isExplorer || isRobot) {
    // Back thruster / oxygen pack
    const packGeom = new THREE.BoxGeometry(bodyScale.width * 0.6, bodyScale.height * 0.6, bodyScale.depth * 0.5);
    const packMesh = new THREE.Mesh(packGeom, secondaryMaterial);
    packMesh.position.set(0, bodyScale.height * 0.35, -bodyScale.depth * 0.55);
    chestBone.add(packMesh);
  }

  // 5. Limbs (Arms & Legs)
  const armGeom = new THREE.CylinderGeometry(armScale.radius * 0.9, armScale.radius, armScale.length * 0.5, 12);
  const leftUpperArmMesh = new THREE.Mesh(armGeom, primaryMaterial);
  leftUpperArmMesh.position.y = -armScale.length * 0.25;
  leftArm.add(leftUpperArmMesh);

  const leftForeArmMesh = new THREE.Mesh(armGeom, secondaryMaterial);
  leftForeArmMesh.position.y = -armScale.length * 0.25;
  leftForeArm.add(leftForeArmMesh);

  const rightUpperArmMesh = new THREE.Mesh(armGeom, primaryMaterial);
  rightUpperArmMesh.position.y = -armScale.length * 0.25;
  rightArm.add(rightUpperArmMesh);

  const rightForeArmMesh = new THREE.Mesh(armGeom, secondaryMaterial);
  rightForeArmMesh.position.y = -armScale.length * 0.25;
  rightForeArm.add(rightForeArmMesh);

  const legGeom = new THREE.CylinderGeometry(legScale.radius, legScale.radius * 1.1, legScale.length * 0.5, 12);
  const leftUpperLegMesh = new THREE.Mesh(legGeom, secondaryMaterial);
  leftUpperLegMesh.position.y = -legScale.length * 0.25;
  leftUpLeg.add(leftUpperLegMesh);

  const leftLowerLegMesh = new THREE.Mesh(legGeom, primaryMaterial);
  leftLowerLegMesh.position.y = -legScale.length * 0.25;
  leftLeg.add(leftLowerLegMesh);

  const rightUpperLegMesh = new THREE.Mesh(legGeom, secondaryMaterial);
  rightUpperLegMesh.position.y = -legScale.length * 0.25;
  rightUpLeg.add(rightUpperLegMesh);

  const rightLowerLegMesh = new THREE.Mesh(legGeom, primaryMaterial);
  rightLowerLegMesh.position.y = -legScale.length * 0.25;
  rightLeg.add(rightLowerLegMesh);

  // Feet / Boulder Paws
  const footGeom = new THREE.SphereGeometry(legScale.radius * 1.25, 12, 12);
  footGeom.scale(1, 0.6, 1.4);
  const leftFootMesh = new THREE.Mesh(footGeom, primaryMaterial);
  leftFoot.add(leftFootMesh);

  const rightFootMesh = new THREE.Mesh(footGeom, primaryMaterial);
  rightFoot.add(rightFootMesh);

  // Add bones to scene
  characterGroup.add(rootBone);
  scene.add(characterGroup);

  return scene;
}

/**
 * Generates an SVG preview thumbnail of the character
 */
export function generateCharacterPreviewSvg(spec = {}) {
  const palette = extractPalette(spec);
  const primary = "#" + (palette[0] ? palette[0].getHexString() : "787878");
  const secondary = "#" + (palette[1] ? palette[1].getHexString() : "4a3525");
  const accent = "#" + (palette[2] ? palette[2].getHexString() : "6db33f");
  const glow = "#" + (palette[3] ? palette[3].getHexString() : "00f0ff");
  const name = spec.name || "Character";

  const desc = (spec.visual_identity || spec.description || "").toLowerCase();
  const isGolem = desc.includes("golem") || desc.includes("boulder") || desc.includes("stone") || name.toLowerCase().includes("pip");

  if (isGolem) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
      <defs>
        <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </radialGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur"/>
          <feComposite in="SourceGraphic" in2="blur" operator="over"/>
        </filter>
      </defs>
      <rect width="400" height="300" fill="url(#bgGrad)"/>
      <ellipse cx="200" cy="275" rx="100" ry="16" fill="#090d16" opacity="0.6"/>
      <!-- Legs -->
      <rect x="155" y="220" width="35" height="40" rx="14" fill="${secondary}"/>
      <rect x="210" y="220" width="35" height="40" rx="14" fill="${secondary}"/>
      <!-- Body Boulder -->
      <ellipse cx="200" cy="180" rx="85" ry="60" fill="${primary}"/>
      <!-- Moss patches on shoulder -->
      <ellipse cx="140" cy="145" rx="28" ry="18" fill="${accent}"/>
      <ellipse cx="260" cy="148" rx="25" ry="16" fill="${accent}"/>
      <!-- Arms -->
      <ellipse cx="115" cy="190" rx="22" ry="40" fill="${primary}"/>
      <ellipse cx="285" cy="190" rx="22" ry="40" fill="${primary}"/>
      <!-- Boulder Head -->
      <ellipse cx="200" cy="115" rx="60" ry="50" fill="${primary}"/>
      <ellipse cx="220" cy="80" rx="18" ry="10" fill="${accent}"/>
      <!-- Seedling horn -->
      <path d="M 230 75 Q 248 50 240 38 Q 235 55 224 72 Z" fill="${secondary}"/>
      <!-- Glowing Turquoise Eyes -->
      <circle cx="178" cy="115" r="11" fill="${glow}" filter="url(#glow)"/>
      <circle cx="178" cy="115" r="5" fill="#ffffff"/>
      <circle cx="222" cy="115" r="11" fill="${glow}" filter="url(#glow)"/>
      <circle cx="222" cy="115" r="5" fill="#ffffff"/>
      <!-- Flowers -->
      <circle cx="142" cy="138" r="5" fill="#ffd166"/>
      <circle cx="262" cy="142" r="5" fill="#ffd166"/>
      <circle cx="224" cy="74" r="4" fill="#ffd166"/>
    </svg>`;
  }

  // Default Stylized Hero / Explorer SVG
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
    <defs>
      <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </radialGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>
    </defs>
    <rect width="400" height="300" fill="url(#bgGrad)"/>
    <ellipse cx="200" cy="280" rx="80" ry="14" fill="#090d16" opacity="0.6"/>
    <!-- Legs -->
    <rect x="170" y="190" width="24" height="80" rx="10" fill="${secondary}"/>
    <rect x="206" y="190" width="24" height="80" rx="10" fill="${secondary}"/>
    <!-- Torso -->
    <path d="M 160 110 L 240 110 L 225 195 L 175 195 Z" fill="${primary}"/>
    <!-- Arms -->
    <rect x="135" y="115" width="20" height="70" rx="8" fill="${secondary}"/>
    <rect x="245" y="115" width="20" height="70" rx="8" fill="${secondary}"/>
    <!-- Head / Helmet -->
    <circle cx="200" cy="80" r="38" fill="${primary}"/>
    <!-- Glowing Visor -->
    <ellipse cx="200" cy="80" rx="26" ry="16" fill="${glow}" filter="url(#glow)"/>
    <ellipse cx="200" cy="80" rx="20" ry="10" fill="#ffffff" opacity="0.8"/>
  </svg>`;
}

/**
 * Builds the 3D scene, exports the binary .glb, writes assets to public/models/characters,
 * and returns the glbUrl, previewUrl, and rigMetadata.
 */
export async function generateAndSaveCharacterAssets({ characterId, versionNumber = 1, spec = {} }) {
  const scene = buildProceduralCharacterScene(spec);

  // Export to binary GLB using Three.js GLTFExporter
  const exporter = new GLTFExporter();
  const glbBuffer = await exporter.parseAsync(scene, { binary: true });

  // Ensure directories exist in public/
  const outputDir = path.join(process.cwd(), "public", "models", "characters");
  await fs.mkdir(outputDir, { recursive: true });

  const glbFileName = `${characterId}_v${versionNumber}.glb`;
  const glbFilePath = path.join(outputDir, glbFileName);
  await fs.writeFile(glbFilePath, Buffer.from(glbBuffer));

  // Generate SVG preview and write to disk
  const svgContent = generateCharacterPreviewSvg(spec);
  const previewFileName = `${characterId}_v${versionNumber}.svg`;
  const previewFilePath = path.join(outputDir, previewFileName);
  await fs.writeFile(previewFilePath, svgContent, "utf8");

  const glbUrl = `/models/characters/${glbFileName}`;
  const previewUrl = `/models/characters/${previewFileName}`;
  let vertexCount = 0;
  scene.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position) {
      vertexCount += child.geometry.attributes.position.count;
    }
  });

  return {
    characterName: spec.name || "Character",
    style: spec.style || "stylized",
    glbUrl,
    assetUrl: glbUrl,
    previewUrl,
    rigMetadata: {
      rigged: true,
      rigging: "rigid_bone_parenting",
      skeleton: "HumanoidStandardBiped",
      bones: [
        "Root", "Hips", "Spine", "Chest", "Neck", "Head",
        "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
        "RightShoulder", "RightArm", "RightForeArm", "RightHand",
        "LeftUpLeg", "LeftLeg", "LeftFoot",
        "RightUpLeg", "RightLeg", "RightFoot"
      ],
      vertexCount,
      materials: ["PrimaryMaterial", "SecondaryMaterial", "AccentMaterial", "EyeGlowMaterial"],
      proportions: spec.proportions || "standard humanoid",
      palette: spec.palette || []
    }
  };
}
