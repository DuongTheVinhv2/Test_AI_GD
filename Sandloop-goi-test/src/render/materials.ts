import * as THREE from 'three';
import { glassSheen, noiseTexture } from './textures';

export interface Mats {
  frame: THREE.MeshPhysicalMaterial;
  frameInner: THREE.MeshPhysicalMaterial;
  backPlate: THREE.MeshStandardMaterial;
  silver: THREE.MeshPhysicalMaterial;
  silverDark: THREE.MeshPhysicalMaterial;
  slate: THREE.MeshStandardMaterial;
  tile: THREE.MeshPhysicalMaterial;
  hole: THREE.MeshStandardMaterial;
  white: THREE.MeshPhysicalMaterial;
  gold: THREE.MeshPhysicalMaterial;
  plate: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  sheen: THREE.MeshBasicMaterial;
  noise: THREE.Texture;
}

export function createMaterials(): Mats {
  const noise = noiseTexture(128, 8);
  noise.repeat.set(3, 3);

  const frame = new THREE.MeshPhysicalMaterial({
    color: '#f3f8ff',
    roughness: 0.3,
    metalness: 0.0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    envMapIntensity: 0.85,
  });
  const frameInner = frame.clone();
  frameInner.color.set('#cfe5fb');

  const backPlate = new THREE.MeshStandardMaterial({ color: '#46484f', roughness: 0.95, metalness: 0.0, bumpMap: noise, bumpScale: 0.1 });

  const silver = new THREE.MeshPhysicalMaterial({
    color: '#d3d8e6',
    roughness: 0.34,
    metalness: 0.35,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.1,
  });
  const silverDark = silver.clone();
  silverDark.color.set('#9aa3bd');
  silverDark.roughness = 0.42;

  const slate = new THREE.MeshStandardMaterial({ color: '#8496c6', roughness: 0.62, metalness: 0.0, bumpMap: noise, bumpScale: 0.12 });
  const tile = new THREE.MeshPhysicalMaterial({
    color: '#dbe9fc',
    roughness: 0.5,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.6,
  });
  const hole = new THREE.MeshStandardMaterial({ color: '#566799', roughness: 0.85, metalness: 0 });
  const white = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const gold = new THREE.MeshPhysicalMaterial({
    color: '#ffc531',
    metalness: 1,
    roughness: 0.26,
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.5,
  });
  const plate = new THREE.MeshPhysicalMaterial({ color: '#4d5f8f', roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 });

  const glass = new THREE.MeshPhysicalMaterial({
    color: '#e6f1ff',
    transparent: true,
    opacity: 0.05,
    roughness: 0.04,
    metalness: 0,
    envMapIntensity: 1.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    depthWrite: false,
  });
  const sheen = new THREE.MeshBasicMaterial({
    map: glassSheen(),
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return { frame, frameInner, backPlate, silver, silverDark, slate, tile, hole, white, gold, plate, glass, sheen, noise };
}
