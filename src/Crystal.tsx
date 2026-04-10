import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial, Float, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

const GOLD = new THREE.Color('#d4af37');
const VIOLET = new THREE.Color('#8a2be2');

export default function Crystal() {
  const meshRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  const shardGeometry = useMemo(() => {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      positions.setXYZ(
        i,
        x * (0.8 + Math.random() * 0.4),
        y * (1.5 + Math.random() * 0.5),
        z * (0.8 + Math.random() * 0.4)
      );
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (meshRef.current) {
      meshRef.current.rotation.y = time * 0.2;
      meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.1;
    }

    if (innerRef.current) {
      innerRef.current.position.y = Math.sin(time * 0.5) * 0.05;
      innerRef.current.scale.setScalar(1 + Math.sin(time * 2) * 0.02);
    }

    if (lightRef.current) {
      lightRef.current.intensity = 2 + Math.sin(time * 3) * 1.5;
      const t = (Math.sin(time * 0.5) + 1) / 2;
      lightRef.current.color.lerpColors(GOLD, VIOLET, t);
    }
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />

      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <group>
          <mesh ref={meshRef} geometry={shardGeometry}>
            <MeshTransmissionMaterial
              backside
              backsideThickness={0.5}
              thickness={1.5}
              roughness={0.05}
              transmission={1}
              ior={1.5}
              chromaticAberration={0.06}
              anisotropy={0.1}
              distortion={0.1}
              distortionScale={0.3}
              temporalDistortion={0.1}
              clearcoat={1}
              attenuationDistance={0.5}
              attenuationColor="#ffffff"
              color="#ffffff"
            />
          </mesh>

          <group ref={innerRef}>
            <mesh position={[0, 0.4, 0]}>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshStandardMaterial
                emissive="#ffffff"
                emissiveIntensity={2}
                color="#ffffff"
                transparent
                opacity={0.6}
              />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <capsuleGeometry args={[0.06, 0.4, 4, 8]} />
              <meshStandardMaterial
                emissive="#ffffff"
                emissiveIntensity={1.5}
                color="#ffffff"
                transparent
                opacity={0.4}
              />
            </mesh>
          </group>

          <pointLight ref={lightRef} position={[0, 0, 0]} distance={5} decay={2} />
        </group>
      </Float>

      <ambientLight intensity={0.1} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8a2be2" />
    </>
  );
}
