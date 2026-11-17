import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Compass, Eye, Layers, RotateCw, Sparkles, Zap } from "lucide-react";

export default function ThreeStudioView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [droneState, setDroneState] = useState({
    activePreset: "Sci-Fi Heavy Drone",
    rotorSpeed: 3.5,
    hullColor: "#3B82F6",
    accentColor: "#F59E0B",
    glowMode: true,
  });

  const speedRef = useRef(droneState.rotorSpeed);
  speedRef.current = droneState.rotorSpeed;

  const hullColorRef = useRef(droneState.hullColor);
  hullColorRef.current = droneState.hullColor;

  const accentColorRef = useRef(droneState.accentColor);
  accentColorRef.current = droneState.accentColor;

  const glowRef = useRef(droneState.glowMode);
  glowRef.current = droneState.glowMode;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Software WebGL detection guard
    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return true;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();

    // Scene & Camera
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f131a);
    scene.fog = new THREE.FogExp2(0x0f131a, 0.035);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    camera.position.set(4, 3, 5);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 2;
    controls.maxDistance = 12;

    // Studio Lighting & PMREM Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = !isSoftwareGl;
    if (dirLight.castShadow) {
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.bias = -0.0005;
    }
    scene.add(dirLight);

    const fillLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.8);
    scene.add(fillLight);

    // Ground & Contact Shadow
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x161b22,
      roughness: 0.85,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    // Composite 10-Part Procedural Sci-Fi Drone Group (bottom-center pivot flush with ground)
    const droneGroup = new THREE.Group();
    droneGroup.position.set(0, 0, 0);
    scene.add(droneGroup);

    // Parts storage for dynamic updates
    const hullParts: THREE.Mesh[] = [];
    const accentParts: THREE.Mesh[] = [];
    const rotors: THREE.Group[] = [];

    // 1. Primary Hull Body
    const hullMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      metalness: 0.8,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const hullGeo = new THREE.CylinderGeometry(0.8, 1.1, 0.35, 32);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.6;
    hull.castShadow = true;
    hull.receiveShadow = true;
    droneGroup.add(hull);
    hullParts.push(hull);

    // 2. Secondary Command Dome (Glass Canopy)
    const domeMat = new THREE.MeshPhysicalMaterial({
      color: 0x93c5fd,
      metalness: 0.1,
      roughness: 0.1,
      transmission: 0.85,
      ior: 1.5,
      transparent: true,
      opacity: 0.9,
    });
    const domeGeo = new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 0.75;
    dome.castShadow = true;
    droneGroup.add(dome);

    // 3. Accent Energy Core Ring
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.8,
      metalness: 0.5,
      roughness: 0.2,
    });
    const coreGeo = new THREE.TorusGeometry(0.7, 0.06, 16, 48);
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.rotation.x = Math.PI / 2;
    core.position.y = 0.6;
    droneGroup.add(core);
    accentParts.push(core);

    // 4-7. Four Rotor Arms & Motors & Blades (Quadcopter Architecture)
    const armMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.3,
    });

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.4,
      roughness: 0.1,
      side: THREE.DoubleSide,
    });

    const rotorOffsets = [
      [1.2, 0.7, 1.2],
      [-1.2, 0.7, 1.2],
      [1.2, 0.7, -1.2],
      [-1.2, 0.7, -1.2],
    ];

    rotorOffsets.forEach(([x, y, z]) => {
      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(x, y, z);

      // Arm strut
      const armGeo = new THREE.BoxGeometry(1.6, 0.12, 0.18);
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.position.set(-x * 0.5, 0, -z * 0.5);
      arm.rotation.y = Math.atan2(z, x);
      arm.castShadow = true;
      droneGroup.add(arm);

      // Motor housing
      const motorGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.25, 24);
      const motor = new THREE.Mesh(motorGeo, armMat);
      motor.position.set(0, 0, 0);
      motor.castShadow = true;
      rotorGroup.add(motor);

      // Spinning Blade Propeller
      const bladeGeo = new THREE.BoxGeometry(1.6, 0.03, 0.14);
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.set(0, 0.15, 0);
      blade.castShadow = true;
      rotorGroup.add(blade);

      droneGroup.add(rotorGroup);
      rotors.push(rotorGroup);
    });

    // 8-10. Landing Gear Struts (Tri-pod Skid Architecture)
    const skidMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.4,
    });
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const skidGroup = new THREE.Group();
      skidGroup.rotation.y = angle;

      const legGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.9, 12);
      const leg = new THREE.Mesh(legGeo, skidMat);
      leg.position.set(0.6, 0.2, 0);
      leg.rotation.z = -0.35;
      leg.castShadow = true;
      skidGroup.add(leg);

      const footGeo = new THREE.BoxGeometry(0.6, 0.08, 0.18);
      const foot = new THREE.Mesh(footGeo, skidMat);
      foot.position.set(0.9, -0.22, 0);
      foot.castShadow = true;
      skidGroup.add(foot);

      droneGroup.add(skidGroup);
    }

    // Soft Radial Contact Shadow under drone
    const shadowGeo = new THREE.PlaneGeometry(2.2, 2.2);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.65)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(canvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    // Animation Loop
    let clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      const dt = clock.getDelta();
      const time = clock.getElapsedTime();

      // Gentle hovering animation
      droneGroup.position.y = 1.2 + Math.sin(time * 2.2) * 0.12;
      droneGroup.rotation.y = time * 0.35;
      droneGroup.rotation.z = Math.cos(time * 1.5) * 0.04;
      droneGroup.rotation.x = Math.sin(time * 1.8) * 0.04;

      // Spin rotors rapidly
      rotors.forEach((r, idx) => {
        const sign = idx % 2 === 0 ? 1 : -1;
        r.rotation.y += speedRef.current * sign * dt * 10;
      });

      // Update materials based on state ref
      hullParts.forEach((m) => {
        (m.material as THREE.MeshPhysicalMaterial).color.set(hullColorRef.current);
      });
      accentParts.forEach((m) => {
        (m.material as THREE.MeshStandardMaterial).color.set(accentColorRef.current);
        (m.material as THREE.MeshStandardMaterial).emissive.set(accentColorRef.current);
        (m.material as THREE.MeshStandardMaterial).emissiveIntensity = glowRef.current ? 1.0 : 0.1;
      });

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameId = window.setTimeout(animate, 40);
      } else {
        frameId = requestAnimationFrame(animate);
      }
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.dispose();
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: "#0f131a" }}>
      {/* Full-bleed 3D Canvas Container */}
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* Top Header Badge */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold backdrop-blur-md" style={{ backgroundColor: "rgba(22,27,36,0.8)", borderColor: "rgba(255,255,255,0.1)", color: "#EEF2F7" }}>
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span>استوديو نماذج Three.js الإجرائية (10 أجزاء PBR)</span>
      </div>

      {/* Viewport-First Collapsible Bottom Control Dock */}
      <div className="absolute bottom-6 left-1/2 z-20 w-[94vw] max-w-2xl -translate-x-1/2 transform transition-all duration-300">
        <div
          className="rounded-2xl border p-4 shadow-2xl backdrop-blur-md"
          style={{
            backgroundColor: "rgba(22, 27, 36, 0.9)",
            borderColor: "rgba(255, 255,255, 0.12)",
            color: "#EEF2F7",
          }}
        >
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <div className="flex items-center gap-2 text-xs font-bold">
              <Layers className="h-4 w-4 text-blue-400" />
              <span>لوحة تحكم النموذج والجو الإضاءة الاستوديو</span>
            </div>
            <button
              type="button"
              onClick={() => setHudCollapsed(!hudCollapsed)}
              className="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/10"
              style={{ borderColor: "rgba(255,255,255,0.15)" }}
            >
              {hudCollapsed ? "▴ إظهار التحكم" : "▾ إخفاء التحكم"}
            </button>
          </div>

          {!hudCollapsed && (
            <div className="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <RotateCw className="h-3.5 w-3.5 text-blue-400" />
                  <span>سرعة الدوران والمحركات: {droneState.rotorSpeed.toFixed(1)}x</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={droneState.rotorSpeed}
                  onChange={(e) => setDroneState({ ...droneState, rotorSpeed: Number(e.target.value) })}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-around gap-2 pt-1">
                <div className="space-y-1 text-center">
                  <span className="text-[11px] text-slate-400 block">لون الهيكل</span>
                  <div className="flex gap-1.5">
                    {["#3B82F6", "#10B981", "#8B5CF6", "#EF4444"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDroneState({ ...droneState, hullColor: c })}
                        className={`h-6 w-6 rounded-full border transition-transform ${droneState.hullColor === c ? "scale-110 ring-2 ring-white" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1 text-center">
                  <span className="text-[11px] text-slate-400 block">لون الطاقة</span>
                  <div className="flex gap-1.5">
                    {["#F59E0B", "#EC4899", "#06B6D4", "#EAB308"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setDroneState({ ...droneState, accentColor: c })}
                        className={`h-6 w-6 rounded-full border transition-transform ${droneState.accentColor === c ? "scale-110 ring-2 ring-white" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
