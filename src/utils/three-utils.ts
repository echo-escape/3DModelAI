import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/"); // 也可以尝试 https://www.gstatic.com/draco/v1/decoders/
// 如果在国内环境，可以考虑本地化或更可靠的镜像
// dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");

/**
 * 加载模型并探测格式
 */
export async function loadModelWithFormat(url: string): Promise<{ scene: THREE.Group, format: string }> {
  const response = await fetch(url);
  
  if (!response.ok) {
    let errorDetail = "";
    try {
      const json = await response.json();
      errorDetail = json.error || json.message || response.statusText;
    } catch {
      errorDetail = response.statusText;
    }
    throw new Error(`Model proxy error (${response.status}): ${errorDetail}`);
  }

  // 优先从 Header 获取格式
  const formatHeader = response.headers.get("X-Model-Format");
  const buffer = await response.arrayBuffer();
  const uint8 = new Uint8Array(buffer);
  
  // 如果 Header 明确指定了格式，直接使用
  if (formatHeader === "glb") {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.parse(buffer, "", (gltf) => resolve({ scene: gltf.scene, format: "glb" }), (err) => reject(err));
    });
  }

  // 1. 探测 GLB (Magic: glTF)
  const isGLB = uint8[0] === 0x67 && uint8[1] === 0x6C && uint8[2] === 0x54 && uint8[3] === 0x46;
  
  // 2. 探测 STL (Binary STL 通常 80 字节头之后是三角面数，或者 ASCII 以 "solid" 开头)
  const textHead = new TextDecoder().decode(uint8.slice(0, 80)).toLowerCase();
  const isSTL = textHead.startsWith("solid") || (uint8.length > 84 && !isGLB && !textHead.includes("v "));

  // 3. 探测 OBJ (包含 "v " 定点定义)
  const isOBJ = !isGLB && !isSTL && (textHead.includes("v ") || textHead.includes("mtl"));

  return new Promise((resolve, reject) => {
    if (isGLB || formatHeader === "glb") {
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.parse(buffer, "", (gltf) => resolve({ scene: gltf.scene, format: "glb" }), (err) => {
        console.error("GLB Parse Error:", err);
        reject(new Error("Failed to parse GLB model"));
      });
    } 
    else if (isSTL || formatHeader === "stl") {
      const loader = new STLLoader();
      const geometry = loader.parse(buffer);
      const material = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.2 });
      const mesh = new THREE.Mesh(geometry, material);
      const group = new THREE.Group();
      group.add(mesh);
      resolve({ scene: group, format: "stl" });
    }
    else if (isOBJ || formatHeader === "obj") {
      const loader = new OBJLoader();
      const text = new TextDecoder().decode(uint8);
      const scene = loader.parse(text);
      resolve({ scene, format: "obj" });
    }
    else {
      // 最后的兜底尝试：尝试作为 GLB 加载 (包含 Draco 支持)
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.parse(buffer, "", (gltf) => resolve({ scene: gltf.scene, format: "glb" }), (err) => {
        const firstBytes = Array.from(uint8.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.error("Unknown format fallback failed. First bytes:", firstBytes, err);
        reject(new Error(`Unknown or Unsupported 3D Format (Bytes: ${firstBytes})`));
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
