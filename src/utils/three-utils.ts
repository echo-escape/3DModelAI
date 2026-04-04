import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");

/**
 * 加载模型并探测格式
 */
export async function loadModelWithFormat(url: string): Promise<{ scene: THREE.Group, format: string }> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  
  const textHead = new TextDecoder().decode(uint8.slice(0, 50)).toLowerCase();
  const isGLB = uint8[0] === 0x67 && uint8[1] === 0x6C && uint8[2] === 0x54 && uint8[3] === 0x46;
  const isOBJ = textHead.includes("v ") || textHead.includes("mtl") || textHead.startsWith("#");

  return new Promise((resolve, reject) => {
    if (isOBJ && !isGLB) {
      const loader = new OBJLoader();
      const text = new TextDecoder().decode(uint8);
      const scene = loader.parse(text);
      resolve({ scene, format: "obj" });
    } else {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.parse(buffer, "", (gltf) => resolve({ scene: gltf.scene, format: "glb" }), (err) => {
        try {
          const objLoader = new OBJLoader();
          const text = new TextDecoder().decode(uint8);
          resolve({ scene: objLoader.parse(text), format: "obj" });
        } catch { reject(new Error("Parse Failed")); }
      });
    }
  });
}

/**
 * 转换为 STL 下载
 */
export async function downloadAsSTL(url: string, filename: string = "model") {
  const { scene } = await loadModelWithFormat(url);
  const exporter = new STLExporter();
  const result = exporter.parse(scene, { binary: true });
  const blob = new Blob([result], { type: "application/octet-stream" });
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = `${filename}.stl`;
  link.click();
  URL.revokeObjectURL(downloadUrl);
}

/**
 * 针对 OBJ 场景的高质量 GLB 转换 (带光照补丁)
 */
export async function convertSceneToGLB(scene: THREE.Group): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const wrapper = new THREE.Scene();
    
    // OBJ 转过来的网格通常缺少材质或全黑
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!child.material || (Array.isArray(child.material) && child.material.length === 0)) {
          child.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.2 });
        }
      }
    });

    wrapper.add(scene.clone());
    wrapper.add(new THREE.AmbientLight(0xffffff, 1.5));
    wrapper.add(new THREE.DirectionalLight(0xffffff, 1));

    exporter.parse(
      wrapper,
      (gltf) => {
        const outBlob = new Blob([gltf as ArrayBuffer], { type: "model/gltf-binary" });
        resolve(outBlob);
      },
      (err) => reject(err),
      { binary: true, animations: [], includeCustomExtensions: false }
    );
  });
}
