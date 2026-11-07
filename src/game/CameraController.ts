import * as THREE from 'three';
import { Player } from './Player';

/**
 * CameraController.ts - Câmera em Terceira Pessoa Over-The-Shoulder (Estilo Resident Evil 4 Remake).
 * Posicionamento cinematográfico fixo sobre o ombro direito do Leon, mira precisa centralizada,
 * modo de mira aproximada (ADS) no botão direito, rotação Euler YXZ pura (sem atrasos ou desvios)
 * e proteção avançada contra clipping em paredes ou divisórias.
 */
export class CameraController {
  public camera: THREE.PerspectiveCamera;
  public domElement: HTMLElement;
  public player: Player;

  public isLocked: boolean = false;
  public isAimingADS: boolean = false;

  // Ângulos de Orientação
  public yaw: number = 0;   // Rotação horizontal (olhar esquerda/direita)
  public pitch: number = 0; // Rotação vertical (olhar cima/baixo)

  // Sensibilidade do Mouse equilibrada para precisão de mira
  public mouseSensitivity: number = 0.0022;

  // Offset Clássico Over-The-Shoulder do RE4 (Sobre o ombro direito, Operador no terço inferior esquerdo)
  // X = +0.55 (câmera deslocada à direita, liberando 100% o centro da tela e os alvos)
  // Y = 1.65 (altura dos ombros/olhos)
  // Z = 1.70 (câmera recuada a 1.7m, enquadrando perfeitamente no terço inferior esquerdo)
  private readonly normalOffset = new THREE.Vector3(0.55, 1.65, 1.70);
  private readonly normalFOV = 60;

  // Modo de Mira Focada (ADS - botão direito do mouse)
  private readonly adsOffset = new THREE.Vector3(0.38, 1.58, 1.15);
  private readonly adsFOV = 45;

  // Vetores de Interpolação
  private currentOffset = new THREE.Vector3();
  private targetCamPos = new THREE.Vector3();

  // Raycaster para proteção contra clipping de obstáculos/paredes
  private collisionRaycaster = new THREE.Raycaster();
  public collisionObstacles: THREE.Object3D[] = [];

  // Callbacks de evento
  public onLockChange?: (locked: boolean) => void;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    player: Player,
    collisionObstacles: THREE.Object3D[] = []
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.player = player;
    this.collisionObstacles = collisionObstacles;

    // Configura a ordem de rotação da câmera para YXZ (ordem padrão de jogos TPS/FPS)
    this.camera.rotation.order = 'YXZ';

    this.currentOffset.copy(this.normalOffset);
    this.camera.fov = this.normalFOV;
    this.camera.updateProjectionMatrix();

    this.setupPointerLock();
    this.setupInputListeners();
  }

  private setupPointerLock() {
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
      if (this.onLockChange) {
        this.onLockChange(this.isLocked);
      }
    });
  }

  private setupInputListeners() {
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isLocked) return;

      const sens = this.isAimingADS ? this.mouseSensitivity * 0.55 : this.mouseSensitivity;

      // Movimentar mouse para a direita diminui o yaw (rotação horária para olhar para +X)
      this.yaw -= e.movementX * sens;
      // Movimentar mouse para cima diminui movementY no DOM, aumentando o pitch para olhar para cima
      this.pitch -= e.movementY * sens;

      // Rotação horizontal (Yaw) livre em 360 graus para explorar e olhar todo o estande
      // Limite angular vertical (Pitch): Permite mirar confortavelmente do balcão ao teto
      this.pitch = THREE.MathUtils.clamp(this.pitch, -0.55, 0.45);
    });

    // Botão direito do mouse para aproximação de mira (ADS)
    window.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 2) {
        this.isAimingADS = true;
      }
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 2) {
        this.isAimingADS = false;
      }
    });

    // Impede o menu de contexto do navegador no botão direito
    window.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });
  }

  /**
   * Atualização sincronizada frame a frame da câmera com o personagem
   */
  public update(delta: number) {
    // 1. Interpolação suave do Offset e Campo de Visão (FOV) para o modo ADS
    const targetOffset = this.isAimingADS ? this.adsOffset : this.normalOffset;
    const targetFOV = this.isAimingADS ? this.adsFOV : this.normalFOV;

    this.currentOffset.lerp(targetOffset, Math.min(1.0, 15 * delta));

    if (Math.abs(this.camera.fov - targetFOV) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, Math.min(1.0, 15 * delta));
      this.camera.updateProjectionMatrix();
    }

    // 2. Orientação pura da câmera: rotação instantânea e sem atraso
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // 3. Posição da câmera calculada no espaço local rotacionado pelo Yaw do atirador
    const playerPos = this.player.rootGroup.position;
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    // Vetor de offset do ombro rotacionado no plano horizontal (XZ)
    const offsetX = this.currentOffset.x * cosYaw + this.currentOffset.z * sinYaw;
    const offsetZ = -this.currentOffset.x * sinYaw + this.currentOffset.z * cosYaw;

    this.targetCamPos.set(
      playerPos.x + offsetX,
      playerPos.y + this.currentOffset.y,
      playerPos.z + offsetZ
    );

    // 4. Proteção Anti-Clipping (Camera Spring Arm)
    // Se algum obstáculo estiver entre o tronco do jogador e a câmera, aproxima a câmera
    if (this.collisionObstacles.length > 0) {
      const rayOrigin = new THREE.Vector3(playerPos.x, playerPos.y + 1.40, playerPos.z);
      const rayDir = new THREE.Vector3().subVectors(this.targetCamPos, rayOrigin);
      const maxDist = rayDir.length();
      rayDir.normalize();

      this.collisionRaycaster.set(rayOrigin, rayDir);
      this.collisionRaycaster.near = 0.05;
      this.collisionRaycaster.far = maxDist;

      const hits = this.collisionRaycaster.intersectObjects(this.collisionObstacles, true);
      if (hits.length > 0 && hits[0].distance < maxDist) {
        const safeDist = Math.max(0.35, hits[0].distance - 0.15);
        this.targetCamPos.copy(rayOrigin).addScaledVector(rayDir, safeDist);
      }
    }

    // Suavização do posicionamento da câmera
    this.camera.position.lerp(this.targetCamPos, Math.min(1.0, 25 * delta));
  }

  /**
   * Retorna o vetor unitário exato para onde o centro da tela mira
   */
  public getAimDirection(target: THREE.Vector3): THREE.Vector3 {
    return this.camera.getWorldDirection(target);
  }
}
