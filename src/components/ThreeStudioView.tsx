import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Layers, RotateCcw, RotateCw, Sparkles } from "lucide-react";

type ScenePresetId = "drone" | "reactor" | "crystal";

const PRESETS: Array<{ id: ScenePresetId; label: string }> = [
  { id: "drone", label: "طائرة مسيّرة" },
  { id: "reactor", label: "نواة المفاعل" },
  { id: "crystal", label: "هيكل بلوري" },
];

export default function ThreeStudioView() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [sceneState, setSceneState] = useState<{
    preset: ScenePresetId;
    rotorSpeed: number;
    hullColor: string;
    accentColor: string;
    glowMode: boolean;
  }>({
    preset: "drone",
    rotorSpeed: 3.5,
    hullColor: "#3B82F6",
    accentColor: "#F59E0B",
    glowMode: true,
  });

  const presetRef = useRef<ScenePresetId>(sceneState.preset);
  presetRef.current = sceneState.preset;

  const speedRef = useRef(sceneState.rotorSpeed);
  speedRef.current = sceneState.rotorSpeed;

  const hullColorRef = useRef(sceneState.hullColor);
  hullColorRef.current = sceneState.hullColor;

  const accentColorRef = useRef(sceneState.accentColor);
  accentColorRef.current = sceneState.accentColor;

  const glowRef = useRef(sceneState.glowMode);
  glowRef.current = sceneState.glowMode;

  const resetCamFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

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

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f131a);
    scene.fog = new THREE.FogExp2(0x0f131a, 0.032);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(4.2, 2.8, 5.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 2.2;
    controls.maxDistance = 12;

    resetCamFnRef.current = () => {
      camera.position.set(4.2, 2.8, 5.2);
      controls.target.set(0, 0.9, 0);
      controls.update();
    };
    controls.target.set(0, 0.9, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dirLight = new THREE.DirectionalLight(0xffedd5, 2.2);
    dirLight.position.set(5, 8, 4);
    dirLight.castShadow = !isSoftwareGl;
    if (dirLight.castShadow) {
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.bias = -0.0005;
    }
    scene.add(dirLight);
    scene.add(new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.75));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 34),
      new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.85, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = !isSoftwareGl;
    scene.add(ground);

    const grid = new THREE.GridHelper(24, 24, 0x334155, 0x1e293b);
    grid.position.y = 0.002;
    scene.add(grid);

    const hullMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b82f6,
      metalness: 0.8,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.9,
      metalness: 0.5,
      roughness: 0.2,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.3,
    });

    // Preset 1: Sci-Fi Drone
    const droneGroup = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 0.35, 32), hullMat);
    hull.position.y = 0.6;
    hull.castShadow = true;
    droneGroup.add(hull);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({
        color: 0x93c5fd,
        metalness: 0.1,
        roughness: 0.1,
        transmission: 0.85,
        ior: 1.5,
        transparent: true,
        opacity: 0.9,
      })
    );
    dome.position.y = 0.75;
    droneGroup.add(dome);

    const core = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 16, 48), accentMat);
    core.rotation.x = Math.PI / 2;
    core.position.y = 0.6;
    droneGroup.add(core);

    const rotors: THREE.Group[] = [];
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.4,
      roughness: 0.1,
      side: THREE.DoubleSide,
    });
    [
      [1.2, 0.7, 1.2],
      [-1.2, 0.7, 1.2],
      [1.2, 0.7, -1.2],
      [-1.2, 0.7, -1.2],
    ].forEach(([x, y, z]) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.18), frameMat);
      arm.position.set(x * 0.5, y, z * 0.5);
      arm.rotation.y = Math.atan2(z, x);
      arm.castShadow = true;
      droneGroup.add(arm);

      const rg = new THREE.Group();
      rg.position.set(x, y, z);
      rg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.25, 24), frameMat));
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.14), bladeMat);
      blade.position.y = 0.15;
      rg.add(blade);
      droneGroup.add(rg);
      rotors.push(rg);
    });
    scene.add(droneGroup);

    // Preset 2: Orbital Reactor
    const reactorGroup = new THREE.Group();
    const sphereCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 2), accentMat);
    sphereCore.position.y = 1.4;
    reactorGroup.add(sphereCore);
    const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 16, 64), hullMat);
    ringA.position.y = 1.4;
    const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.07, 16, 64), frameMat);
    ringB.position.y = 1.4;
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.3, 32), frameMat);
    pedestal.position.y = 0.15;
    reactorGroup.add(ringA, ringB, pedestal);
    scene.add(reactorGroup);

    // Preset 3: Geometric Crystal Matrix
    const crystalGroup = new THREE.Group();
    const crystalMain = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), hullMat);
    crystalMain.position.y = 1.5;
    const crystalWire = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.32, 0),
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true })
    );
    crystalWire.position.y = 1.5;
    const satellites: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const sat = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), accentMat);
      satellites.push(sat);
      crystalGroup.add(sat);
    }
    crystalGroup.add(crystalMain, crystalWire);
    scene.add(crystalGroup);

    // Contact shadow
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sctx = shadowCanvas.getContext("2d")!;
    const grad = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.6)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 128, 128);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas),
        transparent: true,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.01;
    scene.add(contactShadow);

    const clock = new THREE.Clock();
    let timerId: number | null = null;
    let disposed = false;

    const afterDraw = (tick: () => void) => {
      if (disposed) return;
      if (isSoftwareGl) {
        timerId = window.setTimeout(() => requestAnimationFrame(tick), 250);
      } else {
        requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const time = clock.getElapsedTime();
      const activePreset = presetRef.current;

      droneGroup.visible = activePreset === "drone";
      reactorGroup.visible = activePreset === "reactor";
      crystalGroup.visible = activePreset === "crystal";

      hullMat.color.set(hullColorRef.current);
      accentMat.color.set(accentColorRef.current);
      accentMat.emissive.set(accentColorRef.current);
      accentMat.emissiveIntensity = glowRef.current ? 1.0 : 0.15;

      const sp = speedRef.current;
      if (activePreset === "drone") {
        droneGroup.position.y = 0.8 + Math.sin(time * 2.1) * 0.12;
        droneGroup.rotation.y += sp * 0.1 * dt;
        rotors.forEach((r, idx) => {
          r.rotation.y += sp * (idx % 2 === 0 ? 1 : -1) * dt * 9;
        });
      } else if (activePreset === "reactor") {
        sphereCore.rotation.y += sp * 0.4 * dt;
        ringA.rotation.x += sp * 0.55 * dt;
        ringA.rotation.y += sp * 0.35 * dt;
        ringB.rotation.z += sp * 0.45 * dt;
        ringB.rotation.x -= sp * 0.25 * dt;
      } else {
        crystalMain.rotation.y += sp * 0.4 * dt;
        crystalWire.rotation.y -= sp * 0.3 * dt;
        crystalMain.position.y = 1.5 + Math.sin(time * 1.8) * 0.1;
        satellites.forEach((s, idx) => {
          const ang = time * (0.5 + sp * 0.2) + (idx * Math.PI * 2) / satellites.length;
          s.position.set(Math.cos(ang) * 1.85, 1.5 + Math.sin(ang * 2) * 0.25, Math.sin(ang) * 1.85);
          s.rotation.y += dt * 2;
        });
      }

      controls.update();
      renderer.render(scene, camera);
      afterDraw(tick);
    };

    requestAnimationFrame(tick);

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || disposed) return;
      const w = Math.max(entry.contentRect.width, 100);
      const h = Math.max(entry.contentRect.height, 100);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      if (timerId !== null) clearTimeout(timerId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: "#0f131a" }}>
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* Crisp Solid Overlay Badge (No backdrop-blur over WebGL) */}
      <div
        className="absolute top-4 start-4 z-10 flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold"
        style={{
          backgroundColor: "rgba(18, 24, 34, 0.94)",
          borderColor: "rgba(255,255,255,0.14)",
          color: "#EEF2F7",
        }}
      >
        <Sparkles className="h-4 w-4 text-amber-400" />
        <span>استوديو التصميم ثلاثي الأبعاد</span>
      </div>

      {/* Collapsible Bottom Control Dock (Solid dark rgba, no backdrop-blur over WebGL) */}
      <div className="absolute bottom-5 left-1/2 z-20 w-[94vw] max-w-2xl -translate-x-1/2">
        <div
          className="rounded-2xl border p-4 shadow-2xl"
          style={{
            backgroundColor: "rgba(18, 24, 34, 0.95)",
            borderColor: "rgba(255, 255, 255, 0.14)",
            color: "#EEF2F7",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
            <div className="flex items-center gap-2 text-xs font-bold">
              <Layers className="h-4 w-4 text-blue-400" />
              <span>إعدادات المشهد والإضاءة</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSceneState((s) => ({ ...s, preset: p.id }))}
                  className="rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: sceneState.preset === p.id ? "#2563EB" : "rgba(255,255,255,0.06)",
                    borderColor: sceneState.preset === p.id ? "#3B82F6" : "rgba(255,255,255,0.12)",
                    color: "#FFFFFF",
                  }}
                >
                  {p.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => resetCamFnRef.current?.()}
                aria-label="إعادة ضبط الكاميرا"
                className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] hover:bg-white/10"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}
              >
                <RotateCcw className="h-3 w-3" />
                <span>توسيط</span>
              </button>

              <button
                type="button"
                onClick={() => setHudCollapsed(!hudCollapsed)}
                className="rounded-lg border px-2.5 py-1 text-[11px] font-medium hover:bg-white/10"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}
              >
                {hudCollapsed ? "إظهار" : "إخفاء"}
              </button>
            </div>
          </div>

          {!hudCollapsed && (
            <div className="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <RotateCw className="h-3.5 w-3.5 text-blue-400" />
                  <span>سرعة الحركة والدوران: {sceneState.rotorSpeed.toFixed(1)}x</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={sceneState.rotorSpeed}
                  onChange={(e) => setSceneState((s) => ({ ...s, rotorSpeed: Number(e.target.value) }))}
                  className="w-full cursor-pointer accent-blue-500"
                />
              </div>

              <div className="flex items-center justify-around gap-2 pt-1">
                <div className="space-y-1 text-center">
                  <span className="block text-[11px] text-slate-400">لون الهيكل</span>
                  <div className="flex gap-1.5">
                    {["#3B82F6", "#10B981", "#8B5CF6", "#EF4444"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`لون الهيكل ${c}`}
                        onClick={() => setSceneState((s) => ({ ...s, hullColor: c }))}
                        className={`h-6 w-6 rounded-full border transition-transform ${sceneState.hullColor === c ? "scale-110 ring-2 ring-white" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1 text-center">
                  <span className="block text-[11px] text-slate-400">لون الطاقة</span>
                  <div className="flex gap-1.5">
                    {["#F59E0B", "#EC4899", "#06B6D4", "#EAB308"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={`لون الطاقة ${c}`}
                        onClick={() => setSceneState((s) => ({ ...s, accentColor: c }))}
                        className={`h-6 w-6 rounded-full border transition-transform ${sceneState.accentColor === c ? "scale-110 ring-2 ring-white" : ""}`}
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
