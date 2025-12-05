import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Euler, Object3D, Quaternion, Vector3 } from "three";
import { lerp } from "three/src/math/MathUtils.js";
import { useEmotionContext } from "../hooks/useEmotionContext";
import { useLipSyncContext } from "../hooks/useLipSyncContext";
import { remapMixamoAnimationToVrm } from "../utils/remapMixamoAnimationToVrm";

const tmpVec3 = new Vector3();
const tmpQuat = new Quaternion();
const tmpEuler = new Euler();

export const VRMAvatar = ({ avatar, ...props }) => {
  const { scene, userData } = useGLTF(
    `models/${avatar}`,
    undefined,
    undefined,
    (loader) => {
      loader.register((parser) => {
        return new VRMLoaderPlugin(parser);
      });
    }
  );

  const assetA = useFBX("models/animations/Bashful.fbx");
  const assetB = useFBX("models/animations/Happy.fbx");
  const assetC = useFBX("models/animations/Breathing Idle.fbx");
  const assetD = useFBX("models/animations/Sad.fbx");
  const assetE = useFBX("models/animations/Angry.fbx");
  const assetF = useFBX("models/animations/Kiss.fbx");

  const currentVrm = userData.vrm;

  const animationClips = useMemo(() => {
    if (!currentVrm) return [];
    const clips = {
      Bashful: remapMixamoAnimationToVrm(currentVrm, assetA),
      Happy: remapMixamoAnimationToVrm(currentVrm, assetB),
      Idle: remapMixamoAnimationToVrm(currentVrm, assetC),
      Sad: remapMixamoAnimationToVrm(currentVrm, assetD),
      Angry: remapMixamoAnimationToVrm(currentVrm, assetE),
      Kiss: remapMixamoAnimationToVrm(currentVrm, assetF),
    };
    Object.keys(clips).forEach((key) => {
      clips[key].name = key;
    });
    return Object.values(clips);
  }, [currentVrm, assetA, assetB, assetC, assetD, assetE, assetF]);

  const { actions, mixer } = useAnimations(animationClips, currentVrm?.scene);
  const [currentAnimation, setCurrentAnimation] = useState("Idle");

  useEffect(() => {
    if (!currentVrm) return;
    const vrm = userData.vrm;
    // Disable frustum culling
    vrm.scene.traverse((obj) => {
      obj.frustumCulled = false;
    });

    // Play default breathing animation
    actions["Idle"]?.reset().fadeIn(0.5).play();
    setCurrentAnimation("Idle");
  }, [currentVrm, actions]);

  // Lip sync context - Subscribe only to isLipSyncActive to trigger mode changes
  const isLipSyncActive = useLipSyncContext((state) => state.isLipSyncActive);

  // Emotion context
  const { getBlendedEmotionValues, updateTransition, shouldFadeEmotion, resetEmotion, isEmotionActive, currentEmotion } = useEmotionContext();

  const smoothedVisemes = useRef({});

  const {
    aa,
    ih,
    ee,
    oh,
    ou,
    blinkLeft,
    blinkRight,
    angry,
    sad,
    happy,
  } = useControls("VRM", {
    aa: { value: 0, min: 0, max: 1 },
    ih: { value: 0, min: 0, max: 1 },
    ee: { value: 0, min: 0, max: 1 },
    oh: { value: 0, min: 0, max: 1 },
    ou: { value: 0, min: 0, max: 1 },
    blinkLeft: { value: 0, min: 0, max: 1 },
    blinkRight: { value: 0, min: 0, max: 1 },
    angry: { value: 0, min: 0, max: 1 },
    sad: { value: 0, min: 0, max: 1 },
    happy: { value: 0, min: 0, max: 1 },
  });

  const emotionAnimationMap = {
    happy: "Happy",
    sad: "Sad",
    angry: "Angry",
    bashful: "Bashful",
    kiss: "Kiss",
  };

  useEffect(() => {
    const newAnimation = emotionAnimationMap[currentEmotion];

    if (newAnimation && newAnimation !== currentAnimation) {
      if (actions[currentAnimation]) {
        actions[currentAnimation].fadeOut(0.5);
      }
      actions[newAnimation]?.reset().fadeIn(0.5).play();
      setCurrentAnimation(newAnimation);
    } else if (!isEmotionActive && currentAnimation !== "Idle") {
      if (actions[currentAnimation]) {
        actions[currentAnimation].fadeOut(0.5);
      }
      actions["Idle"]?.reset().fadeIn(0.5).play();
      setCurrentAnimation("Idle");
    }

  }, [currentEmotion, isEmotionActive, actions, currentAnimation]);

  const lerpExpression = (name, value, lerpFactor) => {
    if (userData.vrm?.expressionManager) {
      userData.vrm.expressionManager.setValue(
        name,
        lerp(userData.vrm.expressionManager.getValue(name) ?? 0, value, lerpFactor)
      );
    }
  };

  const blinkState = useRef({
    isBlinking: false,
    nextBlinkTime: 3 + Math.random() * 4,
    time: 0,
    blinkDuration: 0.15
  });

  useFrame((state, delta) => {
    if (!userData.vrm) {
      return;
    }

    mixer.update(delta * 0); // Update all animations from a single mixer

    // Procedural blinking logic
    const blink = blinkState.current;
    blink.time += delta;
    let blinkValue = 0;

    if (blink.isBlinking) {
      const blinkPhase = (blink.time / blink.blinkDuration) * Math.PI;
      blinkValue = Math.sin(blinkPhase);
      if (blink.time >= blink.blinkDuration) {
        blink.isBlinking = false;
      }
    } else {
      if (blink.time >= blink.nextBlinkTime) {
        blink.isBlinking = true;
        blink.time = 0;
        blink.nextBlinkTime = 3 + Math.random() * 4; // next blink in 3-7 seconds
      }
    }

    // Handle emotion transitions and fading
    let emotionValues = { happy: 0, sad: 0, angry: 0, surprised: 0 };

    if (isEmotionActive) {
      const transitionSpeed = delta * 2;
      updateTransition(transitionSpeed);

      if (shouldFadeEmotion()) {
        resetEmotion();
      } else {
        emotionValues = getBlendedEmotionValues();
      }
    }

    // Apply emotions (blend with manual controls if not using emotion system)
    lerpExpression("angry", isEmotionActive ? emotionValues.angry : angry, delta * 12);
    lerpExpression("sad", isEmotionActive ? emotionValues.sad : sad, delta * 12);
    lerpExpression("happy", isEmotionActive ? emotionValues.happy : happy, delta * 12);

    // Determine target visemes from either lip-sync or manual controls
    let targetVisemes = { aa, ih, ee, oh, ou };

    if (isLipSyncActive) {
      // Read directly from store to avoid re-renders
      targetVisemes = useLipSyncContext.getState().currentViseme;
    }

    // Smoothly update visemes with adaptive speed
    for (const key in targetVisemes) {
      const current = smoothedVisemes.current[key] || 0;
      const target = targetVisemes[key] || 0;
      // Smoother transitions for natural speech
      const smoothingFactor = target > current ? 0.3 : 0.5;
      smoothedVisemes.current[key] = lerp(current, target, delta * 15 * smoothingFactor);
    }

    // Apply smoothed visemes
    userData.vrm.expressionManager.setValue("aa", smoothedVisemes.current.aa);
    userData.vrm.expressionManager.setValue("ih", smoothedVisemes.current.ih);
    userData.vrm.expressionManager.setValue("ee", smoothedVisemes.current.ee);
    userData.vrm.expressionManager.setValue("oh", smoothedVisemes.current.oh);
    userData.vrm.expressionManager.setValue("ou", smoothedVisemes.current.ou);

    // Apply procedural blink, allowing manual override from Leva
    lerpExpression("blinkLeft", blinkLeft > 0 ? blinkLeft : blinkValue, delta * 24);
    lerpExpression("blinkRight", blinkRight > 0 ? blinkRight : blinkValue, delta * 24);

    userData.vrm.update(delta);
  });

  const lookAtDestination = useRef(new Vector3(0, 0, 0));
  const camera = useThree((state) => state.camera);
  const lookAtTarget = useRef();
  useEffect(() => {
    if (camera) {
      lookAtTarget.current = new Object3D();
      camera.add(lookAtTarget.current);
    }
  }, [camera]);

  return (
    <group {...props}>
      <primitive
        object={scene}
        rotation-y={avatar !== "3636451243928341470.vrm" ? Math.PI : 0}
      />
    </group>
  );
};
