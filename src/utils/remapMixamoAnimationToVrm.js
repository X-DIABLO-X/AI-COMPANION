import * as THREE from "three";
import { mixamoVRMRigMap } from "./mixamoVRMRigMap.js";
import { VRMHumanBoneName } from "@pixiv/three-vrm";

const facialBones = new Set(['jaw', 'head', 'neck', 'mouth', 'face', 'eye']);

export function remapMixamoAnimationToVrm(vrm, asset) {
  const clip = THREE.AnimationClip.findByName(
    asset.animations,
    "mixamo.com"
  ).clone(); // extract the AnimationClip

  const tracks = []; // KeyframeTracks compatible with VRM will be added here

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const _quatA = new THREE.Quaternion();
  const _vec3 = new THREE.Vector3();

  // Adjust with reference to hips height.
  const motionHipsHeight = asset.getObjectByName("mixamorigHips").position.y;
  const vrmHipsY = vrm.humanoid
    ?.getNormalizedBoneNode("hips")
    .getWorldPosition(_vec3).y;
  const vrmRootY = vrm.scene.getWorldPosition(_vec3).y;
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

  clip.tracks.forEach((track) => {
    // Convert each tracks for VRM use, and push to `tracks`
    const trackSplitted = track.name.split(".");
    const mixamoRigName = trackSplitted[0];
    const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
    const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
    const mixamoRigNode = asset.getObjectByName(mixamoRigName);

    if (!vrmBoneName) {
      return;
    }

    if (vrmBoneName && facialBones.has(vrmBoneName.toLowerCase())) {
      console.log(`[remap] Skipping facial bone: ${vrmBoneName}`);
      return;
    }

    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName);

    if (!vrmNode) {
      return;
    }

    if (vrmNodeName != null) {
      const propertyName = trackSplitted[1];

      // Store rotations of rest-pose.
      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        // Retarget rotation of mixamoRig to NormalizedBone.
        for (let i = 0; i < track.values.length; i += 4) {
          const flatQuaternion = track.values.slice(i, i + 4);

          _quatA.fromArray(flatQuaternion);

          // 親のレスト時ワールド回転 * トラックの回転 * レスト時ワールド回転の逆
          _quatA
            .premultiply(parentRestWorldRotation)
            .multiply(restRotationInverse);

          _quatA.toArray(flatQuaternion);

          flatQuaternion.forEach((v, index) => {
            track.values[index + i] = v;
          });
        }

        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            track.values.map((v, i) =>
              vrm.meta?.metaVersion === "0" && i % 2 === 0 ? -v : v
            )
          )
        );
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const value = track.values.map(
          (v, i) =>
            (vrm.meta?.metaVersion === "0" && i % 3 !== 1 ? -v : v) *
            hipsPositionScale
        );
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            track.times,
            value
          )
        );
      }
    }
  });

  clip.tracks = tracks.filter(Boolean);

  // remove morph target tracks
  clip.tracks = clip.tracks.filter((track) => {
    const trackName = track.name.toLowerCase();
    if (trackName.includes('morph') || trackName.includes('blendshape') || track.name.includes('.morphTargetInfluences')) {
      console.log(`[remap] Removing morph target track: ${track.name}`);
      return false;
    }
    return true;
  });

  return clip;
}
