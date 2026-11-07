import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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

  // Recuo de Disparo (Recoil Kick)
  private recoilPitch = 0;
  private recoilZ = 0;

  // Locomoção Procedural e Respiração
  private walkCycle = 0;
  private walkWeight = 0;
  private isMoving = false;
  private lastMoveDir = new THREE.Vector2(0, -1);
  private currentMoveDir = new THREE.Vector2(0, -1);
  private targetMoveDir = new THREE.Vector2(0, -1);
  private idleBreathCycle = 0;
  private muzzleFlashTimer = 0;

  // Armas e Acessórios (Apenas a pistola tática na mão - SEM rifle nas costas)
  private handgunMesh!: THREE.Group;

  constructor(scene: THREE.Scene) {
    this.rootGroup = new THREE.Group();
    this.weaponGroup = new THREE.Group();
    this.muzzlePoint = new THREE.Object3D();

    // Posição inicial do atirador na baia de tiro (z = 2.0m)
    this.rootGroup.position.set(0, 0, 2.0);

    // Muzzle Light (Clarão dinâmico na ponta do cano da arma)
    this.muzzleLight = new THREE.PointLight(0x00f0ff, 0, 6);
    this.muzzlePoint.add(this.muzzleLight);

    // Cria a pistola tática de combate (Silver Ghost / SG-09 R)
    this.createTacticalWeapons();

    // Carrega o modelo 3D humano do Operador Tático
    this.loadLeonGLB();

    // Adiciona o grupo auxiliar no rootGroup
    this.rootGroup.add(this.weaponGroup);
    scene.add(this.rootGroup);
  }

  /**
   * Constrói a pistola de combate (Silver Ghost / SG-09 R) detalhada
   */
  private createTacticalWeapons() {
    // ==========================================
    // PISTOLA DE COMBATE (SILVER GHOST / SG-09 R)
    // ==========================================
    this.handgunMesh = new THREE.Group();
    this.handgunMesh.name = 'TacticalHandgun';

    const slideSilverMat = new THREE.MeshStandardMaterial({
      color: 0xd4d8dc,
      roughness: 0.22,
      metalness: 0.88
    });

    const framePolymerMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.6,
      metalness: 0.2
    });

    const gunmetalMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.25,
      metalness: 0.9
    });

    // Ferrolho prateado superior (Slide voltado para -Z)
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.052, 0.24), slideSilverMat);
    slide.position.set(0, 0.04, -0.04);
    slide.castShadow = true;
    this.handgunMesh.add(slide);

    // Cano dianteiro de aço escovado
    const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 10), gunmetalMat);
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, 0.035, -0.10);
    this.handgunMesh.add(gunBarrel);

    // Empunhadura de polímero texturizado encaixada dentro das mãos fechadas (Grip)
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.085, 0.052), framePolymerMat);
    grip.position.set(0, -0.022, -0.012);
    grip.rotation.x = -0.18;
    grip.castShadow = false;
    this.handgunMesh.add(grip);

    // Guarda-mato e gatilho
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.042, 0.06), framePolymerMat);
    guard.position.set(0, -0.02, -0.03);
    this.handgunMesh.add(guard);

    // Massa de mira frontal
    const sightF = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.015), gunmetalMat);
    sightF.position.set(0, 0.072, -0.15);
    this.handgunMesh.add(sightF);

    // Alça de mira traseira
    const sightR = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.015), gunmetalMat);
    sightR.position.set(0, 0.072, 0.06);
    this.handgunMesh.add(sightR);

    // Ponto exato da saída do projétil/laser na boca do cano (Muzzle Point)
    this.muzzlePoint.position.set(0, 0.038, -0.22);
    this.handgunMesh.add(this.muzzlePoint);

    // Posição temporária no rootGroup antes do modelo carregar
    this.handgunMesh.position.set(0.0, 1.32, -0.38);
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

            // Aplica a camisa de compressão tática escura de manga curta e calça tática (sem touca e sem manchas)
            if (mesh.name === 'avaturn_look_0' && mesh.material) {
              const lookMat = mesh.material as THREE.MeshStandardMaterial;
              lookMat.map = tacticalOutfitTex;
              lookMat.normalMap = null;
              lookMat.roughnessMap = null;
              lookMat.metalnessMap = null;
              lookMat.aoMap = null;
              lookMat.roughness = 0.78;
              lookMat.metalness = 0.12;
              lookMat.needsUpdate = true;

              // Ajuste geométrico da roupa:
              // 1) Remove a touca (hood) nas costas com transição suave nos ombros para deixar o cabelo 100% livre
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

                  // 1. Remoção total da touca (hood) na região cervical/costas superior com feathering suave nos ombros
                  if (y > 1.30 && Math.abs(x) < 0.24) {
                    const ax = Math.abs(x);
                    const ux = ax <= 0.14 ? 1.0 : Math.max(0.0, 1.0 - (ax - 0.14) / 0.10);
                    const wx = ux * ux * (3.0 - 2.0 * ux);
                    if (z < -0.02) {
                      const t = Math.min(1.0, (y - 1.30) / 0.09);
                      const maxBackZ = -0.140 * (1.0 - t) + (-0.080) * t;
                      if (z < maxBackZ) {
                        z = z * (1.0 - wx) + maxBackZ * wx;
                      }
                    }
                    if (y > 1.44) {
                      const targetY = 1.44 + (y - 1.44) * 0.10;
                      y = y * (1.0 - wx) + targetY * wx;
                      x *= 1.0 - 0.12 * wx;
                      if (z < -0.078) {
                        z = z * (1.0 - wx) + (-0.078) * wx;
                      }
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

                // 4. Suavização Laplaciana topológica (4 iterações) para eliminar vincos e degraus residuais na cintura e nuca
                if (indexAttr) {
                  const adj = Array.from({ length: groupVerts.length }, () => new Set<number>());
                  for (let i = 0; i < indexAttr.count; i += 3) {
                    const a = vertGroup[indexAttr.getX(i)];
                    const b = vertGroup[indexAttr.getX(i + 1)];
                    const c = vertGroup[indexAttr.getX(i + 2)];
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
                      const oz = origZ[rep];

                      let alpha = 0;
                      if (oy > 0.75 && oy < 1.24 && Math.abs(ox) < 0.24) {
                        alpha = 0.55 * Math.sin(((oy - 0.75) / 0.49) * Math.PI);
                      } else if (oy >= 1.24 && oy < 1.60 && Math.abs(ox) < 0.20 && oz < 0.02) {
                        alpha = 0.45;
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
                      let nz = nextGroupPos[g * 3 + 2];
                      if (ny > 1.40 && Math.abs(nx) < 0.24 && nz < -0.082) {
                        nz = -0.082;
                      }
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

            // Fecha o tornozelo (sem pele aparente) e retrai suavemente a malha base sob a roupa e mangas para evitar clipping
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

                  // Retrai o tronco, costas, ombros, braços cobertos pelas mangas e pernas para nunca atravessar a roupa tática
                  if (y > 1.30 && y < 1.49 && ax < 0.22 && z < -0.02) {
                    const t = Math.min(1.0, (y - 1.30) / 0.10);
                    const limitZ = -0.148 * (1.0 - t) + (-0.090) * t;
                    if (z < limitZ) z = limitZ;
                  }
                  if (y > 0.16 && y < 1.43 && ax <= 0.26) {
                    x *= 0.84;
                    z *= 0.84;
                  } else if (y > 0.96 && y < 1.50 && ax > 0.20 && ax < 0.64) {
                    // Braços e ombros sob a manga longa tática: retrai ao longo da normal para zero clipping nos ombros/cotovelos
                    const wArm = ax < 0.58 ? 1.0 : Math.max(0.0, (0.64 - ax) / 0.06);
                    x -= nx * 0.020 * wArm;
                    z -= nz * 0.020 * wArm;
                  }

                  posAttr.setXYZ(i, x, y, z);

                  // Cor de meia/cano de bota tática preta nos tornozelos e pés (y < 0.26)
                  // e tecido escuro nas áreas cobertas (tronco, pernas e mangas), mantendo pele 100% original na cabeça/pescoço e mãos
                  if (y < 0.26) {
                    colors[i * 3] = 0.06;
                    colors[i * 3 + 1] = 0.07;
                    colors[i * 3 + 2] = 0.09;
                  } else if ((y < 1.43 && ax < 0.63) || (y < 1.48 && ax > 0.18 && ax < 0.63)) {
                    colors[i * 3] = 0.08;
                    colors[i * 3 + 1] = 0.09;
                    colors[i * 3 + 2] = 0.12;
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

            // Transforma o calçado em botas de combate táticas escuras de cano alto fechado dentro da barra da calça
            if (mesh.name.includes('shoes') && mesh.material) {
              const shoeMat = mesh.material as THREE.MeshStandardMaterial;
              shoeMat.map = null;
              shoeMat.normalMap = null;
              shoeMat.roughnessMap = null;
              shoeMat.metalnessMap = null;
              shoeMat.aoMap = null;
              shoeMat.color.setHex(0x121418);
              shoeMat.roughness = 0.86;
              shoeMat.metalness = 0.08;
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

            // Cabelo livre nas costas sem interferência de touca
            if (mesh.name === 'avaturn_hair_0' && mesh.material) {
              const hairMat = mesh.material as THREE.MeshStandardMaterial;
              hairMat.color.setHex(0x2a1d15);
              hairMat.roughness = 0.75;
              hairMat.metalness = 0.05;
              hairMat.depthWrite = true;
              hairMat.alphaTest = 0.5;
              hairMat.needsUpdate = true;
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
   * Ajusta os ossos do modelo para a empunhadura Weaver com as duas mãos firmes na pistola
   * e executa a locomoção humana biomecânica natural nos membros inferiores.
   */
  private applyCombatAimPose(pitch: number, dirX: number = 0, dirZ: number = -1) {
    if (!this.isModelLoaded) return;

    // Restaura rotações e posições base dos ossos
    for (const b in this.bones) {
      if (this.initialBoneRotations[b]) {
        this.bones[b].rotation.copy(this.initialBoneRotations[b]);
      }
      if (this.initialBonePositions[b]) {
        this.bones[b].position.copy(this.initialBonePositions[b]);
      }
    }

    // 1. Inclinação do tronco acompanhando o pitch da mira (sem mover os pés!)
    const spine = this.bones['Spine'];
    const spine1 = this.bones['Spine1'];
    const spine2 = this.bones['Spine2'];
    const neck = this.bones['Neck'];
    const head = this.bones['Head'];

    // Respiração sutil no peito (Spine1) durante repouso
    const breath = Math.sin(this.idleBreathCycle) * 0.012 * (1.0 - this.walkWeight);

    if (spine) spine.rotation.x += -0.03 - pitch * 0.18;
    if (spine1) spine1.rotation.x += -0.03 - pitch * 0.18 + breath;
    if (spine2) spine2.rotation.x += -0.03 - pitch * 0.22;
    if (neck) neck.rotation.x += 0.02 - pitch * 0.12;
    if (head) head.rotation.x += 0.02 - pitch * 0.12;

    // 2. Sistema de Marcha Humana Biomecânica (Human Gait Cycle)
    const hips = this.bones['Hips'];
    const lUpLeg = this.bones['LeftUpLeg'];
    const rUpLeg = this.bones['RightUpLeg'];
    const lLeg = this.bones['LeftLeg'];
    const rLeg = this.bones['RightLeg'];
    const lFoot = this.bones['LeftFoot'];
    const rFoot = this.bones['RightFoot'];
    const lToe = this.bones['LeftToeBase'];
    const rToe = this.bones['RightToeBase'];

    // Postura base em repouso (Combat Idle Stance) com solas 100% paralelas ao chão:
    // No rig leon.glb, para manter a sola paralela ao solo (worldPitch = 0), footX = thighX - kneeX.
    const idleLThighX = -0.06;
    const idleRThighX = 0.06;
    const idleLKneeX = -0.10;
    const idleRKneeX = -0.10;
    const idleLThighZ = 0.035;
    const idleRThighZ = -0.035;

    // Componentes direcionais normalizados
    const fwdSign = dirZ <= 0 ? 1 : -1; // +1 ao avançar (W), -1 ao recuar (S)
    const fwdAmount = Math.abs(dirZ);
    const strafeAmount = Math.abs(dirX);
    const totalMove = Math.min(1.0, Math.hypot(dirX, dirZ));

    // Fases em oposição de 180° (PI) entre perna esquerda e direita
    const phaseL = this.walkCycle * fwdSign;
    const phaseR = phaseL + Math.PI;

    const sinL = Math.sin(phaseL);
    const cosL = Math.cos(phaseL);
    const sin2L = Math.sin(2 * phaseL);

    const sinR = Math.sin(phaseR);
    const cosR = Math.cos(phaseR);
    const sin2R = Math.sin(2 * phaseR);

    // Janela harmônica contínua C-infinito de 4ª ordem centrada na passagem sob o quadril (swing),
    // mantendo a perna de apoio (stance) firme no solo durante toda a fase de suporte (110°..250°)
    const uSwingL = 0.5 * (1.0 + Math.cos(phaseL - 0.10));
    const uSwingR = 0.5 * (1.0 + Math.cos(phaseR - 0.10));
    const lSwing = uSwingL * uSwingL * uSwingL * uSwingL;
    const rSwing = uSwingR * uSwingR * uSwingR * uSwingR;

    // Amortecimento localizado no início do apoio logo após o toque do calcanhar (~125°)
    const uCushionL = 0.5 * (1.0 + Math.cos(phaseL - 2.18));
    const uCushionR = 0.5 * (1.0 + Math.cos(phaseR - 2.18));
    const lStanceCushion = 0.05 * (uCushionL * uCushionL * uCushionL * uCushionL);
    const rStanceCushion = 0.05 * (uCushionR * uCushionR * uCushionR * uCushionR);

    // A. Coxas (UpLeg): Harmônicos suaves de marcha humana (passada equilibrada sem flutuar os pés)
    const lThighFwd = (-0.28 * sinL - 0.03 * cosL - 0.02 * sin2L) * fwdAmount;
    const rThighFwd = (-0.28 * sinR - 0.03 * cosR - 0.02 * sin2R) * fwdAmount;
    const lThighStrafeX = (-0.18 * lSwing - 0.06 * sinL) * strafeAmount;
    const rThighStrafeX = (-0.18 * rSwing - 0.06 * sinR) * strafeAmount;

    // B. Joelhos (Leg): Flexão natural de ~30° (0.52 rad) na passagem aérea + absorção sutil no apoio
    const lKneeBend = (0.52 * lSwing + lStanceCushion) * totalMove;
    const rKneeBend = (0.52 * rSwing + rStanceCushion) * totalMove;

    // C. Passada lateral (Strafe Z) suave e sem conflito em diagonais
    const lLatWave = 0.5 * (1.0 + Math.sin(phaseL + 0.35));
    const rLatWave = 0.5 * (1.0 + Math.sin(phaseR + 0.35));
    let lThighStrafeZ = 0;
    let rThighStrafeZ = 0;
    if (dirX < 0) {
      lThighStrafeZ = 0.18 * lLatWave * strafeAmount;
      rThighStrafeZ = 0.14 * rLatWave * strafeAmount;
    } else if (dirX > 0) {
      rThighStrafeZ = -0.18 * rLatWave * strafeAmount;
      lThighStrafeZ = -0.14 * lLatWave * strafeAmount;
    }

    // Interpolação entre repouso e caminhada ativa para coxa e joelho
    const activeLThighX = lThighFwd + lThighStrafeX;
    const activeRThighX = rThighFwd + rThighStrafeX;
    const activeLKneeX = -0.04 - lKneeBend;
    const activeRKneeX = -0.04 - rKneeBend;

    const targetLThighX = THREE.MathUtils.lerp(idleLThighX, activeLThighX, this.walkWeight);
    const targetRThighX = THREE.MathUtils.lerp(idleRThighX, activeRThighX, this.walkWeight);
    const targetLThighZ = THREE.MathUtils.lerp(idleLThighZ, idleLThighZ + lThighStrafeZ, this.walkWeight);
    const targetRThighZ = THREE.MathUtils.lerp(idleRThighZ, idleRThighZ + rThighStrafeZ, this.walkWeight);

    const targetLKneeX = THREE.MathUtils.lerp(idleLKneeX, activeLKneeX, this.walkWeight);
    const targetRKneeX = THREE.MathUtils.lerp(idleRKneeX, activeRKneeX, this.walkWeight);

    // D. Pés e Tornozelos (Foot & ToeBase):
    // Compensação cinemática exata (targetThighX - targetKneeX) mantém a sola 100% paralela ao chão no apoio,
    // somada à rolagem natural calcanhar-ponta (dorsiflexão suave no heel-strike e impulsão plantar no toe-off).
    const lSolePitch = (0.08 * Math.sin(phaseL - 0.35) - 0.05 * (1.0 - cosL) * (1.0 - lSwing)) * fwdAmount + 0.05 * lSwing * strafeAmount;
    const rSolePitch = (0.08 * Math.sin(phaseR - 0.35) - 0.05 * (1.0 - cosR) * (1.0 - rSwing)) * fwdAmount + 0.05 * rSwing * strafeAmount;

    const targetLFootX = (targetLThighX - targetLKneeX) + lSolePitch * this.walkWeight;
    const targetRFootX = (targetRThighX - targetRKneeX) + rSolePitch * this.walkWeight;
    const targetLFootZ = -targetLThighZ * 0.65;
    const targetRFootZ = -targetRThighZ * 0.65;

    // Dobramento natural da ponta do pé (ToeBase) na fase de impulsão traseira (toe-off)
    const lToeBend = 0.14 * (0.5 * (1.0 - sinL)) * (1.0 - lSwing) * this.walkWeight * totalMove;
    const rToeBend = 0.14 * (0.5 * (1.0 - sinR)) * (1.0 - rSwing) * this.walkWeight * totalMove;

    if (lUpLeg) {
      lUpLeg.rotation.x += targetLThighX;
      lUpLeg.rotation.z += targetLThighZ;
    }
    if (rUpLeg) {
      rUpLeg.rotation.x += targetRThighX;
      rUpLeg.rotation.z += targetRThighZ;
    }
    if (lLeg) {
      lLeg.rotation.x += targetLKneeX;
    }
    if (rLeg) {
      rLeg.rotation.x += targetRKneeX;
    }
    if (lFoot) {
      lFoot.rotation.x += targetLFootX;
      lFoot.rotation.z += targetLFootZ;
    }
    if (rFoot) {
      rFoot.rotation.x += targetRFootX;
      rFoot.rotation.z += targetRFootZ;
    }
    if (lToe) {
      lToe.rotation.x += lToeBend;
    }
    if (rToe) {
      rToe.rotation.x += rToeBend;
    }

    // E. Dinâmica Pélvica Humana (Hips) com assentamento plantar contínuo e Compensação Angular na Coluna
    const hipBob = (-0.005 + 0.008 * Math.cos(this.walkCycle * 2)) * this.walkWeight - 0.003 * (1.0 - this.walkWeight);
    const hipRollZ = Math.sin(this.walkCycle) * 0.024 * this.walkWeight;
    const hipYawY = -Math.sin(this.walkCycle) * 0.038 * this.walkWeight * fwdAmount;

    if (hips) {
      hips.position.y += hipBob;
      hips.rotation.z += hipRollZ;
      hips.rotation.y += hipYawY;
    }

    // Compensação puramente angular na Spine (mantém a cintura íntegra sem efeito sanfona e estabiliza a mira)
    if (spine) {
      spine.rotation.z -= hipRollZ;
      spine.rotation.y -= hipYawY;
    }

    // 3. Braço Direito: empunhadura tática segurando a pistola
    const rArm = this.bones['RightArm'];
    const rForeArm = this.bones['RightForeArm'];
    const rHand = this.bones['RightHand'];

    if (rArm) {
      rArm.rotation.x += 0.52 - pitch * 0.35;
      rArm.rotation.y -= 0.44;
      rArm.rotation.z -= 1.40;
    }
    if (rForeArm) {
      rForeArm.rotation.x += 0.15;
      rForeArm.rotation.z -= 0.45;
    }
    if (rHand) {
      rHand.rotation.x -= 0.10 - pitch * 0.15;
      rHand.rotation.y += 0.05;
      rHand.rotation.z += 0.15;
    }

    // 4. Braço Esquerdo: empunhadura Weaver dupla apoiando firmemente sob a mão direita
    const lArm = this.bones['LeftArm'];
    const lForeArm = this.bones['LeftForeArm'];
    const lHand = this.bones['LeftHand'];

    if (lArm) {
      lArm.rotation.x += 0.70 - pitch * 0.35;
      lArm.rotation.y += 0.55 + pitch * 0.14;
      lArm.rotation.z += 1.50;
    }
    if (lForeArm) {
      lForeArm.rotation.x += 0.0;
      lForeArm.rotation.z += 0.20 + pitch * 0.48;
    }
    if (lHand) {
      lHand.rotation.x -= 0.10 - pitch * 0.15;
      lHand.rotation.y += 0.25;
      lHand.rotation.z -= 0.20;
    }

    // 5. Fechamento anatômico real de todas as falanges e polegares ao redor da pistola
    // (No rig leon.glb, os dedos flexionam em X e as falanges distais do polegar flexionam em Z sobre o indicador)
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
   * Aciona a animação de recuo de disparo (Muzzle Kick & Slide Blowback)
   */
  public triggerRecoil() {
    this.recoilPitch = 0.09; // Elevação instantânea do cano
    this.recoilZ = 0.025;
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
   * Atualização frame a frame (movimentação WASD na baia, rotação e recuo)
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
    if (this.isMoving) {
      const localX = moveX / inputLen;
      const localZ = moveZ / inputLen;
      this.targetMoveDir.set(localX, localZ);
      // Suavização contínua do vetor de direção para transições orgânicas sem snap ao alternar teclas
      this.currentMoveDir.lerp(this.targetMoveDir, Math.min(1.0, 10 * delta));
      dirX = this.currentMoveDir.x;
      dirZ = this.currentMoveDir.y;
      this.lastMoveDir.copy(this.currentMoveDir);

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
    const strideFreq = 6.6; // Cadência humana natural de caminhada tática
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

    // 5. Aplica a cinemática esquelética (Mira superior Weaver + Locomoção direcional das pernas)
    this.applyCombatAimPose(this.currentPitch, dirX, dirZ);

    // 6. Recuperação suave do recuo da arma na mão
    this.recoilPitch = THREE.MathUtils.lerp(this.recoilPitch, 0, 18 * delta);
    this.recoilZ = THREE.MathUtils.lerp(this.recoilZ, 0, 18 * delta);

    if (this.isModelLoaded && this.bones['RightHand']) {
      // Posição firme na mão direita (sem deslocamento que solte a arma da palma)
      this.handgunMesh.position.set(0.012, 0.085, -0.015);
      this.handgunMesh.rotation.set(1.0638 + this.recoilPitch * 0.4, 0.5325, -1.9987, 'YXZ');
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
