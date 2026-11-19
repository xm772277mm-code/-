import React, { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Trophy, Volume2, VolumeX } from "lucide-react";
import { useUiSettings } from "../contexts/UiSettingsContext.tsx";
import { getGoogleAuthHeaders } from "../firebase.ts";
import arenaBackdrop from "../assets/images/nawa_core_arena_1795107537203.jpg";

type GamePhase = "title" | "playing" | "paused" | "victory" | "gameover";

interface LeaderboardEntry {
  id: number;
  playerName: string;
  score: number;
  wave: number;
  outcome: string;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Enemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  kind: "scout" | "heavy" | "boss";
  flash: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const ARENA_W = 860;
const ARENA_H = 520;
const MAX_WAVE = 5;

export default function GameStudioView() {
  const { user } = useUiSettings();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<GamePhase>("title");
  const [score, setScore] = useState(0);
  const [wave, setWave] = useState(1);
  const [coreHp, setCoreHp] = useState(100);
  const [muted, setMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;
  const mutedRef = useRef<boolean>(muted);
  mutedRef.current = muted;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  // Mutable simulation state
  const simRef = useRef({
    playerX: ARENA_W / 2,
    playerY: ARENA_H / 2 + 80,
    aimX: ARENA_W / 2,
    aimY: ARENA_H / 2 - 100,
    keys: { up: false, down: false, left: false, right: false, fire: false },
    bullets: [] as Bullet[],
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    fireCooldown: 0,
    spawnTimer: 0.6,
    enemiesRemainingToSpawn: 10,
    score: 0,
    wave: 1,
    hp: 100,
    shake: 0,
    coreFlash: 0,
  });

  const playTone = (freq: number, duration: number, type: OscillatorType = "triangle", gainVal = 0.08) => {
    if (mutedRef.current) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.45), ctx.currentTime + duration);
      gain.gain.setValueAtTime(gainVal, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // ignore audio errors
    }
  };

  const fetchScores = async () => {
    try {
      const res = await fetch("/api/sql/scores");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.scores)) setLeaderboard(data.scores);
      }
    } catch {
      // ignore
    }
  };

  const submitFinalScore = async (finalScore: number, finalWave: number, outcome: string) => {
    if (!user || finalScore <= 0) return;
    try {
      const headers = await getGoogleAuthHeaders();
      const res = await fetch("/api/sql/scores", {
        method: "POST",
        headers,
        body: JSON.stringify({ score: finalScore, wave: finalWave, outcome }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.scores)) setLeaderboard(data.scores);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchScores();
    const img = new Image();
    img.src = arenaBackdrop;
    img.onload = () => {
      bgImgRef.current = img;
    };
  }, []);

  const resetAndStartGame = () => {
    simRef.current = {
      playerX: ARENA_W / 2,
      playerY: ARENA_H / 2 + 85,
      aimX: ARENA_W / 2,
      aimY: 80,
      keys: { up: false, down: false, left: false, right: false, fire: false },
      bullets: [],
      enemies: [],
      particles: [],
      fireCooldown: 0,
      spawnTimer: 0.4,
      enemiesRemainingToSpawn: 9,
      score: 0,
      wave: 1,
      hp: 100,
      shake: 0,
      coreFlash: 0,
    };
    setScore(0);
    setWave(1);
    setCoreHp(100);
    setPhase("playing");
    playTone(520, 0.16, "sine", 0.1);
  };

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || e.key === "ArrowUp") simRef.current.keys.up = true;
      if (k === "s" || e.key === "ArrowDown") simRef.current.keys.down = true;
      if (k === "a" || e.key === "ArrowLeft") simRef.current.keys.left = true;
      if (k === "d" || e.key === "ArrowRight") simRef.current.keys.right = true;
      if (e.key === " ") {
        simRef.current.keys.fire = true;
        if (phaseRef.current === "playing") e.preventDefault();
      }
      if (k === "p" || e.key === "Escape") {
        setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "w" || e.key === "ArrowUp") simRef.current.keys.up = false;
      if (k === "s" || e.key === "ArrowDown") simRef.current.keys.down = false;
      if (k === "a" || e.key === "ArrowLeft") simRef.current.keys.left = false;
      if (k === "d" || e.key === "ArrowRight") simRef.current.keys.right = false;
      if (e.key === " ") simRef.current.keys.fire = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Main 60FPS requestAnimationFrame game loop with clamped dt
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const spawnEnemy = (currentWave: number) => {
      const side = Math.floor(Math.random() * 4);
      let x = 0;
      let y = 0;
      if (side === 0) {
        x = Math.random() * ARENA_W;
        y = -24;
      } else if (side === 1) {
        x = ARENA_W + 24;
        y = Math.random() * ARENA_H;
      } else if (side === 2) {
        x = Math.random() * ARENA_W;
        y = ARENA_H + 24;
      } else {
        x = -24;
        y = Math.random() * ARENA_H;
      }

      const cx = ARENA_W / 2;
      const cy = ARENA_H / 2;
      const angle = Math.atan2(cy - y, cx - x);
      const isHeavy = currentWave >= 2 && Math.random() < 0.28;
      const isBoss = currentWave === MAX_WAVE && simRef.current.enemiesRemainingToSpawn === 1;
      const speed = isBoss ? 48 : isHeavy ? 64 + currentWave * 6 : 95 + currentWave * 14;
      const hp = isBoss ? 14 : isHeavy ? 3 : 1;

      simRef.current.enemies.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: isBoss ? 26 : isHeavy ? 17 : 12,
        hp,
        maxHp: hp,
        kind: isBoss ? "boss" : isHeavy ? "heavy" : "scout",
        flash: 0,
      });
    };

    const burstParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 60 + Math.random() * 170;
        simRef.current.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.38,
          maxLife: 0.38,
          color,
          size: 2.2 + Math.random() * 2.5,
        });
      }
    };

    const loop = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const s = simRef.current;

      if (phaseRef.current === "playing") {
        // Player movement
        const moveSpeed = 265;
        let dx = (s.keys.right ? 1 : 0) - (s.keys.left ? 1 : 0);
        let dy = (s.keys.down ? 1 : 0) - (s.keys.up ? 1 : 0);
        if (dx !== 0 && dy !== 0) {
          dx *= 0.7071;
          dy *= 0.7071;
        }
        s.playerX = Math.max(26, Math.min(ARENA_W - 26, s.playerX + dx * moveSpeed * dt));
        s.playerY = Math.max(26, Math.min(ARENA_H - 26, s.playerY + dy * moveSpeed * dt));

        // Shooting
        s.fireCooldown -= dt;
        if ((s.keys.fire || s.enemies.length > 0) && s.fireCooldown <= 0) {
          const ang = Math.atan2(s.aimY - s.playerY, s.aimX - s.playerX);
          const bSpeed = 540;
          s.bullets.push({
            x: s.playerX + Math.cos(ang) * 18,
            y: s.playerY + Math.sin(ang) * 18,
            vx: Math.cos(ang) * bSpeed,
            vy: Math.sin(ang) * bSpeed,
            life: 1.5,
          });
          s.fireCooldown = 0.16;
          if (s.keys.fire) playTone(760, 0.06, "triangle", 0.05);
        }

        // Update bullets
        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i];
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
          if (b.life <= 0 || b.x < -10 || b.x > ARENA_W + 10 || b.y < -10 || b.y > ARENA_H + 10) {
            s.bullets.splice(i, 1);
          }
        }

        // Wave spawning
        s.spawnTimer -= dt;
        if (s.enemiesRemainingToSpawn > 0 && s.spawnTimer <= 0) {
          spawnEnemy(s.wave);
          s.enemiesRemainingToSpawn -= 1;
          s.spawnTimer = Math.max(0.32, 1.05 - s.wave * 0.13);
        }

        // Update enemies & collisions
        const coreX = ARENA_W / 2;
        const coreY = ARENA_H / 2;

        for (let i = s.enemies.length - 1; i >= 0; i--) {
          const e = s.enemies[i];
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.flash > 0) e.flash = Math.max(0, e.flash - dt);

          // Bullet hits
          let destroyed = false;
          for (let j = s.bullets.length - 1; j >= 0; j--) {
            const b = s.bullets[j];
            const distSq = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
            if (distSq <= (e.radius + 5) ** 2) {
              s.bullets.splice(j, 1);
              e.hp -= 1;
              e.flash = 0.12;
              burstParticles(b.x, b.y, "#38BDF8", 5);
              if (e.hp <= 0) {
                const pts = e.kind === "boss" ? 300 : e.kind === "heavy" ? 50 : 20;
                s.score += pts;
                setScore(s.score);
                burstParticles(e.x, e.y, e.kind === "boss" ? "#F59E0B" : "#60A5FA", 14);
                playTone(e.kind === "boss" ? 220 : 340, 0.12, "sawtooth", 0.06);
                s.enemies.splice(i, 1);
                destroyed = true;
                break;
              }
            }
          }
          if (destroyed) continue;

          // Enemy reaches central core
          const distCore = Math.hypot(e.x - coreX, e.y - coreY);
          if (distCore < e.radius + 26) {
            const dmg = e.kind === "boss" ? 40 : e.kind === "heavy" ? 20 : 12;
            s.hp = Math.max(0, s.hp - dmg);
            setCoreHp(s.hp);
            s.shake = 0.25;
            s.coreFlash = 0.2;
            burstParticles(e.x, e.y, "#EF4444", 16);
            playTone(130, 0.22, "sawtooth", 0.11);
            s.enemies.splice(i, 1);
            if (s.hp <= 0) {
              setPhase("gameover");
              void submitFinalScore(s.score, s.wave, "defeated");
              break;
            }
          }
        }

        // Next wave / victory check
        if (s.hp > 0 && s.enemiesRemainingToSpawn === 0 && s.enemies.length === 0) {
          if (s.wave >= MAX_WAVE) {
            s.score += s.hp * 5;
            setScore(s.score);
            setPhase("victory");
            playTone(660, 0.3, "sine", 0.1);
            void submitFinalScore(s.score, s.wave, "victory");
          } else {
            s.wave += 1;
            setWave(s.wave);
            s.enemiesRemainingToSpawn = 8 + s.wave * 4;
            s.spawnTimer = 1.1;
            playTone(580, 0.2, "sine", 0.08);
          }
        }

        // Update particles
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0) s.particles.splice(i, 1);
        }

        if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);
        if (s.coreFlash > 0) s.coreFlash = Math.max(0, s.coreFlash - dt);
      }

      // Render Arena
      ctx.save();
      if (s.shake > 0) {
        const mag = s.shake * 18;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }

      ctx.fillStyle = "#090D16";
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);

      if (bgImgRef.current) {
        ctx.globalAlpha = 0.34;
        ctx.drawImage(bgImgRef.current, 0, 0, ARENA_W, ARENA_H);
        ctx.globalAlpha = 1;
      }

      // Subtle orbital rings
      ctx.strokeStyle = "rgba(59, 130, 246, 0.18)";
      ctx.lineWidth = 1.5;
      [90, 165, 245].forEach((r) => {
        ctx.beginPath();
        ctx.arc(ARENA_W / 2, ARENA_H / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Central Energy Core
      const coreGrad = ctx.createRadialGradient(
        ARENA_W / 2,
        ARENA_H / 2,
        4,
        ARENA_W / 2,
        ARENA_H / 2,
        34
      );
      coreGrad.addColorStop(0, s.coreFlash > 0 ? "#FCA5A5" : "#FEF08A");
      coreGrad.addColorStop(0.5, s.coreFlash > 0 ? "#EF4444" : "#F59E0B");
      coreGrad.addColorStop(1, "rgba(245,158,11,0)");
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(ARENA_W / 2, ARENA_H / 2, 34, 0, Math.PI * 2);
      ctx.fill();

      // Player Ship
      const aimAng = Math.atan2(s.aimY - s.playerY, s.aimX - s.playerX);
      ctx.save();
      ctx.translate(s.playerX, s.playerY);
      ctx.rotate(aimAng);
      ctx.fillStyle = "#3B82F6";
      ctx.strokeStyle = "#E2E8F0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-13, 12);
      ctx.lineTo(-8, 0);
      ctx.lineTo(-13, -12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Bullets
      ctx.fillStyle = "#38BDF8";
      for (const b of s.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Enemies
      for (const e of s.enemies) {
        ctx.fillStyle =
          e.flash > 0
            ? "#FFFFFF"
            : e.kind === "boss"
              ? "#F59E0B"
              : e.kind === "heavy"
                ? "#EC4899"
                : "#EF4444";
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Particles
      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const updateAimFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    simRef.current.aimX = ((clientX - rect.left) / rect.width) * ARENA_W;
    simRef.current.aimY = ((clientY - rect.top) / rect.height) * ARENA_H;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {/* Compact Game HUD */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="flex items-center gap-4 text-xs font-semibold">
          <span>
            النقاط: <strong className="font-mono text-sm">{score}</strong>
          </span>
          <span>
            الموجة: <strong className="font-mono text-sm">{wave}/{MAX_WAVE}</strong>
          </span>
          <div className="flex items-center gap-2">
            <span>طاقة النواة:</span>
            <div className="h-2.5 w-24 overflow-hidden rounded-full bg-slate-700/40">
              <div
                className="h-full transition-all"
                style={{
                  width: `${coreHp}%`,
                  backgroundColor: coreHp > 45 ? "#10B981" : coreHp > 20 ? "#F59E0B" : "#EF4444",
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{ borderColor: "var(--nawa-border)", color: "var(--nawa-text)" }}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {phase === "playing" && (
            <button
              type="button"
              onClick={() => setPhase("paused")}
              className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-medium"
              style={{ borderColor: "var(--nawa-border)" }}
            >
              <Pause className="h-3.5 w-3.5" />
              <span>إيقاف مؤقت</span>
            </button>
          )}
          {phase === "paused" && (
            <button
              type="button"
              onClick={() => setPhase("playing")}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <Play className="h-3.5 w-3.5" />
              <span>متابعة</span>
            </button>
          )}
        </div>
      </div>

      {/* Canvas Arena Container */}
      <div className="relative overflow-hidden rounded-2xl border bg-[#090D16]" style={{ borderColor: "var(--nawa-border)" }}>
        <canvas
          ref={canvasRef}
          width={ARENA_W}
          height={ARENA_H}
          onMouseMove={(e) => updateAimFromPointer(e.clientX, e.clientY)}
          onMouseDown={(e) => {
            updateAimFromPointer(e.clientX, e.clientY);
            simRef.current.keys.fire = true;
          }}
          onMouseUp={() => {
            simRef.current.keys.fire = false;
          }}
          onTouchStart={(e) => {
            if (e.touches[0]) {
              updateAimFromPointer(e.touches[0].clientX, e.touches[0].clientY);
              simRef.current.keys.fire = true;
            }
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) updateAimFromPointer(e.touches[0].clientX, e.touches[0].clientY);
          }}
          onTouchEnd={() => {
            simRef.current.keys.fire = false;
          }}
          className="block aspect-[860/520] w-full cursor-crosshair touch-none"
        />

        {/* Title Screen Overlay */}
        {phase === "title" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 p-6 text-center text-white">
            <h1 className="font-display text-3xl font-bold sm:text-4xl">حارس النواة</h1>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-300">
              تحرّك بـ WASD أو الأسهم ووجّه بالماوس للدفاع عن نواة الطاقة عبر 5 موجات متصاعدة.
            </p>
            <button
              type="button"
              onClick={resetAndStartGame}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-7 text-sm font-bold text-white shadow-lg"
              style={{ backgroundColor: "var(--nawa-accent)" }}
            >
              <Play className="h-4 w-4" />
              <span>ابدأ اللعب</span>
            </button>
          </div>
        )}

        {/* Pause / Victory / Game Over Modal */}
        {(phase === "paused" || phase === "victory" || phase === "gameover") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-6 text-center text-white">
            <h2 className="font-display text-2xl font-bold">
              {phase === "paused"
                ? "تم إيقاف اللعبة مؤقتاً"
                : phase === "victory"
                  ? "انتصار ساحق! حميت النواة بنجاح"
                  : "انتهت الجولة!"}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              النتيجة: <strong className="text-amber-400">{score}</strong> · الموجة:{" "}
              <strong>{wave}/{MAX_WAVE}</strong>
            </p>
            <div className="mt-5 flex items-center gap-3">
              {phase === "paused" && (
                <button
                  type="button"
                  onClick={() => setPhase("playing")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-xs font-semibold text-white"
                  style={{ backgroundColor: "var(--nawa-accent)" }}
                >
                  <Play className="h-4 w-4" />
                  <span>استئناف</span>
                </button>
              )}
              <button
                type="button"
                onClick={resetAndStartGame}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-xs font-semibold text-white"
              >
                <RotateCcw className="h-4 w-4" />
                <span>لعب جولة جديدة</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Persistent Cloud SQL Leaderboard */}
      <div
        className="rounded-2xl border p-5 space-y-3"
        style={{
          backgroundColor: "var(--nawa-surface)",
          borderColor: "var(--nawa-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="font-display text-sm font-bold">لوحة المتصدرين</h3>
          </div>
          {!user && (
            <span className="text-[11px]" style={{ color: "var(--nawa-muted)" }}>
              سجّل الدخول بحساب Google لحفظ نتيجتك في اللوحة
            </span>
          )}
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--nawa-muted)" }}>
            لا توجد نتائج مسجلة بعد — كن أول من يسجل رقماً قياسياً!
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {leaderboard.slice(0, 6).map((row, idx) => (
              <div
                key={row.id}
                className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs"
                style={{
                  backgroundColor: "var(--nawa-elevated)",
                  borderColor: "var(--nawa-border)",
                }}
              >
                <span className="truncate font-semibold">
                  #{idx + 1} {row.playerName}
                </span>
                <span className="font-mono font-bold" style={{ color: "var(--nawa-accent)" }}>
                  {row.score}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
