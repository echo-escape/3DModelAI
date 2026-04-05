"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface Props {
  scene?: THREE.Group | null;
  placeholder?: boolean;
}

export default function ThreeCanvas({ scene, placeholder = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. 初始化场景
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    const threeScene = new THREE.Scene();
    
    // 2. 初始化相机
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(2, 2, 2);

    // 3. 初始化控制器
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // 4. 初始化灯光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    threeScene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    threeScene.add(directionalLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(-5, -5, -5);
    threeScene.add(backLight);

    // 5. 处理模型
    let model: THREE.Object3D | null = null;
    
    if (scene) {
      model = scene.clone();
      
      // 自动居中并缩放模型
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? 1.0 / maxDim : 1.0;
      
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      
      // 遍历模型优化材质
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const geometry = child.geometry;
          const hasVertexColors = geometry.attributes.color !== undefined;
          const mat = child.material;
          
          if (hasVertexColors) {
            // 顶点色支持
            if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshBasicMaterial) {
              mat.vertexColors = true;
              if (!mat.map) mat.color.set(0xffffff); // 仅在无贴图时设为白色以配合顶点色
            }
          }
          
          // 如果是标准材质但全黑且无贴图，给予兜底色
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (mat.color.getHex() === 0x000000 && !mat.map && !hasVertexColors) {
              mat.color.set(0xcccccc);
            }
            mat.roughness = Math.max(mat.roughness, 0.3); // 避免太反光
          }
        }
      });
      
      threeScene.add(model);
    } else {
      // 默认占位模型: 玻璃感圆角立方体
      const geometry = new THREE.IcosahedronGeometry(0.5, 0);
      const material = new THREE.MeshPhysicalMaterial({
        color: 0xb2e2f2,
        metalness: 0.1,
        roughness: 0.2,
        transmission: 0.5,
        thickness: 0.5,
      });
      const placeholderModel = new THREE.Mesh(geometry, material);
      
      // 添加一个线框外框
      const wireframe = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.2 })
      );
      placeholderModel.add(wireframe);
      threeScene.add(placeholderModel);
      model = placeholderModel;
    }

    // 6. 渲染循环
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (model) {
        model.rotation.y += 0.005; 
      }
      controls.update();
      renderer.render(threeScene, camera);
    };
    animate();

    // 7. 清理
    const container = containerRef.current;
    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [scene, placeholder]);

  return <div ref={containerRef} className="w-full h-full min-h-[400px]" />;
}
