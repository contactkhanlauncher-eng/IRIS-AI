import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Pause, Play, RotateCcw, ArrowLeft } from 'lucide-react';
import { gameAudio } from '../utils/gameAudio';

type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type DifficultyMode = 'standard' | 'overdrive';
type EnemyKind = 'swarm' | 'siege' | 'splitter' | 'shard';

interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  hitFlash: number;
  windup: number; // > 0 means telegraphing shot
  fired: boolean;
  angle: number;
}

interface BulletEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  fromPlayer: boolean;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface HudSnapshot {
  hp: number;
  maxHp: number;
  score: number;
  bestScore: number;
  wave: number;
  empCharge: number;
  neutralized: number;
  combo: number;
}

interface IrisGameProps {
  onExitToAssistant: () => void;
}

const BEST_SCORE_KEY = 'iris_core_defense_best_v1';
const MAX_PARTICLES = 180;

export function IrisGame({ onExitToAssistant }: IrisGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [difficulty, setDifficulty] = useState<DifficultyMode>('standard');
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState<HudSnapshot>(() => {
    let savedBest = 0;
    try {
      savedBest = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
    } catch {
      savedBest = 0;
    }
    return {
      hp: 100,
      maxHp: 100,
      score: 0,
      bestScore: savedBest,
      wave: 1,
      empCharge: 0,
      neutralized: 0,
      combo: 1,
    };
  });

  const phaseRef = useRef<GamePhase>('TITLE_MENU');
  phaseRef.current = phase;
  const difficultyRef = useRef<DifficultyMode>('standard');
  difficultyRef.current = difficulty;

  const simRef = useRef({
    width: 1280,
    height: 720,
    coreX: 640,
    coreY: 360,
    coreRadius: 34,
    orbitRadius: 72,
    turretAngle: -Math.PI / 2,
    recoil: 0,
    hp: 100,
    maxHp: 100,
    score: 0,
    bestScore: hud.bestScore,
    wave: 1,
    waveRemaining: 8,
    spawnTimer: 0.8,
    empCharge: 0,
    empWaveRadius: 0,
    empWaveAlpha: 0,
    hitstop: 0,
    shake: 0,
    coreFlash: 0,
    combo: 1,
    comboTimer: 0,
    neutralized: 0,
    fireCooldown: 0,
    fireBuffer: 0,
    empBuffer: 0,
    nextEnemyId: 1,
    enemies: [] as EnemyEntity[],
    bullets: [] as BulletEntity[],
    floatingTexts: [] as FloatingText[],
    particles: Array.from({ length: MAX_PARTICLES }, (): Particle => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      size: 2,
      color: '#22D3EE',
    })),
    heldKeys: new Set<string>(),
    mouseActive: false,
    mouseX: 640,
    mouseY: 200,
    mouseDown: false,
    bgStars: Array.from({ length: 64 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.7 + Math.random() * 1.4,
      alpha: 0.15 + Math.random() * 0.45,
      speed: 0.008 + Math.random() * 0.015,
    })),
    time: 0,
  });

  const syncHud = useCallback(() => {
    const s = simRef.current;
    setHud({
      hp: Math.max(0, Math.round(s.hp)),
      maxHp: s.maxHp,
      score: s.score,
      bestScore: s.bestScore,
      wave: s.wave,
      empCharge: Math.min(100, Math.floor(s.empCharge)),
      neutralized: s.neutralized,
      combo: s.combo,
    });
  }, []);

  const spawnParticles = (
    x: number,
    y: number,
    color: string,
    count: number,
    speedScale = 1
  ) => {
    const pool = simRef.current.particles;
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      if (!pool[i].active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (55 + Math.random() * 180) * speedScale;
        pool[i].active = true;
        pool[i].x = x;
        pool[i].y = y;
        pool[i].vx = Math.cos(angle) * speed;
        pool[i].vy = Math.sin(angle) * speed;
        pool[i].maxLife = 0.25 + Math.random() * 0.35;
        pool[i].life = pool[i].maxLife;
        pool[i].size = 1.8 + Math.random() * 2.8;
        pool[i].color = color;
        spawned += 1;
      }
    }
  };

  const resetSimulation = useCallback(() => {
    const s = simRef.current;
    const isOverdrive = difficultyRef.current === 'overdrive';
    s.hp = 100;
    s.maxHp = 100;
    s.score = 0;
    s.wave = 1;
    s.waveRemaining = isOverdrive ? 12 : 8;
    s.spawnTimer = 0.7;
    s.empCharge = isOverdrive ? 50 : 35;
    s.empWaveRadius = 0;
    s.empWaveAlpha = 0;
    s.hitstop = 0;
    s.shake = 0;
    s.coreFlash = 0;
    s.combo = 1;
    s.comboTimer = 0;
    s.neutralized = 0;
    s.fireCooldown = 0;
    s.fireBuffer = 0;
    s.empBuffer = 0;
    s.recoil = 0;
    s.enemies = [];
    s.bullets = [];
    s.floatingTexts = [];
    for (const p of s.particles) p.active = false;
    syncHud();
  }, [syncHud]);

  const startGame = useCallback(() => {
    resetSimulation();
    setPhase('PLAYING');
  }, [resetSimulation]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      gameAudio.setMuted(next);
      return next;
    });
  }, []);

  // Keyboard & Blur Listeners
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }

      if (phaseRef.current === 'TITLE_MENU') {
        if (code === 'Enter' || code === 'Space') {
          startGame();
        }
        return;
      }

      if (phaseRef.current === 'GAME_OVER') {
        if (code === 'Enter' || code === 'Space') {
          startGame();
        }
        return;
      }

      if (code === 'Escape') {
        setPhase((prev) => (prev === 'PLAYING' ? 'PAUSED' : prev === 'PAUSED' ? 'PLAYING' : prev));
        return;
      }

      if (phaseRef.current !== 'PLAYING') return;

      const s = simRef.current;
      s.heldKeys.add(code);
      if (code === 'Space') {
        s.fireBuffer = 0.14;
      }
      if (code === 'KeyE') {
        s.empBuffer = 0.18;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current.heldKeys.delete(e.code);
    };

    const onBlur = () => {
      simRef.current.heldKeys.clear();
      simRef.current.mouseDown = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [startGame]);

  // Isolated 60fps Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      simRef.current.width = w;
      simRef.current.height = h;
      simRef.current.coreX = w / 2;
      simRef.current.coreY = h / 2;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const spawnEnemy = () => {
      const s = simRef.current;
      const isOverdrive = difficultyRef.current === 'overdrive';
      const angle = Math.random() * Math.PI * 2;
      const spawnDist = Math.hypot(s.width, s.height) * 0.56 + 40;
      const x = s.coreX + Math.cos(angle) * spawnDist;
      const y = s.coreY + Math.sin(angle) * spawnDist;

      const roll = Math.random();
      let kind: EnemyKind = 'swarm';
      if (s.wave >= 2 && roll > 0.72) {
        kind = 'siege';
      } else if (s.wave >= 3 && roll > 0.52) {
        kind = 'splitter';
      }

      const speedMult = (1 + (s.wave - 1) * 0.09) * (isOverdrive ? 1.2 : 1);
      const baseSpeed =
        kind === 'siege' ? 54 * speedMult : kind === 'splitter' ? 78 * speedMult : 102 * speedMult;
      const hp = kind === 'siege' ? 3 : kind === 'splitter' ? 2 : 1;
      const radius = kind === 'siege' ? 20 : kind === 'splitter' ? 16 : 12;

      s.enemies.push({
        id: s.nextEnemyId++,
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        radius,
        hp,
        maxHp: hp,
        speed: baseSpeed,
        hitFlash: 0,
        windup: kind === 'siege' ? 2.4 : 0,
        fired: false,
        angle: Math.atan2(s.coreY - y, s.coreX - x),
      });
    };

    const triggerEmp = () => {
      const s = simRef.current;
      if (s.empCharge < 100) return;
      s.empCharge = 0;
      s.empWaveRadius = s.coreRadius;
      s.empWaveAlpha = 1;
      s.hitstop = 0.055;
      s.shake = 12;
      gameAudio.playEmp();

      const surviving: EnemyEntity[] = [];
      for (const enemy of s.enemies) {
        const dist = Math.hypot(enemy.x - s.coreX, enemy.y - s.coreY);
        if (dist <= 380) {
          enemy.hp -= 3;
          enemy.hitFlash = 0.2;
          if (enemy.hp <= 0) {
            s.score += enemy.kind === 'siege' ? 45 * s.combo : 20 * s.combo;
            s.neutralized += 1;
            spawnParticles(enemy.x, enemy.y, '#22D3EE', 14, 1.3);
            continue;
          }
        }
        surviving.push(enemy);
      }
      s.enemies = surviving;
      s.bullets = s.bullets.filter((b) => b.fromPlayer);
      syncHud();
    };

    const firePlayerBolt = () => {
      const s = simRef.current;
      const muzzleDist = s.orbitRadius + 14;
      const bx = s.coreX + Math.cos(s.turretAngle) * muzzleDist;
      const by = s.coreY + Math.sin(s.turretAngle) * muzzleDist;
      const speed = 640;
      s.bullets.push({
        x: bx,
        y: by,
        vx: Math.cos(s.turretAngle) * speed,
        vy: Math.sin(s.turretAngle) * speed,
        radius: 4.5,
        life: 1.8,
        fromPlayer: true,
      });
      s.recoil = 6;
      s.fireCooldown = difficultyRef.current === 'overdrive' ? 0.135 : 0.155;
      spawnParticles(bx, by, '#67E8F9', 4, 0.45);
      gameAudio.playShoot();
    };

    let lastTime = performance.now();
    let rafId = 0;
    let hudTimer = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      const s = simRef.current;
      s.time += dt;

      // Animate starfield even on Title Screen
      for (const star of s.bgStars) {
        star.y = (star.y + star.speed * dt) % 1;
      }

      if (phaseRef.current === 'PLAYING') {
        if (s.hitstop > 0) {
          s.hitstop = Math.max(0, s.hitstop - dt);
        } else {
          // Aim input: keyboard rotation OR mouse tracking
          const rotSpeed = 4.2;
          let keyRotating = false;
          if (s.heldKeys.has('ArrowLeft') || s.heldKeys.has('KeyA')) {
            s.turretAngle -= rotSpeed * dt;
            keyRotating = true;
          }
          if (s.heldKeys.has('ArrowRight') || s.heldKeys.has('KeyD')) {
            s.turretAngle += rotSpeed * dt;
            keyRotating = true;
          }
          if (keyRotating) {
            s.mouseActive = false;
          } else if (s.mouseActive) {
            s.turretAngle = Math.atan2(s.mouseY - s.coreY, s.mouseX - s.coreX);
          }

          s.fireCooldown = Math.max(0, s.fireCooldown - dt);
          s.fireBuffer = Math.max(0, s.fireBuffer - dt);
          s.empBuffer = Math.max(0, s.empBuffer - dt);
          s.recoil = Math.max(0, s.recoil - 28 * dt);
          s.shake = Math.max(0, s.shake - 32 * dt);
          s.coreFlash = Math.max(0, s.coreFlash - dt * 3.5);

          if (s.comboTimer > 0) {
            s.comboTimer -= dt;
            if (s.comboTimer <= 0) {
              s.combo = 1;
            }
          }

          if ((s.heldKeys.has('Space') || s.mouseDown || s.fireBuffer > 0) && s.fireCooldown <= 0) {
            s.fireBuffer = 0;
            firePlayerBolt();
          }

          if (s.empBuffer > 0 && s.empCharge >= 100) {
            s.empBuffer = 0;
            triggerEmp();
          }

          if (s.empWaveAlpha > 0) {
            s.empWaveRadius += 720 * dt;
            s.empWaveAlpha = Math.max(0, s.empWaveAlpha - dt * 1.9);
          }

          // Wave spawning
          if (s.waveRemaining > 0) {
            s.spawnTimer -= dt;
            if (s.spawnTimer <= 0) {
              spawnEnemy();
              s.waveRemaining -= 1;
              const baseDelay = Math.max(0.38, 1.35 - s.wave * 0.08);
              s.spawnTimer = difficultyRef.current === 'overdrive' ? baseDelay * 0.8 : baseDelay;
            }
          } else if (s.enemies.length === 0) {
            s.wave += 1;
            s.waveRemaining = 7 + s.wave * 3;
            s.hp = Math.min(s.maxHp, s.hp + 15);
            s.floatingTexts.push({
              x: s.coreX,
              y: s.coreY - 88,
              text: `WAVE ${s.wave}`,
              color: '#22D3EE',
              life: 1.4,
            });
            gameAudio.playWaveClear();
            syncHud();
          }

          // Update bullets
          const activeBullets: BulletEntity[] = [];
          for (const b of s.bullets) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
            if (b.life <= 0) continue;

            if (!b.fromPlayer) {
              // Check shield arc deflection
              const dx = b.x - s.coreX;
              const dy = b.y - s.coreY;
              const dist = Math.hypot(dx, dy);
              const angleToB = Math.atan2(dy, dx);
              let angleDiff = Math.abs(angleToB - s.turretAngle);
              while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - Math.PI * 2);

              if (Math.abs(dist - s.orbitRadius) < 12 && angleDiff < 0.72) {
                spawnParticles(b.x, b.y, '#38BDF8', 6, 0.6);
                s.empCharge = Math.min(100, s.empCharge + 5);
                gameAudio.playDeflect();
                continue;
              }
              if (dist <= s.coreRadius + b.radius) {
                s.hp -= 12;
                s.coreFlash = 1;
                s.shake = 10;
                s.combo = 1;
                s.hitstop = 0.035;
                spawnParticles(b.x, b.y, '#F43F5E', 12, 1.1);
                gameAudio.playDamage();
                if (s.hp <= 0) {
                  s.hp = 0;
                  if (s.score > s.bestScore) {
                    s.bestScore = s.score;
                    try {
                      localStorage.setItem(BEST_SCORE_KEY, String(s.bestScore));
                    } catch {
                      // ignore
                    }
                  }
                  syncHud();
                  setPhase('GAME_OVER');
                }
                continue;
              }
            }

            activeBullets.push(b);
          }
          s.bullets = activeBullets;

          // Update enemies & player bullet collisions
          const nextEnemies: EnemyEntity[] = [];
          for (const enemy of s.enemies) {
            enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
            const dx = s.coreX - enemy.x;
            const dy = s.coreY - enemy.y;
            const dist = Math.hypot(dx, dy) || 1;
            const dirX = dx / dist;
            const dirY = dy / dist;

            // Siege unit telegraph & shot
            if (enemy.kind === 'siege' && dist < 320 && !enemy.fired) {
              enemy.windup -= dt;
              if (enemy.windup <= 0) {
                enemy.fired = true;
                s.bullets.push({
                  x: enemy.x,
                  y: enemy.y,
                  vx: dirX * 240,
                  vy: dirY * 240,
                  radius: 5,
                  life: 3,
                  fromPlayer: false,
                });
              }
            }

            const moveFactor = enemy.kind === 'siege' && enemy.windup < 0.7 && !enemy.fired ? 0.25 : 1;
            enemy.x += dirX * enemy.speed * moveFactor * dt;
            enemy.y += dirY * enemy.speed * moveFactor * dt;
            enemy.angle = Math.atan2(dy, dx);

            // Check bullet hits
            let destroyed = false;
            for (let bi = s.bullets.length - 1; bi >= 0; bi--) {
              const b = s.bullets[bi];
              if (!b.fromPlayer) continue;
              const bDist = Math.hypot(b.x - enemy.x, b.y - enemy.y);
              if (bDist <= enemy.radius + b.radius) {
                s.bullets.splice(bi, 1);
                enemy.hp -= 1;
                enemy.hitFlash = 0.14;
                if (enemy.hp <= 0) {
                  destroyed = true;
                  const heavy = enemy.kind === 'siege';
                  const pts = (heavy ? 45 : enemy.kind === 'splitter' ? 30 : 15) * s.combo;
                  s.score += pts;
                  s.neutralized += 1;
                  s.empCharge = Math.min(100, s.empCharge + (heavy ? 18 : 8));
                  s.combo = Math.min(8, s.combo + 1);
                  s.comboTimer = 2.4;
                  if (heavy) {
                    s.hitstop = 0.04;
                    s.shake = Math.max(s.shake, 7);
                  }
                  spawnParticles(
                    enemy.x,
                    enemy.y,
                    heavy ? '#F59E0B' : enemy.kind === 'splitter' ? '#A78BFA' : '#22D3EE',
                    heavy ? 18 : 10,
                    heavy ? 1.25 : 0.9
                  );
                  s.floatingTexts.push({
                    x: enemy.x,
                    y: enemy.y - 10,
                    text: `+${pts}`,
                    color: '#67E8F9',
                    life: 0.75,
                  });
                  gameAudio.playDestroy(heavy);

                  if (enemy.kind === 'splitter') {
                    const perpX = -dirY;
                    const perpY = dirX;
                    for (const side of [-1, 1]) {
                      nextEnemies.push({
                        id: s.nextEnemyId++,
                        kind: 'shard',
                        x: enemy.x + perpX * side * 18,
                        y: enemy.y + perpY * side * 18,
                        vx: 0,
                        vy: 0,
                        radius: 9,
                        hp: 1,
                        maxHp: 1,
                        speed: enemy.speed * 1.45,
                        hitFlash: 0.1,
                        windup: 0,
                        fired: false,
                        angle: enemy.angle,
                      });
                    }
                  }
                  break;
                } else {
                  spawnParticles(b.x, b.y, '#E0F2FE', 5, 0.6);
                  gameAudio.playHit();
                }
              }
            }

            if (destroyed) continue;

            // Check orbital shield bash / deflect
            const angleFromCore = Math.atan2(enemy.y - s.coreY, enemy.x - s.coreX);
            let shieldDiff = Math.abs(angleFromCore - s.turretAngle);
            while (shieldDiff > Math.PI) shieldDiff = Math.abs(shieldDiff - Math.PI * 2);

            if (Math.abs(dist - s.orbitRadius) <= enemy.radius + 7 && shieldDiff < 0.65) {
              s.score += 10 * s.combo;
              s.neutralized += 1;
              s.empCharge = Math.min(100, s.empCharge + 10);
              spawnParticles(enemy.x, enemy.y, '#38BDF8', 10, 0.9);
              gameAudio.playDeflect();
              continue;
            }

            // Check core impact
            if (dist <= s.coreRadius + enemy.radius) {
              const dmg = enemy.kind === 'siege' ? 24 : 14;
              s.hp -= dmg;
              s.coreFlash = 1;
              s.shake = 14;
              s.hitstop = 0.05;
              s.combo = 1;
              spawnParticles(enemy.x, enemy.y, '#F43F5E', 18, 1.3);
              gameAudio.playDamage();

              if (s.hp <= 0) {
                s.hp = 0;
                if (s.score > s.bestScore) {
                  s.bestScore = s.score;
                  try {
                    localStorage.setItem(BEST_SCORE_KEY, String(s.bestScore));
                  } catch {
                    // ignore
                  }
                }
                syncHud();
                setPhase('GAME_OVER');
              }
              continue;
            }

            nextEnemies.push(enemy);
          }
          s.enemies = nextEnemies;
        }

        // Particles & floating texts update even during hitstop decay cleanly
        for (const p of s.particles) {
          if (!p.active) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.94;
          p.vy *= 0.94;
          p.life -= dt;
          if (p.life <= 0) p.active = false;
        }

        s.floatingTexts = s.floatingTexts.filter((ft) => {
          ft.y -= 28 * dt;
          ft.life -= dt;
          return ft.life > 0;
        });

        hudTimer += dt;
        if (hudTimer >= 0.08) {
          hudTimer = 0;
          syncHud();
        }
      }

      // Render Scene
      ctx.save();
      ctx.fillStyle = '#05070B';
      ctx.fillRect(0, 0, s.width, s.height);

      if (s.shake > 0.2) {
        const sx = (Math.random() - 0.5) * s.shake;
        const sy = (Math.random() - 0.5) * s.shake;
        ctx.translate(sx, sy);
      }

      // Subtle background starfield
      for (const star of s.bgStars) {
        ctx.fillStyle = `rgba(148, 163, 184, ${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x * s.width, star.y * s.height, star.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Concentric tactical radar rings
      for (const r of [140, 250, 370]) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.coreX, s.coreY, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // EMP Shockwave ring
      if (s.empWaveAlpha > 0) {
        ctx.strokeStyle = `rgba(34, 211, 238, ${s.empWaveAlpha})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(s.coreX, s.coreY, s.empWaveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Central IRIS Neural Core
      const pulse = 1 + Math.sin(s.time * 3.2) * 0.04;
      const coreGrad = ctx.createRadialGradient(
        s.coreX,
        s.coreY,
        4,
        s.coreX,
        s.coreY,
        s.coreRadius * 1.9 * pulse
      );
      coreGrad.addColorStop(0, s.coreFlash > 0 ? '#FDA4AF' : '#E0F2FE');
      coreGrad.addColorStop(0.45, s.coreFlash > 0 ? 'rgba(244, 63, 94, 0.7)' : 'rgba(14, 165, 233, 0.55)');
      coreGrad.addColorStop(1, 'rgba(29, 78, 216, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(s.coreX, s.coreY, s.coreRadius * 1.9 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = s.coreFlash > 0 ? '#F43F5E' : '#38BDF8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.coreX, s.coreY, s.coreRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Rotating inner ornament ring
      ctx.save();
      ctx.translate(s.coreX, s.coreY);
      ctx.rotate(s.time * 0.6);
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, s.coreRadius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Orbital Shield Arc + Turret Cannon
      const shieldStart = s.turretAngle - 0.62;
      const shieldEnd = s.turretAngle + 0.62;
      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s.coreX, s.coreY, s.orbitRadius, shieldStart, shieldEnd);
      ctx.stroke();

      const turretDist = s.orbitRadius - s.recoil;
      const tx = s.coreX + Math.cos(s.turretAngle) * turretDist;
      const ty = s.coreY + Math.sin(s.turretAngle) * turretDist;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(s.turretAngle);
      ctx.fillStyle = '#E0F2FE';
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-7, -7);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Bullets
      for (const b of s.bullets) {
        ctx.fillStyle = b.fromPlayer ? '#67E8F9' : '#FB7185';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Enemies
      for (const enemy of s.enemies) {
        ctx.save();
        ctx.translate(enemy.x, enemy.y);

        // Telegraph lock-on laser for Siege Breaker
        if (enemy.kind === 'siege' && !enemy.fired && enemy.windup < 1.2) {
          const dist = Math.hypot(s.coreX - enemy.x, s.coreY - enemy.y);
          if (dist < 320) {
            ctx.strokeStyle = `rgba(245, 158, 11, ${0.25 + (1.2 - enemy.windup) * 0.5})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(s.coreX - enemy.x, s.coreY - enemy.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        ctx.rotate(enemy.angle);
        const flash = enemy.hitFlash > 0;
        if (enemy.kind === 'siege') {
          ctx.fillStyle = flash ? '#FFFFFF' : '#F59E0B';
          ctx.strokeStyle = '#FEF3C7';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            const px = Math.cos(a) * enemy.radius;
            const py = Math.sin(a) * enemy.radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (enemy.kind === 'splitter') {
          ctx.fillStyle = flash ? '#FFFFFF' : '#A78BFA';
          ctx.beginPath();
          ctx.moveTo(enemy.radius, 0);
          ctx.lineTo(0, enemy.radius);
          ctx.lineTo(-enemy.radius, 0);
          ctx.lineTo(0, -enemy.radius);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = flash
            ? '#FFFFFF'
            : enemy.kind === 'shard'
              ? '#C4B5FD'
              : '#38BDF8';
          ctx.beginPath();
          ctx.moveTo(enemy.radius + 3, 0);
          ctx.lineTo(-enemy.radius, -enemy.radius * 0.75);
          ctx.lineTo(-enemy.radius * 0.5, 0);
          ctx.lineTo(-enemy.radius, enemy.radius * 0.75);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // Pooled Particles
      for (const p of s.particles) {
        if (!p.active) continue;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Floating score pops
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (const ft of s.floatingTexts) {
        ctx.globalAlpha = Math.min(1, ft.life * 1.4);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.globalAlpha = 1;

      ctx.restore();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [syncHud]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-[#05070B] select-none"
      onMouseMove={(e) => {
        if (phase !== 'PLAYING') return;
        simRef.current.mouseActive = true;
        simRef.current.mouseX = e.clientX;
        simRef.current.mouseY = e.clientY;
      }}
      onMouseDown={(e) => {
        if (phase !== 'PLAYING') return;
        if (e.button === 0) {
          simRef.current.mouseDown = true;
          simRef.current.fireBuffer = 0.14;
        } else if (e.button === 2) {
          simRef.current.empBuffer = 0.18;
        }
      }}
      onMouseUp={() => {
        simRef.current.mouseDown = false;
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Isolated Full-Viewport Game Canvas */}
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* Low-Occlusion Perimeter HUD (Active Play) */}
      {phase === 'PLAYING' && (
        <div className="pointer-events-none fixed inset-0 flex flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Top-Left Core Integrity & Wave */}
            <div className="space-y-1.5 text-xs text-slate-300">
              <div className="flex items-center gap-3 font-mono tabular-nums">
                <span className="text-slate-400">CORE</span>
                <span
                  className={
                    hud.hp <= 30 ? 'font-semibold text-rose-400' : 'font-semibold text-cyan-300'
                  }
                >
                  {hud.hp}/{hud.maxHp}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">WAVE {hud.wave}</span>
              </div>
              <div className="h-1.5 w-44 overflow-hidden rounded-full bg-slate-800/90">
                <div
                  className={`h-full transition-transform duration-150 origin-left ${
                    hud.hp <= 30 ? 'bg-rose-500' : 'bg-cyan-400'
                  }`}
                  style={{ transform: `scaleX(${Math.max(0, hud.hp / hud.maxHp)})` }}
                />
              </div>
            </div>

            {/* Top-Right Score & Controls */}
            <div className="flex items-center gap-5">
              <div className="text-right font-mono tabular-nums">
                <div className="text-lg font-semibold text-slate-100">{hud.score}</div>
                <div className="text-[11px] text-slate-400">
                  x{hud.combo} COMBO · BEST {hud.bestScore}
                </div>
              </div>

              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-[#090D16]/85 text-slate-200 hover:border-cyan-500/60"
                >
                  {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-cyan-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('PAUSED')}
                  aria-label="Pause game"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-[#090D16]/85 text-slate-200 hover:border-cyan-500/60"
                >
                  <Pause className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Bottom-Left EMP Pulse Readiness */}
          <div className="flex items-end justify-between">
            <div className="space-y-1 font-mono text-xs tabular-nums">
              <div className={hud.empCharge >= 100 ? 'text-cyan-300 font-semibold' : 'text-slate-400'}>
                {hud.empCharge >= 100 ? 'EMP READY · PRESS [E] OR RIGHT-CLICK' : `EMP CHARGE ${hud.empCharge}%`}
              </div>
              <div className="h-1 w-40 overflow-hidden rounded-full bg-slate-800/90">
                <div
                  className="h-full bg-sky-400 origin-left"
                  style={{ transform: `scaleX(${hud.empCharge / 100})` }}
                />
              </div>
            </div>

            <div className="hidden sm:block text-xs text-slate-500 font-mono">
              Mouse / A·D Aim · Space / Click Fire · E Pulse · Esc Pause
            </div>
          </div>
        </div>
      )}

      {/* Title Screen */}
      {phase === 'TITLE_MENU' && (
        <div className="fixed inset-0 flex flex-col justify-between p-8">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onExitToAssistant}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-[#090D16]/90 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to IRIS Assistant</span>
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-[#090D16]/90 text-slate-300 hover:border-cyan-500/50"
            >
              {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4 text-cyan-400" />}
            </button>
          </div>

          <div className="mx-auto flex max-w-xl flex-col items-center text-center">
            {/* Bespoke Inline SVG Title Lockup */}
            <svg
              viewBox="0 0 460 110"
              className="w-full max-w-[440px]"
              role="img"
              aria-label="IRIS Core Defense"
            >
              <defs>
                <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#E0F2FE" />
                  <stop offset="50%" stopColor="#38BDF8" />
                  <stop offset="100%" stopColor="#22D3EE" />
                </linearGradient>
              </defs>
              <line x1="50" y1="16" x2="175" y2="16" stroke="#22D3EE" strokeOpacity="0.45" strokeWidth="1.5" />
              <line x1="285" y1="16" x2="410" y2="16" stroke="#22D3EE" strokeOpacity="0.45" strokeWidth="1.5" />
              <circle cx="230" cy="16" r="5" fill="#22D3EE" />
              <text
                x="230"
                y="62"
                textAnchor="middle"
                fill="url(#titleGrad)"
                fontFamily="Outfit, sans-serif"
                fontSize="44"
                fontWeight="700"
                letterSpacing="4"
              >
                IRIS CORE
              </text>
              <text
                x="230"
                y="92"
                textAnchor="middle"
                fill="#94A3B8"
                fontFamily="JetBrains Mono, monospace"
                fontSize="14"
                letterSpacing="7"
              >
                ORBITAL DEFENSE
              </text>
            </svg>

            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
              Defend the central IRIS neural core from incoming drone waves. Deflect projectiles
              with your orbital shield and unleash charged EMP shockwaves.
            </p>

            {/* Difficulty Segmented Selector */}
            <div className="mt-6 flex items-center gap-1 rounded-lg border border-slate-800 bg-[#090D16]/90 p-1">
              {(['standard', 'overdrive'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDifficulty(mode)}
                  className={`rounded-md px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
                    difficulty === mode
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={startGame}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-8 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <Play className="h-4 w-4 fill-slate-950" />
              <span>Start Defense</span>
            </button>

            {hud.bestScore > 0 && (
              <div className="mt-4 font-mono text-xs tabular-nums text-slate-400">
                High Score: {hud.bestScore}
              </div>
            )}
          </div>

          <div className="text-center font-mono text-xs text-slate-400">
            Mouse or A/D Aim · Space or Left-Click Fire · E or Right-Click EMP Pulse · Esc Pause
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {phase === 'PAUSED' && (
        <div className="fixed inset-0 flex items-center justify-center bg-[#05070B]/75 p-6">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-[#090D16] p-6 text-center space-y-5">
            <h2 className="font-display text-2xl font-semibold text-slate-100">
              Simulation Paused
            </h2>
            <p className="font-mono text-xs tabular-nums text-slate-400">
              Wave {hud.wave} · Score {hud.score}
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setPhase('PLAYING')}
                className="w-full rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={startGame}
                className="w-full rounded-lg border border-slate-700 bg-[#0D1320] py-2.5 text-sm font-medium text-slate-200 hover:border-cyan-500/60 transition-colors"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={onExitToAssistant}
                className="w-full rounded-lg border border-slate-800 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Return to IRIS Assistant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Over Modal */}
      {phase === 'GAME_OVER' && (
        <div className="fixed inset-0 flex items-center justify-center bg-[#05070B]/80 p-6">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-[#090D16] p-7 text-center space-y-5">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-100">
                Core Integrity Breached
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Defense telemetry summary
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 border-y border-slate-800 py-4 font-mono tabular-nums">
              <div>
                <div className="text-lg font-semibold text-cyan-300">{hud.score}</div>
                <div className="text-[11px] text-slate-400">SCORE</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-100">{hud.wave}</div>
                <div className="text-[11px] text-slate-400">WAVE</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-100">{hud.neutralized}</div>
                <div className="text-[11px] text-slate-400">CLEARED</div>
              </div>
            </div>

            <div className="font-mono text-xs tabular-nums text-slate-400">
              Best Score: <span className="text-slate-200">{hud.bestScore}</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={startGame}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Play Again</span>
              </button>

              <button
                type="button"
                onClick={onExitToAssistant}
                className="rounded-lg border border-slate-700 bg-[#0D1320] px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-cyan-500/50 transition-colors"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
