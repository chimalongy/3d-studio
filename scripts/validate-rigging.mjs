import assert from "node:assert/strict";
import * as THREE from "three";
import { buildHumanoidRig, applyPose } from "../lib/characterRigging.js";

const geometry = new THREE.BoxGeometry(1.2, 2, 0.8, 8, 12, 6);
geometry.computeBoundingBox();
const rig = buildHumanoidRig({
  geometry,
  bounds: geometry.boundingBox.clone()
});

assert.ok(rig.skeleton.bones.length >= 18, "expected a humanoid skeleton");
assert.ok(geometry.attributes.skinIndex, "skinIndex must be assigned");
assert.ok(geometry.attributes.skinWeight, "skinWeight must be assigned");
assert.equal(geometry.attributes.skinIndex.itemSize, 4);
assert.equal(geometry.attributes.skinWeight.itemSize, 4);

const indices = geometry.attributes.skinIndex;
const weights = geometry.attributes.skinWeight;
for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) {
  let total = 0;
  for (let slot = 0; slot < 4; slot++) {
    const boneIndex = indices.array[vertex * 4 + slot];
    const weight = weights.array[vertex * 4 + slot];
    assert.ok(boneIndex >= 0 && boneIndex < rig.skeleton.bones.length, "bone index out of range");
    assert.ok(Number.isFinite(weight) && weight >= 0, "invalid skin weight");
    total += weight;
  }
  assert.ok(Math.abs(total - 1) < 1e-4, `vertex ${vertex} weights must sum to 1`);
}

applyPose(rig.bonesMap, "idle", 1.25);
rig.rootBone.updateMatrixWorld(true);
applyPose(rig.bonesMap, "rest", 0);
rig.rootBone.updateMatrixWorld(true);

console.log("Rig validation passed: skeleton, 4-slot skin attributes, normalized weights and pose reset.");
