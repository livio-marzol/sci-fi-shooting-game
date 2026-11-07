import * as THREE from 'three';
import { Player } from './Player';
import { CameraController } from './CameraController';
import { TargetSystem, HitResult } from './TargetSystem';
import { AudioSystem } from './AudioSystem';

interface LaserTracer {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

/**
 * WeaponSystem.ts - Sistema de Tiro Hitscan com Raycast, Traçador de Laser Sci-Fi,
 * partículas de impacto, munição de plasma e recarga (tecla R).
 */
export class WeaponSystem {
  public scene: THREE.Scene;
  public player: Player;
  public cameraController: CameraController;
  public targetSystem: TargetSystem;
  public audioSystem: AudioSystem;

  // Sistema de Munição
  public readonly maxAmmo: number = 12;
  public currentAmmo: number = 12;
  public isReloading: boolean = false;
  public reloadTimer: number = 0;
  public readonly reloadDuration: number = 1.2;

  // Cadência de Disparo (Cooldown entre tiros)
  private fireCooldown: number = 0;
  private readonly minFireInterval: number = 0.16;

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private screenCenter = new THREE.Vector2(0, 0);

  // Efeitos Visuais (Tracers e Faíscas)
  private tracers: LaserTracer[] = [];
  private sparks: SparkParticle[] = [];
  private sparkGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);

  // Callbacks de Atualização de UI
  public onAmmoChanged?: (ammo: number, maxAmmo: number, reloading: boolean) => void;
  public onShotFired?: (hitResult: HitResult | null) => void;

  constructor(
    scene: THREE.Scene,
    player: Player,
    cameraController: CameraController,
    targetSystem: TargetSystem,
    audioSystem: AudioSystem
  ) {
    this.scene = scene;
    this.player = player;
    this.cameraController = cameraController;
    this.targetSystem = targetSystem;
    this.audioSystem = audioSystem;

    this.setupInputs();
  }

  private setupInputs() {
    // Disparo com o Botão Esquerdo do Mouse
    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0 && this.cameraController.isLocked) {
        this.tryShoot();
      }
    });

    // Recarga com a Tecla 'R'
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if ((e.key === 'r' || e.key === 'R') && !this.isReloading && this.currentAmmo < this.maxAmmo) {
        this.startReload();
      }
    });
  }

  /**
   * Tenta disparar a arma
   */
  public tryShoot() {
    if (this.isReloading || this.fireCooldown > 0) {
      return;
    }

    if (this.currentAmmo <= 0) {
      this.audioSystem.playEmptyClick();
      this.startReload();
      return;
    }

    // Executa disparo
    this.currentAmmo--;
    this.fireCooldown = this.minFireInterval;
    this.audioSystem.playLaserShot();
    this.player.triggerRecoil();

    if (this.onAmmoChanged) {
      this.onAmmoChanged(this.currentAmmo, this.maxAmmo, false);
    }

    // Processamento do Raycast de tiro
    this.executeHitscanShot();

    // Auto-recarga e trava do ferrolho aberto se zerar a munição
    if (this.currentAmmo <= 0) {
      this.player.isSlideLocked = true;
      setTimeout(() => {
        if (!this.isReloading && this.currentAmmo <= 0) {
          this.startReload();
        }
      }, 250);
    }
  }

  /**
   * Inicia a sequência de recarga da célula de energia / carregador tático
   */
  public startReload() {
    if (this.isReloading || this.currentAmmo === this.maxAmmo) return;

    this.isReloading = true;
    this.reloadTimer = this.reloadDuration;
    this.player.setReloadState(true, 0);
    this.audioSystem.playReload();

    if (this.onAmmoChanged) {
      this.onAmmoChanged(this.currentAmmo, this.maxAmmo, true);
    }
  }

  /**
   * Raycast Hitscan central da câmera para os alvos e ambiente
   */
  private executeHitscanShot() {
    this.raycaster.setFromCamera(this.screenCenter, this.cameraController.camera);

    // Muzzle position da arma no espaço global
    const muzzlePos = new THREE.Vector3();
    this.player.getMuzzleWorldPosition(muzzlePos);

    // Intersecta alvos
    const targetIntersects = this.raycaster.intersectObjects(this.targetSystem.targetMeshes, false);

    let endPoint = new THREE.Vector3();
    let hitResult: HitResult | null = null;

    if (targetIntersects.length > 0) {
      const hit = targetIntersects[0];
      endPoint.copy(hit.point);

      // Informa o sistema de alvos do acerto
      hitResult = this.targetSystem.handleHit(hit.point, hit.object as THREE.Mesh);

      // Faíscas de impacto no alvo
      this.spawnImpactSparks(hit.point, hit.face ? hit.face.normal : new THREE.Vector3(0, 0, 1), 0x00f0ff);
    } else {
      // Se não atingiu alvo, testa se atingiu as paredes ou fundo do estande
      const allObjects = this.scene.children;
      const wallIntersects = this.raycaster.intersectObjects(allObjects, true);

      // Filtra para ignorar o próprio jogador
      const validHits = wallIntersects.filter(
        (i) => !this.isDescendantOf(i.object, this.player.rootGroup) &&
               !this.isDescendantOf(i.object, this.cameraController.camera)
      );

      if (validHits.length > 0) {
        endPoint.copy(validHits[0].point);
        this.spawnImpactSparks(validHits[0].point, validHits[0].face ? validHits[0].face.normal : new THREE.Vector3(0, 0, 1), 0xff9100);
      } else {
        // Disparo para o infinito na linha de visão (40 metros)
        endPoint = this.raycaster.ray.at(40, new THREE.Vector3());
      }
    }

    // Cria o feixe traçador de laser entre o cano da arma e o ponto final
    this.createLaserTracer(muzzlePos, endPoint);

    if (this.onShotFired) {
      this.onShotFired(hitResult);
    }
  }

  private isDescendantOf(obj: THREE.Object3D, parent: THREE.Object3D): boolean {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur === parent) return true;
      cur = cur.parent;
    }
    return false;
  }

  /**
   * Constrói uma linha/cilindro luminoso conectando o cano da arma ao impacto
   */
  private createLaserTracer(start: THREE.Vector3, end: THREE.Vector3) {
    const distance = start.distanceTo(end);
    if (distance < 0.1) return;

    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    // Geometria de feixe de laser fino
    const beamGeo = new THREE.CylinderGeometry(0.018, 0.018, distance, 8);
    beamGeo.rotateX(Math.PI / 2); // Alinha com o eixo Z para orientação

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.95
    });

    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.copy(midPoint);
    beamMesh.lookAt(end);

    this.scene.add(beamMesh);
    this.tracers.push({
      mesh: beamMesh,
      life: 0,
      maxLife: 0.08 // Desvanece rapidamente em 80ms
    });
  }

  /**
   * Emite faíscas de plasma no ponto de colisão
   */
  private spawnImpactSparks(point: THREE.Vector3, normal: THREE.Vector3, color: number) {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.copy(point);

      // Velocidade direcionada com dispersão ao redor da normal da face
      const spread = 2.5;
      const vel = new THREE.Vector3(
        normal.x * 2.0 + (Math.random() - 0.5) * spread,
        normal.y * 2.0 + (Math.random() - 0.5) * spread + 1.0,
        normal.z * 2.0 + (Math.random() - 0.5) * spread
      );

      this.scene.add(mesh);
      this.sparks.push({
        mesh,
        vel,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2
      });
    }
  }

  /**
   * Atualização frame a frame dos tempos de recarga, projéteis e partículas
   */
  public update(delta: number) {
    // Cooldown de disparo
    if (this.fireCooldown > 0) {
      this.fireCooldown -= delta;
    }

    // Processamento de Recarga e sincronização da animação tática das mãos no Player
    if (this.isReloading) {
      this.reloadTimer -= delta;
      const progress = THREE.MathUtils.clamp(1.0 - this.reloadTimer / this.reloadDuration, 0, 1);
      this.player.setReloadState(true, progress);
      if (progress > 0.78) {
        this.player.isSlideLocked = false;
      }
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.currentAmmo = this.maxAmmo;
        this.player.isSlideLocked = false;
        this.player.setReloadState(false, 0);
        if (this.onAmmoChanged) {
          this.onAmmoChanged(this.currentAmmo, this.maxAmmo, false);
        }
      }
    }

    // Atualização dos feixes de laser
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life += delta;
      const progress = tracer.life / tracer.maxLife;
      (tracer.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - progress) * 0.95);

      if (tracer.life >= tracer.maxLife) {
        this.scene.remove(tracer.mesh);
        tracer.mesh.geometry.dispose();
        (tracer.mesh.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }

    // Atualização das faíscas de impacto
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life += delta;
      spark.mesh.position.addScaledVector(spark.vel, delta);
      spark.vel.y -= 12 * delta; // Gravidade

      const progress = spark.life / spark.maxLife;
      (spark.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - progress);

      if (spark.life >= spark.maxLife) {
        this.scene.remove(spark.mesh);
        spark.mesh.geometry.dispose();
        (spark.mesh.material as THREE.Material).dispose();
        this.sparks.splice(i, 1);
      }
    }
  }
}
