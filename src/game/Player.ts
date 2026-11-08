import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationController } from './AnimationController';

/**
 * Player.ts - Personagem Humano Realista Leon S. Kennedy (Resident Evil 4 Remake).
 * Utiliza o modelo GLTF/GLB humanoide completo com texturas autênticas de alta resolução
 * (jaqueta de couro marrom com arnês tático em X nas costas, zíper metálico frontal,
 * calça tática ripstop chumbo, botas de combate pretas e sem óculos), postura Weaver
 * de combate precisa segurando a pistola Silver Ghost com duas mãos,
 * e física de movimentação restrita à baia de tiro.
 */
export class Player {
  public rootGroup: THREE.Group;
  public weaponGroup: THREE.Group;
  public muzzlePoint: THREE.Object3D;
  public muzzleLight: THREE.PointLight;

  // Modelo GLTF Humano (Leon)
  public leonModel?: THREE.Group;
  public isModelLoaded: boolean = false;

  // Controlador de Animações Esqueléticas (AnimationMixer, clips, crossfade e timeScale)
  public animationController?: AnimationController;

  // Ossos da Armadura Humanoide (Restauração e Pose de Combate)
  public bones: { [name: string]: THREE.Bone } = {};
  public initialBoneRotations: { [name: string]: THREE.Euler } = {};
  public initialBonePositions: { [name: string]: THREE.Vector3 } = {};

  // Limites do Estande de Tiro (Atrás da bancada até a parede traseira e laterais)
  public readonly minX = -6.2;
  public readonly maxX = 6.2;
  public readonly minZ = 1.4; // Balcão em z = 0.95m (extensão até z = 1.375m)
  public readonly maxZ = 6.8; // Parede traseira com porta em z = 7.5m

  // Física e Movimentação WASD
  private speed = 3.2;
  public currentYaw = 0;
  public targetYaw = 0;
  public currentPitch = 0;
  public targetPitch = 0;

  // Recuo de Disparo (Recoil Kick & Slide Blowback)
  private recoilPitch = 0;
  private recoilZ = 0;
  private slideBlowback = 0;
  public isSlideLocked = false;

  // Locomoção Procedural Biomecânica 8-Direções, Inércia e Respiração
  private walkCycle = 0;
  private walkWeight = 0;
  private isMoving = false;
  private lastMoveDir = new THREE.Vector2(0, -1);
  private currentMoveDir = new THREE.Vector2(0, -1);
  private targetMoveDir = new THREE.Vector2(0, -1);
  private currentHipDirYaw = 0;
  private velX = 0;
  private velZ = 0;
  private leanX = 0;
  private leanZ = 0;
  private idleBreathCycle = 0;
  private muzzleFlashTimer = 0;

  // Estado da Animação Esquelética de Recarga Tática ('R')
  public isReloading = false;
  public reloadProgress = 0;

  // Armas e Acessórios Next-Gen (Pistola com Ferrolho Blowback, Red-Dot, Carregador e Laser Tático)
  private handgunMesh!: THREE.Group;
  private slideGroup!: THREE.Group;
  private magazineMesh!: THREE.Mesh;
  private laserSightBeam!: THREE.Mesh;

  // Quaternions base calibrados para orientação anatômica perfeita das duas mãos na empunhadura
  private readonly qRightHandBase = new THREE.Quaternion(-0.07897, -0.52257, 0.77947, 0.33632).normalize();
  private readonly qLeftHandBase = new THREE.Quaternion(0.04101, -0.58544, 0.77282, -0.24152).normalize();

  constructor(scene: THREE.Scene) {
    this.rootGroup = new THREE.Group();
    this.weaponGroup = new THREE.Group();
    this.muzzlePoint = new THREE.Object3D();

    // Posição inicial do atirador na baia de tiro (z = 2.0m)
    this.rootGroup.position.set(0, 0, 2.0);

    // Muzzle Light (Clarão dinâmico na ponta do cano da arma)
    this.muzzleLight = new THREE.PointLight(0x00f0ff, 0, 6);
    this.muzzlePoint.add(this.muzzleLight);

    // Configura iluminação de recorte estilo PS5 acompanhando o personagem
    this.setupCharacterLighting();

    // Cria a pistola tática de combate Next-Gen (Silver Ghost / SG-09 R Custom)
    this.createTacticalWeapons();

    // Carrega o modelo 3D humano do Operador Tático
    this.loadLeonGLB();

    // Adiciona o grupo auxiliar no rootGroup
    this.rootGroup.add(this.weaponGroup);
    scene.add(this.rootGroup);
  }

  /**
   * Iluminação cinematográfica de 3 pontos (Rim Light + Key/Fill + Ground Bounce) estilo PS5
   * acoplada ao rootGroup para destacar o relevo PBR do traje, equipamentos 3D e ferrolho da arma.
   */
  private setupCharacterLighting() {
    // 1. Rim Light fria-azulada traseira/superior para recorte de silhueta (ombros, headset, colete)
    const rimLight = new THREE.PointLight(0x7dd3fc, 2.6, 4.5, 1.5);
    rimLight.position.set(-0.28, 2.05, 0.95);
    this.rootGroup.add(rimLight);

    // 2. Key/Fill Light quente sobre o ombro direito para destacar a arma, luvas e dobras do tecido
    const keyFillLight = new THREE.PointLight(0xfff4e6, 2.0, 4.2, 1.5);
    keyFillLight.position.set(0.80, 1.62, 0.55);
    this.rootGroup.add(keyFillLight);

    // 3. Bounce Light inferior sutil para revelar detalhes das calças cargo, coldre, joelheiras e botas
    const bounceLight = new THREE.PointLight(0x38bdf8, 1.0, 3.2, 1.6);
    bounceLight.position.set(0.10, 0.45, 0.90);
    this.rootGroup.add(bounceLight);
  }

  /**
   * Constrói a pistola de combate Next-Gen (SG-09 R Custom) com Ferrolho Blowback animado,
   * Mira Óptica RMR Red-Dot, alça/massa de Trítio, Carregador destacável e Laser Tático sub-cano.
   */
  private createTacticalWeapons() {
    this.handgunMesh = new THREE.Group();
    this.handgunMesh.name = 'TacticalHandgun';

    const slideSilverMat = new THREE.MeshStandardMaterial({
      color: 0xdce2e8,
      roughness: 0.18,
      metalness: 0.92
    });

    const slideFluteMat = new THREE.MeshStandardMaterial({
      color: 0x262c35,
      roughness: 0.35,
      metalness: 0.78
    });

    const framePolymerMat = new THREE.MeshStandardMaterial({
      color: 0x16191f,
      roughness: 0.55,
      metalness: 0.25
    });

    const gunmetalMat = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.24,
      metalness: 0.88
    });

    const brassChamberMat = new THREE.MeshStandardMaterial({
      color: 0xd4a338,
      roughness: 0.25,
      metalness: 0.85
    });

    const tritiumMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x34d399,
      emissiveIntensity: 1.8,
      roughness: 0.2
    });

    const redDotEmitterMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff
    });

    const opticGlassMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });

    // 1. FRAME / CORPO DE POLÍMERO TÁTICO E CANO FIXO
    const frameGroup = new THREE.Group();
    this.handgunMesh.add(frameGroup);

    // Trilho inferior / Dust cover com Picatinny
    const dustCover = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.022, 0.19), framePolymerMat);
    dustCover.position.set(0, 0.018, -0.055);
    frameGroup.add(dustCover);

    // Cano interno de aço escovado + Câmara dourada/latão visível no Blowback
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.23, 12), gunmetalMat);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, 0.042, -0.095);
    frameGroup.add(gunBarrel);

    const chamberBlock = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.045), brassChamberMat);
    chamberBlock.position.set(0, 0.044, -0.005);
    frameGroup.add(chamberBlock);

    // Compensador tático frontal na ponta do cano
    const compensator = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.048, 0.036), gunmetalMat);
    compensator.position.set(0, 0.038, -0.178);
    frameGroup.add(compensator);

    // Empunhadura ergonômica texturizada + Magwell alargado
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.095, 0.052), framePolymerMat);
    grip.position.set(0, -0.026, 0.002);
    grip.rotation.x = -0.20;
    frameGroup.add(grip);

    const magwell = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.016, 0.058), gunmetalMat);
    magwell.position.set(0, -0.068, 0.012);
    magwell.rotation.x = -0.20;
    frameGroup.add(magwell);

    // Carregador destacável (animado durante a recarga com 'R')
    this.magazineMesh = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.092, 0.042), gunmetalMat);
    this.magazineMesh.position.set(0, -0.035, 0.005);
    this.magazineMesh.rotation.x = -0.20;
    this.handgunMesh.add(this.magazineMesh);

    // Guarda-mato undercut e gatilho curvo
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.038, 0.062), framePolymerMat);
    guard.position.set(0, -0.012, -0.038);
    frameGroup.add(guard);

    const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.024, 0.010), slideSilverMat);
    trigger.position.set(0, -0.006, -0.032);
    trigger.rotation.x = 0.25;
    frameGroup.add(trigger);

    // Módulo de Laser / Lanterna Tática Sub-Cano (SureFire X300 style)
    const tacLightBody = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.026, 0.088), gunmetalMat);
    tacLightBody.position.set(0, -0.002, -0.112);
    frameGroup.add(tacLightBody);

    const laserEmitterLens = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 10), redDotEmitterMat);
    laserEmitterLens.rotation.x = Math.PI / 2;
    laserEmitterLens.position.set(0, -0.004, -0.158);
    frameGroup.add(laserEmitterLens);

    // Feixe de Laser Tático Contínuo Convergente para a linha de tiro
    const laserBeamGeo = new THREE.CylinderGeometry(0.0018, 0.0024, 14.0, 6);
    laserBeamGeo.rotateX(Math.PI / 2);
    laserBeamGeo.translate(0, 0, -7.0);
    const laserBeamMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    this.laserSightBeam = new THREE.Mesh(laserBeamGeo, laserBeamMat);
    this.laserSightBeam.position.set(0, -0.004, -0.160);
    // Leve convergência angular para cruzar a linha central da retícula
    this.laserSightBeam.rotation.set(0.006, -0.012, 0);
    frameGroup.add(this.laserSightBeam);

    // 2. SLIDE / FERROLHO ANIMADO COM BLOWBACK + RED-DOT RMR
    this.slideGroup = new THREE.Group();
    this.handgunMesh.add(this.slideGroup);

    const slideMain = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.046, 0.225), slideSilverMat);
    slideMain.position.set(0, 0.044, -0.045);
    slideMain.castShadow = true;
    this.slideGroup.add(slideMain);

    // Ranhuras usinadas laterais (Serrations) e janela de ejeção
    const slideSerration = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.030, 0.065), slideFluteMat);
    slideSerration.position.set(0, 0.043, 0.025);
    this.slideGroup.add(slideSerration);

    const ejectionPort = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.020, 0.046), slideFluteMat);
    ejectionPort.position.set(0.010, 0.058, -0.006);
    this.slideGroup.add(ejectionPort);

    // Massa de mira frontal com ampola de Trítio brilhante
    const sightF = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.016), gunmetalMat);
    sightF.position.set(0, 0.072, -0.146);
    this.slideGroup.add(sightF);

    const tritiumFront = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.005, 0.004), tritiumMat);
    tritiumFront.position.set(0, 0.074, -0.138);
    this.slideGroup.add(tritiumFront);

    // Alça de mira traseira com 2 pontos de Trítio
    const sightR = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.014, 0.016), gunmetalMat);
    sightR.position.set(0, 0.072, 0.056);
    this.slideGroup.add(sightR);

    for (const sx of [-0.008, 0.008]) {
      const tritiumRear = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), tritiumMat);
      tritiumRear.position.set(sx, 0.074, 0.064);
      this.slideGroup.add(tritiumRear);
    }

    // Mira Óptica Reflex Red-Dot (Trijicon RMR style) montada sobre o ferrolho
    const rmrBase = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.012, 0.046), gunmetalMat);
    rmrBase.position.set(0, 0.071, 0.022);
    this.slideGroup.add(rmrBase);

    const rmrHoodL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.026, 0.032), gunmetalMat);
    rmrHoodL.position.set(-0.017, 0.088, 0.018);
    this.slideGroup.add(rmrHoodL);

    const rmrHoodR = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.026, 0.032), gunmetalMat);
    rmrHoodR.position.set(0.017, 0.088, 0.018);
    this.slideGroup.add(rmrHoodR);

    const rmrHoodTop = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.005, 0.028), gunmetalMat);
    rmrHoodTop.position.set(0, 0.100, 0.018);
    this.slideGroup.add(rmrHoodTop);

    const rmrLens = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.020, 0.003), opticGlassMat);
    rmrLens.position.set(0, 0.087, 0.016);
    this.slideGroup.add(rmrLens);

    const rmrDot = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.0045, 0.0045), redDotEmitterMat);
    rmrDot.position.set(0, 0.087, 0.018);
    this.slideGroup.add(rmrDot);

    // Ponto exato da saída do projétil/laser na boca do cano (Muzzle Point)
    this.muzzlePoint.position.set(0, 0.042, -0.215);
    this.handgunMesh.add(this.muzzlePoint);

    // Posição temporária no rootGroup antes do modelo carregar
    this.handgunMesh.position.set(0.168, 1.405, -0.360);
    this.rootGroup.add(this.handgunMesh);
  }

  /**
   * Carrega o modelo 3D GLTF Humano do Operador Tático
   */
  private loadLeonGLB() {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();

    // Carrega a textura autêntica do Operador Tático Original
    const tacticalOutfitTex = textureLoader.load('/models/leon_outfit.png');
    tacticalOutfitTex.colorSpace = THREE.SRGBColorSpace;
    tacticalOutfitTex.flipY = false;

    loader.load(
      '/models/leon.glb',
      (gltf) => {
        this.leonModel = gltf.scene;

        // O modelo original olha para +Z; invertemos 180 graus para mirar nos alvos em -Z
        this.leonModel.rotation.y = Math.PI;
        this.leonModel.position.set(0, 0, 0);

        // Mapeia e configura malhas, materiais, texturas e sombras
        this.leonModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // Remove óculos
            if (mesh.name.includes('glasses')) {
              mesh.visible = false;
            }

            // Aplica o traje tático PBR multi-material preservando os mapas originais de relevo (normal, roughness e AO)
            if (mesh.name === 'avaturn_look_0' && mesh.material) {
              const lookMat = mesh.material as THREE.MeshStandardMaterial;
              lookMat.map = tacticalOutfitTex;
              lookMat.roughnessMap = null;
              lookMat.metalnessMap = null;
              if (lookMat.normalMap) {
                lookMat.normalScale = new THREE.Vector2(0.55, 0.55);
              }
              if (lookMat.aoMap) {
                lookMat.aoMapIntensity = 0.85;
              }
              lookMat.roughness = 0.85;
              lookMat.metalness = 0.04;
              lookMat.needsUpdate = true;

              // Ajuste geométrico da roupa:
              // 1) Remove a touca (hood) nas costas com transição suave nos ombros para deixar a nuca e o colete 100% livres
              // 2) Suaviza o volume lateral/traseiro da cintura e quadril + suavização Laplaciana soldada (sem degraus)
              // 3) Estende e alarga levemente a barra da calça sobre o cano da bota no tornozelo
              const posAttr = mesh.geometry?.attributes.position;
              const indexAttr = mesh.geometry?.index;
              if (posAttr) {
                const count = posAttr.count;
                const origX = new Float32Array(count);
                const origY = new Float32Array(count);
                const origZ = new Float32Array(count);

                // Soldagem topológica de vértices colocalizados (costuras UV) para suavização Laplaciana sem abrir frestas
                const keyToGroup = new Map<string, number>();
                const vertGroup = new Int32Array(count);
                const groupVerts: number[][] = [];

                for (let i = 0; i < count; i++) {
                  const x = posAttr.getX(i);
                  const y = posAttr.getY(i);
                  const z = posAttr.getZ(i);
                  origX[i] = x;
                  origY[i] = y;
                  origZ[i] = z;

                  const key = `${Math.round(x * 2000)},${Math.round(y * 2000)},${Math.round(z * 2000)}`;
                  let g = keyToGroup.get(key);
                  if (g === undefined) {
                    g = groupVerts.length;
                    keyToGroup.set(key, g);
                    groupVerts.push([]);
                  }
                  vertGroup[i] = g;
                  groupVerts[g].push(i);
                }

                for (let i = 0; i < count; i++) {
                  let x = origX[i];
                  let y = origY[i];
                  let z = origZ[i];

                  // 1. Ajuste anatômico da gola tática na base da nuca (sem esmagar a touca sobre o pescoço)
                  if (y > 1.34 && y <= 1.43 && Math.abs(x) < 0.22 && z < -0.02) {
                    const ax = Math.abs(x);
                    const ux = ax <= 0.14 ? 1.0 : Math.max(0.0, 1.0 - (ax - 0.14) / 0.08);
                    const wx = ux * ux * (3.0 - 2.0 * ux);
                    const t = Math.min(1.0, (y - 1.34) / 0.08);
                    const collarBackZ = -0.162 * (1.0 - t) + (-0.152) * t;
                    if (z < collarBackZ) {
                      z = z * (1.0 - wx) + collarBackZ * wx;
                    }
                  }

                  // 2. Suavização anatômica da cintura e quadril (elimina o degrau da barra do moletom em y=0.82..0.96)
                  if (y > 0.74 && y < 1.18 && Math.abs(x) < 0.25) {
                    const uHem = Math.max(0.0, 1.0 - Math.abs(y - 0.89) / 0.15);
                    const wHem = uHem * uHem * (3.0 - 2.0 * uHem);
                    const wWide = Math.sin(((y - 0.74) / 0.44) * Math.PI);
                    x *= 1.0 - (0.08 * wWide + 0.07 * wHem);
                    if (z < 0) {
                      z *= 1.0 - (0.14 * wWide + 0.20 * wHem);
                    } else {
                      z *= 1.0 - (0.10 * wWide + 0.14 * wHem);
                    }
                  }

                  // 3. Fechamento da barra da calça sobre o cano da bota no tornozelo
                  if (y < 0.20) {
                    const tCuff = Math.min(1.2, (0.20 - y) / 0.10);
                    const cx = (x >= 0 ? 1 : -1) * 0.095;
                    const cz = -0.016;
                    const flare = 1.0 + 0.14 * tCuff;
                    x = cx + (x - cx) * flare;
                    z = cz + (z - cz) * flare;
                    if (y < 0.16) {
                      y = y - (0.16 - y) * 0.95;
                    }
                  }

                  posAttr.setXYZ(i, x, y, z);
                }

                // 4. Remove os triângulos da touca (hood: origY > 1.425 na região cervical) para criar uma gola tática limpa sem triângulos esmagados
                if (indexAttr) {
                  const cleanIndices: number[] = [];
                  for (let i = 0; i < indexAttr.count; i += 3) {
                    const a = indexAttr.getX(i);
                    const b = indexAttr.getX(i + 1);
                    const c = indexAttr.getX(i + 2);
                    const isHoodA = origY[a] > 1.422 && Math.abs(origX[a]) < 0.195;
                    const isHoodB = origY[b] > 1.422 && Math.abs(origX[b]) < 0.195;
                    const isHoodC = origY[c] > 1.422 && Math.abs(origX[c]) < 0.195;
                    if (!isHoodA && !isHoodB && !isHoodC) {
                      cleanIndices.push(a, b, c);
                    }
                  }
                  mesh.geometry.setIndex(cleanIndices);
                }

                // 5. Suavização Laplaciana topológica na cintura e barra da calça
                const updatedIndexAttr = mesh.geometry?.index;
                if (updatedIndexAttr) {
                  const adj = Array.from({ length: groupVerts.length }, () => new Set<number>());
                  for (let i = 0; i < updatedIndexAttr.count; i += 3) {
                    const a = vertGroup[updatedIndexAttr.getX(i)];
                    const b = vertGroup[updatedIndexAttr.getX(i + 1)];
                    const c = vertGroup[updatedIndexAttr.getX(i + 2)];
                    if (a !== b) { adj[a].add(b); adj[b].add(a); }
                    if (b !== c) { adj[b].add(c); adj[c].add(b); }
                    if (c !== a) { adj[c].add(a); adj[a].add(c); }
                  }

                  const nextGroupPos = new Float32Array(groupVerts.length * 3);
                  for (let iter = 0; iter < 4; iter++) {
                    for (let g = 0; g < groupVerts.length; g++) {
                      const rep = groupVerts[g][0];
                      const gx = posAttr.getX(rep);
                      const gy = posAttr.getY(rep);
                      const gz = posAttr.getZ(rep);
                      const ox = origX[rep];
                      const oy = origY[rep];

                      let alpha = 0;
                      if (oy > 0.75 && oy < 1.24 && Math.abs(ox) < 0.24) {
                        alpha = 0.55 * Math.sin(((oy - 0.75) / 0.49) * Math.PI);
                      } else if (oy < 0.20 && oy > 0.105) {
                        alpha = 0.35;
                      }

                      if (alpha > 0 && adj[g].size > 0) {
                        let sx = 0, sy = 0, sz = 0;
                        for (const ng of adj[g]) {
                          const nRep = groupVerts[ng][0];
                          sx += posAttr.getX(nRep);
                          sy += posAttr.getY(nRep);
                          sz += posAttr.getZ(nRep);
                        }
                        const inv = 1.0 / adj[g].size;
                        nextGroupPos[g * 3] = gx * (1.0 - alpha) + sx * inv * alpha;
                        nextGroupPos[g * 3 + 1] = gy * (1.0 - alpha) + sy * inv * alpha;
                        nextGroupPos[g * 3 + 2] = gz * (1.0 - alpha) + sz * inv * alpha;
                      } else {
                        nextGroupPos[g * 3] = gx;
                        nextGroupPos[g * 3 + 1] = gy;
                        nextGroupPos[g * 3 + 2] = gz;
                      }
                    }

                    for (let g = 0; g < groupVerts.length; g++) {
                      const nx = nextGroupPos[g * 3];
                      const ny = nextGroupPos[g * 3 + 1];
                      const nz = nextGroupPos[g * 3 + 2];
                      for (const vi of groupVerts[g]) {
                        posAttr.setXYZ(vi, nx, ny, nz);
                      }
                    }
                  }
                }

                posAttr.needsUpdate = true;
                mesh.geometry.computeVertexNormals();
              }
            }

            // Fecha o tornozelo, retrai a malha sob a roupa e aplica Luvas Táticas de Carbono nas mãos
            if (mesh.name === 'avaturn_body' && mesh.material) {
              const bodyMat = mesh.material as THREE.MeshStandardMaterial;
              const posAttr = mesh.geometry?.attributes.position;
              const normAttr = mesh.geometry?.attributes.normal;
              if (posAttr) {
                const colors = new Float32Array(posAttr.count * 3);
                for (let i = 0; i < posAttr.count; i++) {
                  let x = posAttr.getX(i);
                  const y = posAttr.getY(i);
                  let z = posAttr.getZ(i);
                  const nx = normAttr ? normAttr.getX(i) : 0;
                  const nz = normAttr ? normAttr.getZ(i) : 0;
                  const ax = Math.abs(x);

                  // Retrai apenas o tronco/pernas/braços cobertos pela roupa (preservando 100% da anatomia natural do pescoço y >= 1.38)
                  if (y > 0.16 && y < 1.38 && ax <= 0.26) {
                    x *= 0.84;
                    z *= 0.84;
                  } else if (y > 0.96 && y < 1.48 && ax > 0.19 && ax < 0.64) {
                    const wArm = ax < 0.58 ? 1.0 : Math.max(0.0, (0.64 - ax) / 0.06);
                    x -= nx * 0.022 * wArm;
                    z -= nz * 0.022 * wArm;
                  }

                  posAttr.setXYZ(i, x, y, z);

                  if (y < 0.26) {
                    colors[i * 3] = 0.012;
                    colors[i * 3 + 1] = 0.024;
                    colors[i * 3 + 2] = 0.045;
                  } else if (ax >= 0.50 && y < 1.50) {
                    // Luvas táticas de combate (neutraliza o canal vermelho da textura de pele em espaço linear-sRGB para carbono fosco)
                    const knuckleBoost = ax > 0.68 ? 1.35 : 1.0;
                    colors[i * 3] = 0.014 * knuckleBoost;
                    colors[i * 3 + 1] = 0.034 * knuckleBoost;
                    colors[i * 3 + 2] = 0.068 * knuckleBoost;
                  } else if ((y < 1.36 && ax < 0.50) || (y < 1.46 && ax > 0.18 && ax < 0.50)) {
                    colors[i * 3] = 0.015;
                    colors[i * 3 + 1] = 0.030;
                    colors[i * 3 + 2] = 0.050;
                  } else {
                    colors[i * 3] = 1.0;
                    colors[i * 3 + 1] = 1.0;
                    colors[i * 3 + 2] = 1.0;
                  }
                }
                posAttr.needsUpdate = true;
                mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                mesh.geometry.computeVertexNormals();
                bodyMat.vertexColors = true;
                bodyMat.needsUpdate = true;
              }
            }

            // Botas de combate táticas preservando normalMap e aoMap originais para destacar cadarços, costuras e solado
            if (mesh.name.includes('shoes') && mesh.material) {
              const shoeMat = mesh.material as THREE.MeshStandardMaterial;
              shoeMat.map = null;
              if (shoeMat.normalMap) {
                shoeMat.normalScale = new THREE.Vector2(1.25, 1.25);
              }
              shoeMat.color.setHex(0x1e2228);
              shoeMat.roughness = 0.62;
              shoeMat.metalness = 0.18;
              shoeMat.needsUpdate = true;

              // Eleva todo o colarinho da bota (inclusive as laterais baixas em y > 0.045) e afunila o topo dentro da calça
              const shoePos = mesh.geometry?.attributes.position;
              if (shoePos) {
                for (let i = 0; i < shoePos.count; i++) {
                  let x = shoePos.getX(i);
                  let y = shoePos.getY(i);
                  let z = shoePos.getZ(i);
                  if (y > 0.045) {
                    const origShoeY = y;
                    y = Math.min(0.116, y + (y - 0.045) * 1.35);
                    if (origShoeY > 0.050 && z < 0.06) {
                      const tIn = Math.min(1.0, (origShoeY - 0.050) / 0.025);
                      const cx = (x >= 0 ? 1 : -1) * 0.095;
                      const cz = -0.016;
                      x = cx + (x - cx) * (1.0 - 0.32 * tIn);
                      z = cz + (z - cz) * (1.0 - 0.32 * tIn);
                    }
                  }
                  shoePos.setXYZ(i, x, y, z);
                }
                shoePos.needsUpdate = true;
                mesh.geometry.computeVertexNormals();
              }
            }

            // Corte de Cabelo Tático na Altura da Nuca (estilo Leon RE4 Remake) + Vinculação ao Head/Neck
            // Libera completamente os ombros, o colete dorsal e a linha de visão da câmera Over-The-Shoulder
            if (mesh.name === 'avaturn_hair_0' && mesh.material) {
              const hairMat = mesh.material as THREE.MeshStandardMaterial;
              hairMat.color.setHex(0x362419);
              hairMat.roughness = 0.56;
              hairMat.metalness = 0.12;
              hairMat.depthWrite = true;
              hairMat.alphaTest = 0.5;
              hairMat.needsUpdate = true;

              const hairPos = mesh.geometry?.attributes.position;
              const skinIdx = mesh.geometry?.attributes.skinIndex;
              const skinWgt = mesh.geometry?.attributes.skinWeight;
              if (hairPos) {
                for (let i = 0; i < hairPos.count; i++) {
                  let x = hairPos.getX(i);
                  let y = hairPos.getY(i);
                  let z = hairPos.getZ(i);

                  // Recolhe as mechas longas (y < 1.63) para um corte masculino tático na altura da nuca (y >= 1.52)
                  if (y < 1.63) {
                    const t = Math.min(1.0, (1.63 - y) / 0.35);
                    y = 1.63 - (1.63 - y) * 0.32;
                    // Afunila suavemente na nuca e atrás das orelhas
                    const maxHalfX = THREE.MathUtils.lerp(0.102, 0.076, t);
                    if (Math.abs(x) > maxHalfX) {
                      x = Math.sign(x) * (maxHalfX + (Math.abs(x) - maxHalfX) * 0.18);
                    }
                    const minBackZ = THREE.MathUtils.lerp(-0.132, -0.106, t);
                    if (z < minBackZ) {
                      z = minBackZ + (z - minBackZ) * 0.15;
                    }
                    if (z > 0.02) {
                      z = 0.02 + (z - 0.02) * (1.0 - 0.65 * t);
                    }
                  }

                  // Ajuste nas têmporas/orelhas (y = 1.58..1.70) para encaixe perfeito sob o Headset Tático Peltor
                  if (y >= 1.57 && y <= 1.71 && z > -0.065 && z < 0.045) {
                    const maxEarX = 0.094;
                    if (Math.abs(x) > maxEarX) {
                      x = Math.sign(x) * maxEarX;
                    }
                  }

                  hairPos.setXYZ(i, x, y, z);

                  // Re-vincula 100% dos vértices do cabelo aos ossos Head (5) e Neck (4) para nunca esticar com os braços
                  if (skinIdx && skinWgt) {
                    if (y >= 1.56) {
                      skinIdx.setXYZW(i, 5, 4, 0, 0);
                      skinWgt.setXYZW(i, 1.0, 0.0, 0.0, 0.0);
                    } else {
                      skinIdx.setXYZW(i, 5, 4, 0, 0);
                      skinWgt.setXYZW(i, 0.82, 0.18, 0.0, 0.0);
                    }
                  }
                }
                hairPos.needsUpdate = true;
                if (skinIdx) skinIdx.needsUpdate = true;
                if (skinWgt) skinWgt.needsUpdate = true;
                mesh.geometry.computeVertexNormals();
              }
            }

            // Oculta mechas soltas/cartões de transparência de avaturn_hair_1 para eliminar mechas gigantes ou blocos
            if (mesh.name === 'avaturn_hair_1') {
              mesh.visible = false;
            }
          }

          // Mapeia os ossos do esqueleto humano para controle de pose
          if ((child as THREE.Bone).isBone) {
            const bone = child as THREE.Bone;
            this.bones[bone.name] = bone;
            this.initialBoneRotations[bone.name] = bone.rotation.clone();
            this.initialBonePositions[bone.name] = bone.position.clone();
          }
        });

        // 1. Auditoria e inspeção da hierarquia de ossos real de leon.glb
        console.log('=== [AUDITORIA] HIERARQUIA REAL DE OSSOS DO MODELO (leon.glb / Avaturn) ===');
        const loadedBoneNames = Object.keys(this.bones);
        console.log(`[AUDITORIA] Total de ossos detectados: ${loadedBoneNames.length}`, loadedBoneNames);

        // 2. Inicializa o AnimationController com suporte a Mixamo/Avaturn, In-Place e timeScale dinâmico
        this.animationController = new AnimationController(this.leonModel);

        // 3. Acopla os Equipamentos Táticos 3D diretamente aos ossos corretos
        this.attachTacticalGear();

        // Acopla a pistola tática diretamente ao osso da mão direita (RightHand)
        if (this.bones['RightHand']) {
          this.rootGroup.remove(this.handgunMesh);
          this.bones['RightHand'].add(this.handgunMesh);
          this.handgunMesh.position.set(0.012, 0.085, -0.015);
          this.handgunMesh.rotation.set(1.0638, 0.5325, -1.9987, 'YXZ');
        }

        // Configura a postura Weaver clássica do Operador Tático
        this.applyCombatAimPose(0);

        this.rootGroup.add(this.leonModel);
        this.isModelLoaded = true;
      },
      undefined,
      (err) => {
        console.warn('Aviso ao carregar leon.glb:', err);
      }
    );
  }

  

  /**
   * Modela e acopla os Equipamentos Táticos 3D diretamente aos ossos corretos do esqueleto:
   * - Colete Tático / Plate Carrier / Rádio / Bolsos -> Filho direto do osso Spine2
   * - Cinto Tático de Guarnição / Fivela Cobra / Porta-Carregadores / IFAK -> Filho direto do osso Hips
   * - Coldre Tático Kydex de Coxa -> Filho direto do osso RightUpLeg (coxa direita)
   * - Joelheiras Articuladas -> Filhas diretas dos ossos LeftLeg e RightLeg
   * - Headset Tático Peltor -> Filho direto do osso Head
   * Aplica folgas anti-clipping e anti-z-fighting calibradas contra a malha anatômica.
   */
  private attachTacticalGear() {
    if (!this.leonModel) return;

    // Salva a rotação do modelo e atualiza matrizes na pose de repouso (identidade)
    const savedRotY = this.leonModel.rotation.y;
    this.leonModel.rotation.y = 0;
    this.leonModel.updateMatrixWorld(true);

    /**
     * Anexa um grupo de equipamentos diretamente como filho do osso especificado,
     * convertendo suas coordenadas mundiais para o espaço local exato do osso.
     */
    const attachGearToBone = (boneName: string, gearGroup: THREE.Group) => {
      const bone = this.bones[boneName];
      if (!bone) {
        console.warn(`[Tático] Osso não encontrado para acoplamento de acessório: ${boneName}`);
        return;
      }
      this.leonModel!.add(gearGroup);
      this.leonModel!.updateMatrixWorld(true);
      bone.attach(gearGroup);
    };

    // Materiais PBR Next-Gen para os equipamentos táticos
    const corduraOliveMat = new THREE.MeshStandardMaterial({
      color: 0x384238,
      roughness: 0.64,
      metalness: 0.16
    });
    const corduraDarkMat = new THREE.MeshStandardMaterial({
      color: 0x181c22,
      roughness: 0.68,
      metalness: 0.22
    });
    const kydexPolymerMat = new THREE.MeshStandardMaterial({
      color: 0x1e232a,
      roughness: 0.38,
      metalness: 0.42
    });
    const brushedMetalMat = new THREE.MeshStandardMaterial({
      color: 0x9aa4b2,
      roughness: 0.25,
      metalness: 0.88
    });
    const headsetShellMat = new THREE.MeshStandardMaterial({
      color: 0x3b463e,
      roughness: 0.42,
      metalness: 0.38
    });
    const tacAccentCyanMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00c8ff,
      emissiveIntensity: 0.65,
      roughness: 0.25,
      metalness: 0.5
    });
    const tacAccentAmberMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.4
    });

    // =========================================================================
    // 1. ABAFADOR / HEADSET TÁTICO DE ESTANDE DE TIRO (Filho direto do Head)
    // =========================================================================
    const headGear = new THREE.Group();
    headGear.name = 'TacticalGear_Headset_Head';
    for (const side of [-1, 1]) {
      const cushion = new THREE.Mesh(
        new THREE.CylinderGeometry(0.040, 0.040, 0.018, 16),
        corduraDarkMat
      );
      cushion.rotation.z = Math.PI / 2;
      cushion.position.set(side * 0.096, 1.642, -0.008);
      cushion.scale.set(1.22, 1.0, 0.92);
      cushion.castShadow = true;
      headGear.add(cushion);

      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.042, 0.024, 16),
        headsetShellMat
      );
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.108, 1.642, -0.008);
      cup.scale.set(1.22, 1.0, 0.92);
      cup.castShadow = true;
      headGear.add(cup);

      const capDetail = new THREE.Mesh(
        new THREE.BoxGeometry(0.010, 0.036, 0.024),
        kydexPolymerMat
      );
      capDetail.position.set(side * 0.118, 1.642, -0.008);
      headGear.add(capDetail);

      const ledStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.004, 0.014, 0.006),
        side === -1 ? tacAccentCyanMat : tacAccentAmberMat
      );
      ledStrip.position.set(side * 0.122, 1.648, -0.018);
      headGear.add(ledStrip);

      const wireYoke = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, 0.115, 8),
        brushedMetalMat
      );
      wireYoke.position.set(side * 0.104, 1.715, -0.010);
      wireYoke.rotation.z = -side * 0.18;
      headGear.add(wireYoke);
    }

    const headbandArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.098, 0.014, 10, 20, Math.PI * 0.78),
      corduraDarkMat
    );
    headbandArch.position.set(0, 1.718, -0.010);
    headbandArch.rotation.z = Math.PI * 0.11;
    headbandArch.scale.set(1.0, 1.06, 1.15);
    headbandArch.castShadow = true;
    headGear.add(headbandArch);

    const boomArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.13, 8),
      brushedMetalMat
    );
    boomArm.position.set(0.084, 1.602, 0.055);
    boomArm.rotation.set(1.18, 0.0, 0.42);
    headGear.add(boomArm);

    const micTip = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.010, 0.020),
      corduraDarkMat
    );
    micTip.position.set(0.050, 1.576, 0.112);
    micTip.rotation.y = -0.35;
    headGear.add(micTip);

    attachGearToBone('Head', headGear);

    // =========================================================================
    // 2. COLETE TÁTICO PLATE CARRIER + ARNÊS DORSAL + RÁDIO (Filho direto do Spine2)
    // Folgas anti-clipping de 12mm nas costas e 10mm no peito para garantir zero penetração
    // =========================================================================
    const vestGear = new THREE.Group();
    vestGear.name = 'TacticalGear_PlateCarrier_Spine2';

    // Placa balística traseira com offset seguro (-0.154m) contra a curvatura dorsal
    const backPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.248, 0.258, 0.034),
      corduraOliveMat
    );
    backPlate.position.set(0, 1.245, -0.154);
    backPlate.rotation.x = 0.08;
    backPlate.castShadow = true;
    backPlate.receiveShadow = true;
    vestGear.add(backPlate);

    const backUpperBevel = new THREE.Mesh(
      new THREE.BoxGeometry(0.188, 0.068, 0.030),
      corduraOliveMat
    );
    backUpperBevel.position.set(0, 1.375, -0.144);
    backUpperBevel.rotation.x = 0.14;
    vestGear.add(backUpperBevel);

    const iffPatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.022, 0.010),
      kydexPolymerMat
    );
    iffPatch.position.set(0, 1.382, -0.158);
    iffPatch.rotation.x = 0.14;
    vestGear.add(iffPatch);

    const iffGlowBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.006, 0.008),
      tacAccentCyanMat
    );
    iffGlowBar.position.set(0, 1.382, -0.163);
    iffGlowBar.rotation.x = 0.14;
    vestGear.add(iffGlowBar);

    for (let r = 0; r < 4; r++) {
      const molleRow = new THREE.Mesh(
        new THREE.BoxGeometry(0.236, 0.020, 0.012),
        corduraDarkMat
      );
      molleRow.position.set(0, 1.165 + r * 0.052, -0.168 + r * 0.003);
      molleRow.rotation.x = 0.08;
      vestGear.add(molleRow);
    }

    for (const side of [-1, 1]) {
      const backStrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.28, 0.016),
        corduraDarkMat
      );
      backStrap.position.set(side * 0.082, 1.275, -0.165);
      backStrap.rotation.x = 0.09;
      backStrap.rotation.z = side * 0.06;
      vestGear.add(backStrap);

      const buckle = new THREE.Mesh(
        new THREE.BoxGeometry(0.044, 0.018, 0.020),
        brushedMetalMat
      );
      buckle.position.set(side * 0.088, 1.365, -0.158);
      vestGear.add(buckle);

      const shoulderPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.062, 0.028, 0.160),
        corduraOliveMat
      );
      shoulderPad.position.set(side * 0.116, 1.442, -0.018);
      shoulderPad.rotation.z = -side * 0.15;
      shoulderPad.castShadow = true;
      vestGear.add(shoulderPad);

      const shoulderStrapWeb = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.016, 0.170),
        corduraDarkMat
      );
      shoulderStrapWeb.position.set(side * 0.116, 1.452, -0.018);
      shoulderStrapWeb.rotation.z = -side * 0.15;
      vestGear.add(shoulderStrapWeb);

      // Cummerbund lateral alargado (+12mm) para circundar o tronco com folga
      const cummerbund = new THREE.Mesh(
        new THREE.BoxGeometry(0.026, 0.108, 0.230),
        corduraOliveMat
      );
      cummerbund.position.set(side * 0.174, 1.175, 0.005);
      vestGear.add(cummerbund);

      const cummerMolle = new THREE.Mesh(
        new THREE.BoxGeometry(0.030, 0.058, 0.210),
        corduraDarkMat
      );
      cummerMolle.position.set(side * 0.177, 1.175, 0.005);
      vestGear.add(cummerMolle);
    }

    const radioPack = new THREE.Mesh(
      new THREE.BoxGeometry(0.098, 0.158, 0.046),
      kydexPolymerMat
    );
    radioPack.position.set(0.055, 1.245, -0.182);
    radioPack.rotation.x = 0.08;
    radioPack.castShadow = true;
    vestGear.add(radioPack);

    const radioAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0035, 0.005, 0.24, 8),
      corduraDarkMat
    );
    radioAntenna.position.set(0.094, 1.415, -0.168);
    radioAntenna.rotation.z = -0.08;
    radioAntenna.rotation.x = -0.06;
    vestGear.add(radioAntenna);

    const pttBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.038, 0.048, 0.024),
      kydexPolymerMat
    );
    pttBox.position.set(0.118, 1.395, 0.072);
    pttBox.rotation.x = -0.35;
    vestGear.add(pttBox);

    // Placa balística frontal com folga de avanço (+0.158m)
    const frontPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.240, 0.248, 0.034),
      corduraOliveMat
    );
    frontPlate.position.set(0, 1.235, 0.158);
    frontPlate.rotation.x = -0.08;
    frontPlate.castShadow = true;
    vestGear.add(frontPlate);

    for (let m = -1; m <= 1; m++) {
      const magPouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.064, 0.128, 0.038),
        corduraDarkMat
      );
      magPouch.position.set(m * 0.074, 1.185, 0.182);
      magPouch.rotation.x = -0.08;
      vestGear.add(magPouch);

      const magTop = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, 0.032, 0.026),
        brushedMetalMat
      );
      magTop.position.set(m * 0.074, 1.258, 0.178);
      magTop.rotation.x = -0.08;
      vestGear.add(magTop);
    }

    attachGearToBone('Spine2', vestGear);

    // =========================================================================
    // 3. CINTO DE GUARNIÇÃO TÁTICO COM PORTA-CARREGADORES E IFAK (Filho direto de Hips)
    // =========================================================================
    const beltGear = new THREE.Group();
    beltGear.name = 'TacticalGear_DutyBelt_Hips';

    const beltBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.33, 0.055, 0.038),
      corduraDarkMat
    );
    beltBack.position.set(0, 0.905, -0.154);
    beltBack.castShadow = true;
    beltGear.add(beltBack);

    const beltFront = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.055, 0.038),
      corduraDarkMat
    );
    beltFront.position.set(0, 0.905, 0.134);
    beltFront.castShadow = true;
    beltGear.add(beltFront);

    for (const side of [-1, 1]) {
      const beltSide = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.055, 0.285),
        corduraDarkMat
      );
      beltSide.position.set(side * 0.178, 0.905, -0.010);
      beltSide.castShadow = true;
      beltGear.add(beltSide);
    }

    const cobraBuckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.060, 0.060, 0.022),
      brushedMetalMat
    );
    cobraBuckle.position.set(0, 0.905, 0.152);
    beltGear.add(cobraBuckle);

    for (let p = 0; p < 2; p++) {
      const pPouch = new THREE.Mesh(
        new THREE.BoxGeometry(0.036, 0.094, 0.044),
        kydexPolymerMat
      );
      pPouch.position.set(0.192, 0.915, 0.035 - p * 0.055);
      pPouch.rotation.x = -0.22;
      pPouch.castShadow = true;
      beltGear.add(pPouch);

      const spareMagTip = new THREE.Mesh(
        new THREE.BoxGeometry(0.028, 0.028, 0.034),
        brushedMetalMat
      );
      spareMagTip.position.set(0.194, 0.968, 0.024 - p * 0.055);
      spareMagTip.rotation.x = -0.22;
      beltGear.add(spareMagTip);
    }

    const ifakPouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.118, 0.092, 0.056),
      corduraOliveMat
    );
    ifakPouch.position.set(0.035, 0.908, -0.180);
    ifakPouch.castShadow = true;
    beltGear.add(ifakPouch);

    const dumpPouch = new THREE.Mesh(
      new THREE.BoxGeometry(0.082, 0.108, 0.048),
      corduraDarkMat
    );
    dumpPouch.position.set(-0.085, 0.892, -0.176);
    dumpPouch.castShadow = true;
    beltGear.add(dumpPouch);

    attachGearToBone('Hips', beltGear);

    // =========================================================================
    // 4. COLDRE TÁTICO DE PERNA KYDEX (Filho direto de RightUpLeg - coxa direita)
    // Move e gira rigidamente com a coxa durante o passo, sem clipping ou flutuação
    // =========================================================================
    const holsterGear = new THREE.Group();
    holsterGear.name = 'TacticalGear_Holster_RightUpLeg';

    const holsterShroud = new THREE.Mesh(
      new THREE.BoxGeometry(0.024, 0.168, 0.110),
      corduraDarkMat
    );
    holsterShroud.position.set(-0.182, 0.695, 0.012);
    holsterShroud.rotation.z = -0.05;
    holsterShroud.castShadow = true;
    holsterGear.add(holsterShroud);

    const kydexShell = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.155, 0.076),
      kydexPolymerMat
    );
    kydexShell.position.set(-0.208, 0.698, 0.016);
    kydexShell.rotation.z = -0.05;
    kydexShell.castShadow = true;
    holsterGear.add(kydexShell);

    const dropStrap = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.148, 0.040),
      corduraDarkMat
    );
    dropStrap.position.set(-0.180, 0.825, 0.012);
    dropStrap.rotation.z = -0.04;
    holsterGear.add(dropStrap);

    for (const sy of [0.655, 0.735]) {
      const legStrap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.094, 0.090, 0.028, 16),
        corduraDarkMat
      );
      legStrap.position.set(-0.095, sy, 0.014);
      legStrap.scale.set(0.98, 1.0, 1.15);
      holsterGear.add(legStrap);
    }

    attachGearToBone('RightUpLeg', holsterGear);

    // =========================================================================
    // 5. JOELHEIRAS TÁTICAS ARTICULADAS (Filhas diretas de LeftLeg & RightLeg)
    // =========================================================================
    for (const [legBone, sideSign] of [['LeftLeg', 1], ['RightLeg', -1]] as const) {
      const kneeGear = new THREE.Group();
      kneeGear.name = `TacticalGear_KneePad_${legBone}`;
      const kx = sideSign * 0.096;

      const kneePadBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.100, 0.118, 0.046),
        corduraOliveMat
      );
      kneePadBase.position.set(kx, 0.490, 0.076);
      kneePadBase.castShadow = true;
      kneeGear.add(kneePadBase);

      const kneeCapShell = new THREE.Mesh(
        new THREE.BoxGeometry(0.086, 0.088, 0.030),
        kydexPolymerMat
      );
      kneeCapShell.position.set(kx, 0.490, 0.096);
      kneeCapShell.castShadow = true;
      kneeGear.add(kneeCapShell);

      for (const ky of [0.462, 0.518]) {
        const kneeStrap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.068, 0.066, 0.022, 14),
          corduraDarkMat
        );
        kneeStrap.position.set(kx, ky, 0.005);
        kneeStrap.scale.set(0.94, 1.0, 1.20);
        kneeGear.add(kneeStrap);
      }

      attachGearToBone(legBone, kneeGear);
    }

    // =========================================================================
    // 6. PROTETORES DE NÓS DOS DEDOS E PUNHOS DAS LUVAS TÁTICAS (RightHand & LeftHand)
    // =========================================================================
    for (const [handName, sideSign] of [['RightHand', 1], ['LeftHand', -1]] as const) {
      const handBone = this.bones[handName];
      if (!handBone) continue;

      const wristCuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.033, 0.035, 0.036, 14),
        corduraDarkMat
      );
      wristCuff.position.set(0, 0.008, 0);
      wristCuff.scale.set(0.82, 1.0, 1.12);
      handBone.add(wristCuff);

      const dorsalGuard = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.056, 0.072),
        kydexPolymerMat
      );
      dorsalGuard.position.set(sideSign * 0.018, 0.052, 0.002);
      handBone.add(dorsalGuard);
    }

    // Restaura a rotação original do modelo (Math.PI)
    this.leonModel.rotation.y = savedRotY;
    this.leonModel.updateMatrixWorld(true);
  }


  /**
   * Ajusta os ossos do modelo para a empunhadura Weaver com as duas mãos firmes na pistola
   * e executa a locomoção humana biomecânica natural nos membros inferiores.
   */
  private applyCombatAimPose(pitch: number) {
    if (!this.isModelLoaded) return;

    // 1. Inclinação e apresentação tática do tronco superior acompanhando o pitch da mira
    // ATENÇÃO: NÃO toca nem sobrescreve os ossos da bacia (Hips) e membros inferiores!
    // As pernas (LeftUpLeg, LeftLeg, RightUpLeg, RightLeg) seguem 100% o AnimationController.
    const spine = this.bones['Spine'];
    const spine1 = this.bones['Spine1'];
    const spine2 = this.bones['Spine2'];
    const neck = this.bones['Neck'];
    const head = this.bones['Head'];

    // Respiração sutil no peito (Spine1) durante repouso
    const breath = Math.sin(this.idleBreathCycle) * 0.010 * (1.0 - this.walkWeight);

    if (spine) {
      spine.rotation.x = -0.01 - pitch * 0.08;
      spine.rotation.y = -0.05;
    }
    if (spine1) {
      spine1.rotation.x = -0.02 - pitch * 0.16 + breath;
      spine1.rotation.y = -0.06;
    }
    if (spine2) {
      spine2.rotation.x = -0.02 - pitch * 0.22;
      spine2.rotation.y = -0.04;
    }
    if (neck) {
      neck.rotation.x = 0.01 - pitch * 0.12;
      neck.rotation.y = 0.10;
    }
    if (head) {
      head.rotation.x = 0.01 - pitch * 0.12;
      head.rotation.y = 0.05;
    }

    // 2. Cinemática Inversa de 2 Ossos (Two-Bone IK) + Weapon Sway + Animação Tática de Recarga ('R')
    const rShoulder = this.bones['RightShoulder'];
    const lShoulder = this.bones['LeftShoulder'];
    const rArm = this.bones['RightArm'];
    const rForeArm = this.bones['RightForeArm'];
    const rHand = this.bones['RightHand'];
    const lArm = this.bones['LeftArm'];
    const lForeArm = this.bones['LeftForeArm'];
    const lHand = this.bones['LeftHand'];

    // Contrabalanço orgânico das clavículas durante a marcha (ombro direito encaixado baixo para liberar a visão OTS da arma)
    const shoulderWave = Math.sin(this.walkCycle) * 0.018 * this.walkWeight;
    if (rShoulder) {
      rShoulder.rotation.z += -0.26 + shoulderWave;
    }
    if (lShoulder) {
      lShoulder.rotation.z += 0.34 - shoulderWave;
      lShoulder.rotation.y += -0.08;
    }

    // Pose inicial anatômica antes do ajuste analítico de 2 ossos
    if (rArm) rArm.rotation.set(0.35, -0.25, -1.30);
    if (lArm) lArm.rotation.set(0.75, 0.45, 1.40);

    this.rootGroup.updateMatrixWorld(true);

    // Micro-oscilação orgânica em Figura-8 (Lissajous Weapon Sway) sincronizada com os passos e respiração
    const swayX =
      Math.cos(this.walkCycle) * 0.008 * this.walkWeight +
      Math.sin(this.idleBreathCycle * 0.5) * 0.002 * (1.0 - this.walkWeight);
    const swayY =
      Math.sin(this.walkCycle * 2) * 0.009 * this.walkWeight +
      Math.sin(this.idleBreathCycle) * 0.003 * (1.0 - this.walkWeight);
    const swayZ = Math.cos(this.walkCycle * 2) * 0.005 * this.walkWeight;

    // Coordenada alvo da empunhadura no espaço local do rootGroup (acima da linha do ombro direito para visão 100% livre das mãos e da pistola)
    const gripLocal = new THREE.Vector3(
      0.215 + swayX,
      1.468 + Math.sin(pitch) * 0.25 + this.recoilPitch * 0.14 + swayY,
      -0.385 * Math.cos(pitch) + this.recoilZ + swayZ
    );
    const lGripLocal = gripLocal.clone().add(new THREE.Vector3(-0.014, -0.006, 0.008));

    // Animação Esquelética de Recarga Tática ('R')
    let reloadRoll = 0;
    let reloadPitchOffset = 0;
    let reloadLeftHandYaw = 0;
    if (this.isReloading) {
      const p = this.reloadProgress;
      const env = Math.sin(p * Math.PI);
      // Mão direita eleva e inclina a pistola no corredor OTS para exibir claramente o magwell, o carregador e o ferrolho
      gripLocal.x += 0.018 * env;
      gripLocal.y += 0.042 * env;
      gripLocal.z += 0.045 * env;
      reloadRoll = 0.56 * env;
      reloadPitchOffset = 0.26 * env;

      // Impulso mecânico ao encaixar o carregador novo (p ~ 0.58)
      if (p > 0.52 && p < 0.66) {
        const jolt = Math.sin(((p - 0.52) / 0.14) * Math.PI);
        gripLocal.y += 0.022 * jolt;
      }

      // Trajetória da mão esquerda: Empunhadura -> Porta-Carregador no Cinto -> Magwell da Pistola -> Ferrolho -> Empunhadura
      const beltPouchLocal = new THREE.Vector3(-0.185, 0.94, -0.02);
      const magwellEntryLocal = gripLocal.clone().add(new THREE.Vector3(-0.022, -0.095, 0.025));
      const magwellSeatedLocal = gripLocal.clone().add(new THREE.Vector3(-0.014, -0.022, 0.010));
      const slideRackLocal = gripLocal.clone().add(new THREE.Vector3(-0.016, 0.072, 0.042));
      const baseLeftGrip = gripLocal.clone().add(new THREE.Vector3(-0.014, -0.006, 0.008));

      if (p < 0.28) {
        // Fase 1: Mão esquerda desce até o porta-carregador no cinto tático; carregador antigo desliza
        const u = THREE.MathUtils.smoothstep(p, 0.0, 0.28);
        lGripLocal.lerpVectors(baseLeftGrip, beltPouchLocal, u);
        reloadLeftHandYaw = 0.45 * u;
        if (this.magazineMesh) {
          this.magazineMesh.position.set(0, -0.035 - 0.11 * u, 0.005 + 0.025 * u);
        }
      } else if (p < 0.55) {
        // Fase 2: Mão esquerda traz o carregador novo do cinto até a entrada do magwell
        const u = THREE.MathUtils.smoothstep(p, 0.28, 0.55);
        lGripLocal.lerpVectors(beltPouchLocal, magwellEntryLocal, u);
        reloadLeftHandYaw = 0.45 * (1.0 - u);
        if (this.magazineMesh) {
          this.magazineMesh.position.set(0, -0.145 + 0.075 * u, 0.030 - 0.015 * u);
        }
      } else if (p < 0.68) {
        // Fase 3: Encaixe firme (Slam) do carregador dentro do punho da pistola
        const u = THREE.MathUtils.smoothstep(p, 0.55, 0.68);
        lGripLocal.lerpVectors(magwellEntryLocal, magwellSeatedLocal, u);
        if (this.magazineMesh) {
          this.magazineMesh.position.set(0, -0.070 + 0.035 * u, 0.015 - 0.010 * u);
        }
      } else if (p < 0.84) {
        // Fase 4: Mão esquerda sobe ao topo do ferrolho para liberar/ciclar o slide (Slide Release)
        const u = THREE.MathUtils.smoothstep(p, 0.68, 0.84);
        const arc = Math.sin(u * Math.PI);
        lGripLocal.lerpVectors(magwellSeatedLocal, slideRackLocal, arc);
        this.slideBlowback = Math.max(this.slideBlowback, 0.042 * arc);
        if (this.magazineMesh) {
          this.magazineMesh.position.set(0, -0.035, 0.005);
        }
      } else {
        // Fase 5: Retorno suave para a empunhadura dupla Weaver/Isosceles
        const u = THREE.MathUtils.smoothstep(p, 0.84, 1.0);
        lGripLocal.lerpVectors(slideRackLocal, baseLeftGrip, u);
        if (this.magazineMesh) {
          this.magazineMesh.position.set(0, -0.035, 0.005);
        }
      }
    } else if (this.magazineMesh) {
      this.magazineMesh.position.set(0, -0.035, 0.005);
    }

    // Pole vectors anatômicos com cotovelo direito encaixado para baixo (permite ver antebraço, luvas e pistola por inteiro)
    const rPoleLocal = new THREE.Vector3(0.20, 0.92 + Math.sin(pitch) * 0.12, -0.16);
    const lPoleLocal = new THREE.Vector3(-0.22, 0.96 + Math.sin(pitch) * 0.12, -0.16);

    const gripWorld = gripLocal.applyMatrix4(this.rootGroup.matrixWorld);
    const lGripWorld = lGripLocal.applyMatrix4(this.rootGroup.matrixWorld);
    const rPoleWorld = rPoleLocal.applyMatrix4(this.rootGroup.matrixWorld);
    const lPoleWorld = lPoleLocal.applyMatrix4(this.rootGroup.matrixWorld);

    if (rArm && rForeArm && rHand) {
      this.solveTwoBoneIK(rArm, rForeArm, rHand, gripWorld, rPoleWorld);
    }
    if (lArm && lForeArm && lHand) {
      this.solveTwoBoneIK(lArm, lForeArm, lHand, lGripWorld, lPoleWorld);
    }

    // Alinha a orientação global das mãos para cravar o cano da pistola na direção do Pitch da mira com leve convergência OTS
    const qPitch = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitch + this.recoilPitch * 0.65 + reloadPitchOffset, -0.04, reloadRoll, 'YXZ')
    );
    if (rHand) {
      const qTargetRH = this.rootGroup.quaternion
        .clone()
        .multiply(qPitch)
        .multiply(this.qRightHandBase);
      this.setBoneWorldQuaternion(rHand, qTargetRH);
    }
    if (lHand) {
      const qLeftMod = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(pitch + this.recoilPitch * 0.65, reloadLeftHandYaw, reloadRoll * 0.5, 'YXZ')
      );
      const qTargetLH = this.rootGroup.quaternion
        .clone()
        .multiply(qLeftMod)
        .multiply(this.qLeftHandBase);
      this.setBoneWorldQuaternion(lHand, qTargetLH);
    }

    // 5. Fechamento anatômico real de todas as falanges e polegares ao redor da pistola
    const fingerNames = ['Index', 'Middle', 'Ring', 'Pinky'];
    const hands = ['RightHand', 'LeftHand'];
    for (const hand of hands) {
      for (const finger of fingerNames) {
        const f1 = this.bones[`${hand}${finger}1`];
        const f2 = this.bones[`${hand}${finger}2`];
        const f3 = this.bones[`${hand}${finger}3`];
        if (f1) f1.rotation.set(1.10, 0, 0);
        if (f2) f2.rotation.set(1.20, 0, 0);
        if (f3) f3.rotation.set(0.95, 0, 0);
      }
      const t1 = this.bones[`${hand}Thumb1`];
      const t2 = this.bones[`${hand}Thumb2`];
      const t3 = this.bones[`${hand}Thumb3`];
      const s = hand === 'RightHand' ? 1 : -1;
      if (t1) t1.rotation.set(0.55, -0.15 * s, -0.15 * s);
      if (t2) t2.rotation.set(0.10, 0, 0.75 * s);
      if (t3) t3.rotation.set(0.05, 0, 0.55 * s);
    }
  }

  /**
   * Atualiza o estado e progresso da animação esquelética de recarga tática ('R')
   */
  public setReloadState(reloading: boolean, progress: number) {
    this.isReloading = reloading;
    this.reloadProgress = progress;
  }

  /**
   * Solver Analítico de Cinemática Inversa de 2 Ossos (Lei dos Cossenos + Alinhamento de Plano Pole Vector)
   */
  private solveTwoBoneIK(
    upperBone: THREE.Bone,
    lowerBone: THREE.Bone,
    endBone: THREE.Bone,
    targetWorldPos: THREE.Vector3,
    poleWorldPos: THREE.Vector3
  ) {
    this.rootGroup.updateMatrixWorld(true);
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const pC = new THREE.Vector3();
    upperBone.getWorldPosition(pA);
    lowerBone.getWorldPosition(pB);
    endBone.getWorldPosition(pC);

    const lab = pA.distanceTo(pB);
    const lbc = pB.distanceTo(pC);
    const dirAT = new THREE.Vector3().subVectors(targetWorldPos, pA);
    const lat = THREE.MathUtils.clamp(dirAT.length(), 0.05, lab + lbc - 0.002);

    const dirAB = new THREE.Vector3().subVectors(pB, pA).normalize();
    const cosAngleA = THREE.MathUtils.clamp(
      (lab * lab + lat * lat - lbc * lbc) / (2 * lab * lat),
      -1,
      1
    );
    const angleA = Math.acos(cosAngleA);

    const dirATNorm = dirAT.clone().normalize();
    const toPole = new THREE.Vector3().subVectors(poleWorldPos, pA);
    const planeNormal = new THREE.Vector3().crossVectors(dirATNorm, toPole).normalize();
    if (planeNormal.lengthSq() < 1e-5) {
      planeNormal.set(0, 1, 0);
    }

    const desiredAB = dirATNorm.clone().applyAxisAngle(planeNormal, angleA);
    const qUpperWorld = new THREE.Quaternion().setFromUnitVectors(dirAB, desiredAB);
    const parentUpperQ = new THREE.Quaternion();
    if (upperBone.parent) upperBone.parent.getWorldQuaternion(parentUpperQ);
    const upperWorldQ = new THREE.Quaternion();
    upperBone.getWorldQuaternion(upperWorldQ);
    upperBone.quaternion.copy(parentUpperQ.invert().multiply(qUpperWorld).multiply(upperWorldQ));
    this.rootGroup.updateMatrixWorld(true);

    lowerBone.getWorldPosition(pB);
    endBone.getWorldPosition(pC);
    const curBC = new THREE.Vector3().subVectors(pC, pB).normalize();
    const desBC = new THREE.Vector3().subVectors(targetWorldPos, pB).normalize();
    const qLowerWorld = new THREE.Quaternion().setFromUnitVectors(curBC, desBC);
    const parentLowerQ = new THREE.Quaternion();
    if (lowerBone.parent) lowerBone.parent.getWorldQuaternion(parentLowerQ);
    const lowerWorldQ = new THREE.Quaternion();
    lowerBone.getWorldQuaternion(lowerWorldQ);
    lowerBone.quaternion.copy(parentLowerQ.invert().multiply(qLowerWorld).multiply(lowerWorldQ));
    this.rootGroup.updateMatrixWorld(true);
  }

  /**
   * Define a orientação global exata de um osso convertendo para o espaço local do pai
   */
  private setBoneWorldQuaternion(bone: THREE.Bone, targetWorldQ: THREE.Quaternion) {
    const parentQ = new THREE.Quaternion();
    if (bone.parent) {
      bone.parent.getWorldQuaternion(parentQ);
    }
    bone.quaternion.copy(parentQ.invert().multiply(targetWorldQ));
    bone.updateMatrixWorld(true);
  }

  /**
   * Aciona a animação de recuo de disparo (Muzzle Kick & Slide Blowback)
   */
  public triggerRecoil() {
    this.recoilPitch = 0.095; // Elevação instantânea do cano
    this.recoilZ = 0.028;
    this.slideBlowback = 0.042; // Recuo físico real do ferrolho (4.2cm)
    this.muzzleFlashTimer = 0.055;
    this.muzzleLight.intensity = 5.0;
  }

  /**
   * Retorna a coordenada global exata do bico da arma para traçar o feixe de tiro
   */
  public getMuzzleWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    return this.muzzlePoint.getWorldPosition(target);
  }

  /**
   * Retorna a coordenada aproximada da cabeça para referência de câmera
   */
  public getHeadWorldPosition(target: THREE.Vector3): THREE.Vector3 {
    target.copy(this.rootGroup.position);
    target.y += 1.62;
    return target;
  }

  /**
   * Atualização frame a frame (movimentação WASD em 8 direções, inércia, rotação e recuo)
   */
  public update(delta: number, input: { forward: number; strafe: number; yaw: number; pitch: number }) {
    // 1. Suavização rápida da rotação horizontal (Yaw) do corpo pelo menor arco angular (360° livre)
    this.targetYaw = input.yaw;
    const yawDiff = Math.atan2(Math.sin(this.targetYaw - this.currentYaw), Math.cos(this.targetYaw - this.currentYaw));
    this.currentYaw += yawDiff * Math.min(1.0, 25 * delta);
    this.rootGroup.rotation.y = this.currentYaw;

    // 2. Rotação vertical (Pitch) da mira
    this.targetPitch = input.pitch;
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.targetPitch, Math.min(1.0, 25 * delta));

    // 3. Processamento de Movimentação WASD relativa à orientação 360° da câmera/personagem
    const moveX = input.strafe;
    const moveZ = input.forward;
    const inputLen = Math.hypot(moveX, moveZ);
    this.isMoving = inputLen > 0.01;

    const prevX = this.rootGroup.position.x;
    const prevZ = this.rootGroup.position.z;

    let dirX = 0;
    let dirZ = 0;
    let targetVelX = 0;
    let targetVelZ = 0;
    if (this.isMoving) {
      const localX = moveX / inputLen;
      const localZ = moveZ / inputLen;
      this.targetMoveDir.set(localX, localZ);
      // Suavização contínua do vetor de direção para transições orgânicas sem snap ao alternar teclas
      this.currentMoveDir.lerp(this.targetMoveDir, Math.min(1.0, 10 * delta));
      dirX = this.currentMoveDir.x;
      dirZ = this.currentMoveDir.y;
      this.lastMoveDir.copy(this.currentMoveDir);

      targetVelX = localX * this.speed;
      targetVelZ = localZ * this.speed;

      // Transforma o vetor local (WASD) pela orientação horizontal (currentYaw) para o espaço global
      const cosYaw = Math.cos(this.currentYaw);
      const sinYaw = Math.sin(this.currentYaw);
      const worldMoveX = localX * cosYaw + localZ * sinYaw;
      const worldMoveZ = -localX * sinYaw + localZ * cosYaw;

      this.rootGroup.position.x += worldMoveX * this.speed * delta;
      this.rootGroup.position.z += worldMoveZ * this.speed * delta;
    } else {
      dirX = this.lastMoveDir.x;
      dirZ = this.lastMoveDir.y;
    }

    // Cálculo de Inércia Reativa (Velocity Lean) e Orientação Direcional do Quadril em 8 Direções
    const prevVelX = this.velX;
    const prevVelZ = this.velZ;
    this.velX = THREE.MathUtils.lerp(this.velX, targetVelX, Math.min(1.0, 12 * delta));
    this.velZ = THREE.MathUtils.lerp(this.velZ, targetVelZ, Math.min(1.0, 12 * delta));

    const accelX = (this.velX - prevVelX) / Math.max(0.008, delta);
    const accelZ = (this.velZ - prevVelZ) / Math.max(0.008, delta);

    // Inclinação física sutil ao acelerar, frear ou inverter strafe
    const targetLeanX = THREE.MathUtils.clamp(-this.velZ * 0.014 - accelZ * 0.0025, -0.065, 0.065);
    const targetLeanZ = THREE.MathUtils.clamp(-this.velX * 0.015 - accelX * 0.0025, -0.065, 0.065);
    this.leanX = THREE.MathUtils.lerp(this.leanX, targetLeanX, Math.min(1.0, 10 * delta));
    this.leanZ = THREE.MathUtils.lerp(this.leanZ, targetLeanZ, Math.min(1.0, 10 * delta));

    // Orientação do quadril (8-Way Hip Twist): gira a pelve na direção do deslocamento mantendo o tórax no alvo
    const fwdSign = dirZ <= 0 ? 1 : -1;
    const targetHipYaw = this.isMoving ? -dirX * fwdSign * 0.42 : 0;
    this.currentHipDirYaw = THREE.MathUtils.lerp(this.currentHipDirYaw, targetHipYaw, Math.min(1.0, 9 * delta));

    // Clamping nos limites do estande (não atravessa o balcão frontal nem as paredes externas/traseira)
    this.rootGroup.position.x = THREE.MathUtils.clamp(this.rootGroup.position.x, this.minX, this.maxX);
    this.rootGroup.position.z = THREE.MathUtils.clamp(this.rootGroup.position.z, this.minZ, this.maxZ);

    // Colisão com as divisórias laterais da baia central (x = ±2.05 a ±3.05 quando z < 3.55, cobrindo o vidro até z = 3.5m)
    if (this.rootGroup.position.z < 3.55) {
      if (Math.abs(prevX) <= 2.05) {
        this.rootGroup.position.x = THREE.MathUtils.clamp(this.rootGroup.position.x, -2.05, 2.05);
      } else if (Math.abs(prevX) >= 3.05) {
        if (prevX < 0) {
          this.rootGroup.position.x = Math.min(this.rootGroup.position.x, -3.05);
        } else {
          this.rootGroup.position.x = Math.max(this.rootGroup.position.x, 3.05);
        }
      } else if (prevZ >= 3.55) {
        this.rootGroup.position.z = 3.55;
      }
    }

    // 4. Ciclo de passos e amortecimento suave (Lerp com Damping) ao parar
    const strideFreq = 6.8; // Cadência humana dinâmica de caminhada tática
    if (this.isMoving) {
      this.walkCycle = (this.walkCycle + delta * strideFreq) % (Math.PI * 2);
      this.walkWeight = THREE.MathUtils.lerp(this.walkWeight, 1.0, 10 * delta);
    } else {
      // Ao soltar as teclas de movimento, walkWeight decai suavemente para 0 retornando à base estável
      this.walkWeight = THREE.MathUtils.lerp(this.walkWeight, 0.0, 8 * delta);
      if (this.walkWeight < 0.002) {
        this.walkWeight = 0;
      } else {
        this.walkCycle = (this.walkCycle + delta * strideFreq * this.walkWeight) % (Math.PI * 2);
      }
      this.idleBreathCycle = (this.idleBreathCycle + delta * 2.2) % (Math.PI * 2);
    }

    // Garante que o modelo não tenha oscilação global no Y (isolando tronco superior e câmera)
    if (this.leonModel && this.leonModel.position.y !== 0) {
      this.leonModel.position.y = 0;
    }

    // 5. Sincroniza o AnimationController (Mixer, clips idle/walk/aim, timeScale dinâmico)
    if (this.animationController) {
      this.animationController.setLocomotionState(this.isMoving, this.speed);
      this.animationController.update(delta);
    }

    // 6. Aplica a mira tática superior OTS e cinemática dos braços (IK + Recarga)
    // Preserva 100% da flexão das pernas e bacia calculada pelo AnimationMixer
    this.applyCombatAimPose(this.currentPitch);

    // 6. Recuperação suave do recuo da arma e retorno mecânico do ferrolho (Slide Blowback)
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, 18 * delta);
    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, 18 * delta);
    const targetSlideZ = this.isSlideLocked ? 0.038 : 0.0;
    this.slideBlowback = THREE.MathUtils.lerp(this.slideBlowback, targetSlideZ, 26 * delta);
    if (this.slideGroup) {
      this.slideGroup.position.z = this.slideBlowback;
    }

    if (this.isModelLoaded && this.bones['RightHand']) {
      // Posição firme na mão direita (sem deslocamento que solte a arma da palma)
      this.handgunMesh.position.set(0.012, 0.085, -0.015);
      this.handgunMesh.rotation.set(1.0638 + this.recoilPitch * 0.35, 0.5325, -1.9987, 'YXZ');
    }

    // Timer do clarão de disparo
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= delta;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }
  }
}
