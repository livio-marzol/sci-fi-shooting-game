import * as THREE from 'three';
import { Timer } from 'three';
import { Environment } from './Environment';
import { Player } from './Player';
import { CameraController } from './CameraController';
import { TargetSystem } from './TargetSystem';
import { WeaponSystem } from './WeaponSystem';
import { AudioSystem } from './AudioSystem';
import { ScoreSystem } from './ScoreSystem';
import { HUD } from './HUD';

/**
 * GameEngine.ts - Orquestrador principal do estande de tiro 3D estilo Resident Evil 4 Remake.
 * Gerencia o loop de renderização, ciclo de vida dos módulos e sincronização de inputs.
 */
export class GameEngine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public environment: Environment;
  public player: Player;
  public cameraController: CameraController;
  public targetSystem: TargetSystem;
  public weaponSystem: WeaponSystem;
  public audioSystem: AudioSystem;
  public scoreSystem: ScoreSystem;
  public hud: HUD;

  // Estado de Entrada (WASD)
  private keysPressed: { [key: string]: boolean } = {};

  // Temporizador moderno do Three.js (THREE.Timer substitui THREE.Clock)
  private timer = new Timer();
  private isRunning = false;

  constructor(canvasContainer: HTMLElement, hudContainer: HTMLElement) {
    // 1. Inicializa Cena Three.js com iluminação profissional de estande de tiro
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2433);
    this.scene.fog = new THREE.Fog(0x1c2433, 40, 85);

    // Conecta o temporizador ao documento para suporte a Page Visibility API
    this.timer.connect(document);

    // 2. Câmera Perspectiva
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      120
    );

    // 3. Renderizador WebGL de Alta Qualidade
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    canvasContainer.appendChild(this.renderer.domElement);

    this.audioSystem = new AudioSystem();
    this.environment = new Environment(this.scene);
    this.player = new Player(this.scene);
    this.cameraController = new CameraController(
      this.camera,
      this.renderer.domElement,
      this.player,
      this.environment.colliders
    );
    this.targetSystem = new TargetSystem(this.scene, this.audioSystem);
    this.weaponSystem = new WeaponSystem(
      this.scene,
      this.player,
      this.cameraController,
      this.targetSystem,
      this.audioSystem
    );
    this.scoreSystem = new ScoreSystem(this.audioSystem);
    this.hud = new HUD(hudContainer, this.audioSystem);

    // 5. Conexão de Eventos e Callbacks entre Subsistemas
    this.wireEvents();
    this.setupKeyboardInput();
    this.setupWindowResize();

    // 6. Inicia o Loop de Renderização
    this.isRunning = true;
    this.renderLoop();
  }

  private wireEvents() {
    // Sincroniza trava do mouse (Pointer Lock) com o overlay de pausa/controles
    this.cameraController.onLockChange = (locked) => {
      this.hud.setPointerLocked(locked);
    };

    // Atualização de Munição no HUD
    this.weaponSystem.onAmmoChanged = (ammo, maxAmmo, reloading) => {
      this.hud.renderAmmoBars(ammo, maxAmmo, reloading);
    };

    // Feedback de Disparo (Recuo, Hitmarker e Pontuação)
    this.weaponSystem.onShotFired = (hitResult) => {
      this.hud.triggerRecoilReticle();
      this.scoreSystem.registerShot(hitResult);

      if (hitResult && hitResult.hit) {
        this.hud.triggerHitmarker(hitResult.isBullseye);
      }
    };

    // Atualização de Placar e Combo
    this.scoreSystem.onScoreChanged = (scoreData) => {
      this.hud.updateScore(scoreData);
    };

    // Botão de início no overlay
    const startBtn = document.getElementById('btn-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.renderer.domElement.requestPointerLock();
      });
    }
  }

  private setupKeyboardInput() {
    window.addEventListener('keydown', (e) => {
      this.keysPressed[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keysPressed[e.code] = false;
    });
  }

  private setupWindowResize() {
    window.addEventListener('resize', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  private getMovementInput(): { forward: number; strafe: number } {
    let forward = 0;
    let strafe = 0;

    // W = mover para frente em direção ao balcão (-z)
    // S = mover para trás afastando do balcão (+z)
    if (this.keysPressed['KeyW'] || this.keysPressed['ArrowUp']) forward -= 1;
    if (this.keysPressed['KeyS'] || this.keysPressed['ArrowDown']) forward += 1;

    // A = strafe para a esquerda (-x)
    // D = strafe para a direita (+x)
    if (this.keysPressed['KeyA'] || this.keysPressed['ArrowLeft']) strafe -= 1;
    if (this.keysPressed['KeyD'] || this.keysPressed['ArrowRight']) strafe += 1;

    return { forward, strafe };
  }

  /**
   * Loop Principal de Atualização e Renderização
   */
  private renderLoop = () => {
    if (!this.isRunning) return;
    requestAnimationFrame(this.renderLoop);

    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), 0.1);
    const elapsedTime = this.timer.getElapsed();

    // 1. Processa Entradas de Movimentação do Jogador
    const moveInput = this.getMovementInput();
    this.player.update(delta, {
      forward: moveInput.forward,
      strafe: moveInput.strafe,
      yaw: this.cameraController.yaw,
      pitch: this.cameraController.pitch
    });

    // 2. Atualiza a Câmera Over-The-Shoulder (RE4)
    this.cameraController.update(delta);

    // 3. Atualiza os Sistemas do Jogo
    this.environment.update(elapsedTime);
    this.targetSystem.update(delta, elapsedTime);
    this.weaponSystem.update(delta);

    // 4. Renderiza a Cena
    this.renderer.render(this.scene, this.camera);
  };
}
