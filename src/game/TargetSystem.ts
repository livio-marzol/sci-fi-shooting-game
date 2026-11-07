import * as THREE from 'three';
import { AudioSystem } from './AudioSystem';

export interface HitResult {
  hit: boolean;
  isBullseye: boolean;
  isInner: boolean;
  score: number;
  hitPoint: THREE.Vector3;
}

interface TargetEntity {
  group: THREE.Group;
  colliderMesh: THREE.Mesh;
  bullseyeMesh: THREE.Mesh;
  innerRingMesh: THREE.Mesh;
  outerRingMesh: THREE.Mesh;
  type: 'static' | 'horizontal' | 'vertical' | 'drone';
  basePos: THREE.Vector3;
  moveRange: number;
  moveSpeed: number;
  phase: number;
  isAlive: boolean;
  respawnTimer: number;
}

interface HologramParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  life: number;
  maxLife: number;
}

/**
 * TargetSystem.ts - Gerencia os alvos holográficos sci-fi com zonas de precisão
 * (Bullseye central, Anel Interno e Anel Externo), animações de movimento e estilhaçamento.
 */
export class TargetSystem {
  public scene: THREE.Scene;
  public audioSystem: AudioSystem;
  public targets: TargetEntity[] = [];
  public targetMeshes: THREE.Mesh[] = [];

  private particles: HologramParticle[] = [];
  private particleGeo: THREE.BufferGeometry;

  constructor(scene: THREE.Scene, audioSystem: AudioSystem) {
    this.scene = scene;
    this.audioSystem = audioSystem;

    // Partículas para explosão holográfica
    this.particleGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);

    this.spawnInitialTargets();
  }

  private spawnInitialTargets() {
    // Alvo 1: Curta distância (8m) - Estático de precisão
    this.createTarget(new THREE.Vector3(-1.5, 2.0, -8), 'static', 0, 0);

    // Alvo 2: Curta/Média distância (12m) - Movimento horizontal em trilho
    this.createTarget(new THREE.Vector3(1.2, 2.2, -12), 'horizontal', 2.8, 1.8);

    // Alvo 3: Média distância (18m) - Movimento oscilatório vertical
    this.createTarget(new THREE.Vector3(-1.8, 2.3, -18), 'vertical', 1.2, 2.2);

    // Alvo 4: Média/Longa distância (24m) - Deslizando lateralmente
    this.createTarget(new THREE.Vector3(0.0, 2.4, -24), 'horizontal', 3.6, 2.4);

    // Alvo 5: Longa distância (30m) - Drone holográfico rápido
    this.createTarget(new THREE.Vector3(1.8, 2.6, -30), 'drone', 2.2, 3.0);
  }

  private createTarget(
    basePos: THREE.Vector3,
    type: 'static' | 'horizontal' | 'vertical' | 'drone',
    moveRange: number,
    moveSpeed: number
  ) {
    const group = new THREE.Group();
    group.position.copy(basePos);

    // Materiais Holográficos Sci-Fi
    const bullseyeMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 2.8,
      roughness: 0.1
    });

    const innerRingMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00b0ff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      transparent: true,
      opacity: 0.85
    });

    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x2979ff,
      emissive: 0x1565c0,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      transparent: true,
      opacity: 0.75
    });

    // 1. Núcleo Bullseye (Centro Crítico - Raio ~0.15m)
    const bullseyeGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 24);
    bullseyeGeo.rotateX(Math.PI / 2);
    const bullseyeMesh = new THREE.Mesh(bullseyeGeo, bullseyeMat);
    group.add(bullseyeMesh);

    // 2. Anel Interno (Raio ~0.38m)
    const innerRingGeo = new THREE.TorusGeometry(0.34, 0.05, 12, 32);
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    group.add(innerRingMesh);

    // 3. Anel Externo (Raio ~0.65m)
    const outerRingGeo = new THREE.TorusGeometry(0.62, 0.05, 12, 36);
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    group.add(outerRingMesh);

    // 4. Cruz de Mira Tática Holográfica
    const crossBarMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
    const barH = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.02), crossBarMat);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.4, 0.02), crossBarMat);
    group.add(barH);
    group.add(barV);

    // 5. Suporte/Projetor Holográfico na base inferior
    const baseProjectorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const projector = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.25, 12), baseProjectorMat);
    projector.position.set(0, -0.9, 0);
    group.add(projector);

    // Feixe de luz do projetor
    const beamGeo = new THREE.ConeGeometry(0.65, 0.85, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, -0.45, 0);
    group.add(beam);

    // 6. Colisor de Raycast invisível (Disco plano transparente)
    const colGeo = new THREE.CircleGeometry(0.72, 24);
    const colMat = new THREE.MeshBasicMaterial({ visible: false });
    const colliderMesh = new THREE.Mesh(colGeo, colMat);
    colliderMesh.userData = { targetRef: null }; // Referência preenchida abaixo
    group.add(colliderMesh);

    this.scene.add(group);

    const targetEntity: TargetEntity = {
      group,
      colliderMesh,
      bullseyeMesh,
      innerRingMesh,
      outerRingMesh,
      type,
      basePos: basePos.clone(),
      moveRange,
      moveSpeed,
      phase: Math.random() * Math.PI * 2,
      isAlive: true,
      respawnTimer: 0
    };

    colliderMesh.userData.targetRef = targetEntity;
    this.targets.push(targetEntity);
    this.targetMeshes.push(colliderMesh);
  }

  /**
   * Processa o impacto de um disparo do Raycast em um dos alvos
   */
  public handleHit(hitPoint: THREE.Vector3, hitMesh: THREE.Mesh): HitResult | null {
    const targetEntity = hitMesh.userData.targetRef as TargetEntity | undefined;
    if (!targetEntity || !targetEntity.isAlive) {
      return null;
    }

    // Calcula distância do centro do alvo em coordenadas locais
    const localHit = targetEntity.group.worldToLocal(hitPoint.clone());
    const distFromCenter = Math.sqrt(localHit.x * localHit.x + localHit.y * localHit.y);

    let isBullseye = false;
    let isInner = false;
    let score = 50;

    if (distFromCenter <= 0.22) {
      // Bullseye no centro exato!
      isBullseye = true;
      score = 250;
      this.audioSystem.playBullseye();
    } else if (distFromCenter <= 0.46) {
      // Anel intermediário
      isInner = true;
      score = 120;
      this.audioSystem.playHit();
    } else {
      // Borda do alvo
      score = 60;
      this.audioSystem.playHit();
    }

    // Explode o alvo em partículas holográficas
    this.destroyTarget(targetEntity, isBullseye);

    return {
      hit: true,
      isBullseye,
      isInner,
      score,
      hitPoint
    };
  }

  /**
   * Destrói o alvo temporariamente com efeito de fragmentação
   */
  private destroyTarget(target: TargetEntity, isBullseye: boolean) {
    target.isAlive = false;
    target.group.visible = false;
    target.respawnTimer = 2.2; // Renasce em 2.2 segundos

    // Cria estilhaços holográficos no mundo
    const worldCenter = target.group.position.clone();
    const count = isBullseye ? 28 : 16;
    const color = isBullseye ? 0xff1744 : 0x00e5ff;

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(worldCenter);
      mesh.position.x += (Math.random() - 0.5) * 0.5;
      mesh.position.y += (Math.random() - 0.5) * 0.5;
      mesh.position.z += (Math.random() - 0.5) * 0.2;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 4.0;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed + 1.0,
        (Math.random() - 0.5) * 3.0
      );

      const rot = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        vel,
        rot,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.3
      });
    }
  }

  /**
   * Atualização frame a frame dos alvos (movimentação, respawn e partículas)
   */
  public update(delta: number, time: number) {
    // 1. Movimentação dos Alvos Vivos
    for (const target of this.targets) {
      if (target.isAlive) {
        // Animação de rotação contínua dos anéis
        target.innerRingMesh.rotation.z += delta * 1.5;
        target.outerRingMesh.rotation.z -= delta * 1.0;

        // Comportamento por tipo
        if (target.type === 'horizontal') {
          const offset = Math.sin(time * target.moveSpeed + target.phase) * target.moveRange;
          target.group.position.x = target.basePos.x + offset;
        } else if (target.type === 'vertical') {
          const offset = Math.sin(time * target.moveSpeed + target.phase) * target.moveRange;
          target.group.position.y = target.basePos.y + offset;
        } else if (target.type === 'drone') {
          // Movimento em figura de 8 / Lissajous
          target.group.position.x = target.basePos.x + Math.sin(time * 2.5) * target.moveRange;
          target.group.position.y = target.basePos.y + Math.cos(time * 1.8) * 0.6;
        }
      } else {
        // Contagem de Respawn
        target.respawnTimer -= delta;
        if (target.respawnTimer <= 0) {
          target.isAlive = true;
          target.group.visible = true;
          // Efeito de re-surgimento sutil
          target.group.scale.set(0.1, 0.1, 0.1);
        }
      }

      // Suavização da escala ao renascer
      if (target.isAlive && target.group.scale.x < 1.0) {
        const newScale = Math.min(1.0, target.group.scale.x + delta * 4);
        target.group.scale.set(newScale, newScale, newScale);
      }
    }

    // 2. Atualização das Partículas de Explosão Holográfica
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;

      p.mesh.position.addScaledVector(p.vel, delta);
      p.vel.y -= 9.8 * delta; // Gravidade sci-fi
      p.mesh.rotation.x += p.rot.x * delta;
      p.mesh.rotation.y += p.rot.y * delta;

      const progress = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress);

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
