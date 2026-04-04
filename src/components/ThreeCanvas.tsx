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
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    threeScene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    threeScene.add(directionalLight);

    // 5. 处理模型
    let model: THREE.Object3D;
    
    if (scene) {
      model = scene.clone();
      
      // 自动居中并缩放模型
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 1.0 / maxDim;
      
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      
      // 赋予基础材质（如果是白模）
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (!child.material || (child.material as any).color?.getHex() === 0x000000) {
            child.material = new THREE.MeshStandardMaterial({ 
              color: 0xcccccc, 
              roughness: 0.5, 
              metalness: 0.2 
            });
          }
        }
      });
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
      model = new THREE.Mesh(geometry, material);
      
      // 添加一个线框外框
      const wireframe = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.2 })
      );
      model.add(wireframe);
    }

    threeScene.add(model);

    // 6. 渲染循环
    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (model) {
        model.rotation.y += 0.005; 
        model.rotation.x += 0.002;
      }
      controls.update();
      renderer.render(threeScene, camera);
    };
    animate();

    // 7. 清理
    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [scene, placeholder]);

  return <div ref={containerRef} className="w-full h-full min-h-[400px]" />;
}
