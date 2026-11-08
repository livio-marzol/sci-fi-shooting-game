import * as THREE from 'three';

/**
 * AnimationController.ts - Sistema profissional de animação esquelética Three.js
 * Gerencia AnimationMixer, transições suaves (crossFadeTo 0.2s), sincronização
 * dinâmica de timeScale com a velocidade de locomoção e higienização/retargeting
 * universal de tracks de esqueleto (Avaturn / Mixamo).
 */
export class AnimationController {
  public mixer: THREE.AnimationMixer;
  public actions: { [name: string]: THREE.AnimationAction } = {};
  public currentActionName: string = 'idle';

  public standardWalkSpeed: number = 3.2; // Velocidade base padrão (m/s)
  public isMoving: boolean = false;
  public isAiming: boolean = true;

  private model: THREE.Object3D;
  private boneMap: { [name: string]: THREE.Bone } = {};

  constructor(model: THREE.Object3D) {
    this.model = model;
    this.mixer = new THREE.AnimationMixer(model);

    // Mapeia todos os ossos do modelo para validação rápida
    this.model.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        this.boneMap[child.name] = child as THREE.Bone;
      }
    });

    // Gera os clips de animação biomecânicos de alta qualidade (idle, walk, aim)
    this.createProceduralClips();

    // Inicia no estado 'idle'
    if (this.actions['idle']) {
      this.actions['idle'].play();
      this.currentActionName = 'idle';
    }
  }

  /**
   * Retorna os nomes de todos os ossos encontrados no modelo
   */
  public getBoneNames(): string[] {
    return Object.keys(this.boneMap);
  }

  /**
   * Higieniza e remapeia tracks de animação de clips externos (ex: Mixamo / Blender)
   * 1. Remove prefixos como 'mixamorig:', 'mixamorig', 'Armature|'.
   * 2. Remapeia nomes de ossos para baterem 100% com o esqueleto do Avaturn leon.glb.
   * 3. Trava o deslocamento X/Z no canal 'Hips.position' para garantir In-Place legítimo.
   * 4. Garante que tracks de pernas ('LeftUpLeg', 'LeftLeg', etc.) usem quaternions válidos.
   */
  public sanitizeAnimationTracks(clip: THREE.AnimationClip): THREE.AnimationClip {
    const sanitizedTracks: THREE.KeyframeTrack[] = [];
    const boneNames = new Set(Object.keys(this.boneMap));
    const prefixRegex = /^(?:mixamorig\d*[:_]?|Armature\||Character\|)/i;

    for (const track of clip.tracks) {
      const dotIdx = track.name.lastIndexOf('.');
      if (dotIdx === -1) continue;

      const rawNodeName = track.name.substring(0, dotIdx);
      const propName = track.name.substring(dotIdx); // ex: .quaternion ou .position

      // Remove prefixos conhecidos do Mixamo
      let cleanName = rawNodeName.replace(prefixRegex, '');

      // Correspondência case-insensitive se não encontrar direto
      if (!boneNames.has(cleanName)) {
        for (const bName of boneNames) {
          if (bName.toLowerCase() === cleanName.toLowerCase()) {
            cleanName = bName;
            break;
          }
        }
      }

      // Se o osso existe no modelo
      if (boneNames.has(cleanName)) {
        const newTrackName = `${cleanName}${propName}`;

        // Trava de Root Motion no canal Hips.position (X e Z travados, Y hip-bob preservado)
        if (cleanName === 'Hips' && propName === '.position') {
          const values = new Float32Array(track.values.length);
          const initX = track.values[0];
          const initZ = track.values[2];
          for (let i = 0; i < track.values.length; i += 3) {
            values[i] = initX;                     // X travado (in-place)
            values[i + 1] = track.values[i + 1];   // Y livre para oscilação natural da passada
            values[i + 2] = initZ;                 // Z travado (in-place)
          }

          const posTrack = new THREE.VectorKeyframeTrack(
            newTrackName,
            track.times,
            values,
            track.getInterpolation()
          );
          sanitizedTracks.push(posTrack);
        } else if (propName === '.quaternion') {
          // Garante que é uma QuaternionKeyframeTrack válida com interpolação SLERP
          const quatTrack = new THREE.QuaternionKeyframeTrack(
            newTrackName,
            track.times,
            track.values,
            THREE.InterpolateLinear // Three.js faz SLERP para quaternions lineares
          );
          sanitizedTracks.push(quatTrack);
        } else {
          const cloned = track.clone();
          cloned.name = newTrackName;
          sanitizedTracks.push(cloned);
        }
      }
    }

    return new THREE.AnimationClip(clip.name, clip.duration, sanitizedTracks);
  }

  /**
   * Adiciona e registra um AnimationClip higienizado no mixer
   */
  public addClip(clip: THREE.AnimationClip, customName?: string) {
    const sanitized = this.sanitizeAnimationTracks(clip);
    const clipName = customName || sanitized.name;
    sanitized.name = clipName;
    const action = this.mixer.clipAction(sanitized);
    action.setLoop(THREE.LoopRepeat, Infinity);
    this.actions[clipName] = action;
  }

  /**
   * Cria clips esqueléticos procedurais biomecânicos de alta qualidade (idle, walk, aim)
   * perfeitamente alinhados à hierarquia de ossos do modelo Avaturn leon.glb.
   */
  private createProceduralClips() {
    // 1. ANIMAÇÃO DE IDLE (Respiração orgânica no tórax + base atlética relaxada)
    const idleDuration = 3.0;
    const idleFPS = 30;
    const idleFrames = Math.round(idleDuration * idleFPS);
    const idleTimes: number[] = [];
    for (let f = 0; f <= idleFrames; f++) {
      idleTimes.push(f / idleFPS);
    }

    // Amostras de rotação da coluna para respiração
    const spineRotValues: number[] = [];
    const spine1RotValues: number[] = [];
    const hipsPosValues: number[] = [];

    const hipsBase = this.boneMap['Hips'] ? this.boneMap['Hips'].position : new THREE.Vector3(0, 0.90, 0.011);
    const spineBaseQ = this.boneMap['Spine'] ? this.boneMap['Spine'].quaternion.clone() : new THREE.Quaternion();
    const spine1BaseQ = this.boneMap['Spine1'] ? this.boneMap['Spine1'].quaternion.clone() : new THREE.Quaternion();

    for (let f = 0; f <= idleFrames; f++) {
      const t = f / idleFrames;
      const breathPhase = t * Math.PI * 2;
      const breathAmount = Math.sin(breathPhase) * 0.016;

      // Hips: micro oscilação vertical da respiração
      hipsPosValues.push(hipsBase.x, hipsBase.y + Math.sin(breathPhase) * 0.003, hipsBase.z);

      // Spine & Spine1: expansão e retração torácica
      const qSpine = spineBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), breathAmount * 0.4)
      );
      spineRotValues.push(qSpine.x, qSpine.y, qSpine.z, qSpine.w);

      const qSpine1 = spine1BaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), breathAmount * 0.6)
      );
      spine1RotValues.push(qSpine1.x, qSpine1.y, qSpine1.z, qSpine1.w);
    }

    const idleTracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('Hips.position', idleTimes, hipsPosValues),
      new THREE.QuaternionKeyframeTrack('Spine.quaternion', idleTimes, spineRotValues),
      new THREE.QuaternionKeyframeTrack('Spine1.quaternion', idleTimes, spine1RotValues),
    ];

    const idleClip = new THREE.AnimationClip('idle', idleDuration, idleTracks);
    this.actions['idle'] = this.mixer.clipAction(idleClip);
    this.actions['idle'].setLoop(THREE.LoopRepeat, Infinity);

    // 2. ANIMAÇÃO DE WALK (Caminhada Tática Biomecânica Humana In-Place)
    // Sincronizada com cadência realista de passos e flexão anatômica dos joelhos
    const walkDuration = 0.92; // Duração de um ciclo completo (2 passos)
    const walkFPS = 30;
    const walkFrames = Math.round(walkDuration * walkFPS);
    const walkTimes: number[] = [];
    for (let f = 0; f <= walkFrames; f++) {
      walkTimes.push(f / walkFPS);
    }

    const hipsWalkPosValues: number[] = [];
    const hipsWalkRotValues: number[] = [];
    const lUpLegRotValues: number[] = [];
    const rUpLegRotValues: number[] = [];
    const lLegRotValues: number[] = [];
    const rLegRotValues: number[] = [];
    const lFootRotValues: number[] = [];
    const rFootRotValues: number[] = [];

    const hipsBaseQ = this.boneMap['Hips'] ? this.boneMap['Hips'].quaternion.clone() : new THREE.Quaternion();
    const lUpLegBaseQ = this.boneMap['LeftUpLeg'] ? this.boneMap['LeftUpLeg'].quaternion.clone() : new THREE.Quaternion();
    const rUpLegBaseQ = this.boneMap['RightUpLeg'] ? this.boneMap['RightUpLeg'].quaternion.clone() : new THREE.Quaternion();
    const lLegBaseQ = this.boneMap['LeftLeg'] ? this.boneMap['LeftLeg'].quaternion.clone() : new THREE.Quaternion();
    const rLegBaseQ = this.boneMap['RightLeg'] ? this.boneMap['RightLeg'].quaternion.clone() : new THREE.Quaternion();
    const lFootBaseQ = this.boneMap['LeftFoot'] ? this.boneMap['LeftFoot'].quaternion.clone() : new THREE.Quaternion();
    const rFootBaseQ = this.boneMap['RightFoot'] ? this.boneMap['RightFoot'].quaternion.clone() : new THREE.Quaternion();

    for (let f = 0; f <= walkFrames; f++) {
      const u = f / walkFrames;
      const phaseL = u * Math.PI * 2;
      const phaseR = phaseL + Math.PI;

      // A. Hips: Canal X/Z 100% travado (In-Place), apenas oscilação Y (bob 2x por ciclo) e inclinação pélvica
      const hipBob = -Math.cos(u * Math.PI * 4) * 0.014;
      hipsWalkPosValues.push(hipsBase.x, hipsBase.y + hipBob, hipsBase.z);

      const hipRoll = Math.sin(phaseL) * 0.024; // Inclinação pélvica lateral (pelvic list)
      const hipYaw = -Math.sin(phaseL) * 0.038; // Rotação do quadril na direção da perna que avança
      const qHips = hipsBaseQ.clone().multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hipYaw, hipRoll, 'YXZ'))
      );
      hipsWalkRotValues.push(qHips.x, qHips.y, qHips.z, qHips.w);

      // B. Pernas (Gait Cycle Biomecânico):
      // Perna Esquerda (L):
      const sinL = Math.sin(phaseL);
      const cosL = Math.cos(phaseL);
      // Janela suave de balanço aéreo (swing)
      const uSwingL = 0.5 * (1.0 + Math.cos(phaseL - 0.20));
      const swingL = uSwingL * uSwingL * uSwingL;

      // Flexão/extensão da coxa (Thigh forward/backward)
      const thighAngleL = -0.38 * sinL - 0.04 * cosL;
      // No rig Avaturn, a rotação local de LeftUpLeg possui Z invertido (180 graus).
      // Uma rotação no eixo X local orienta o membro anteroposteriormente
      const qLUp = lUpLegBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), thighAngleL)
      );
      lUpLegRotValues.push(qLUp.x, qLUp.y, qLUp.z, qLUp.w);

      // Flexão do Joelho (Knee Bend):
      // O joelho dobra PARA TRÁS suavemente durante a fase de balanço (~48 graus = ~0.84 rad)
      // e estende na fase de apoio com leve amortecimento (~5 graus = 0.08 rad)
      const kneeBendL = 0.84 * swingL + 0.08 * Math.max(0, -sinL);
      // No rig Avaturn, o joelho dobra para trás com rotação positiva em torno do eixo X local
      const qLLeg = lLegBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeBendL)
      );
      lLegRotValues.push(qLLeg.x, qLLeg.y, qLLeg.z, qLLeg.w);

      // Pé Esquerdo (Ankle / Foot dorsiflexion & plantarflexion):
      const footPitchL = 0.16 * Math.sin(phaseL - 0.40) - kneeBendL * 0.35;
      const qLFoot = lFootBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), footPitchL)
      );
      lFootRotValues.push(qLFoot.x, qLFoot.y, qLFoot.z, qLFoot.w);

      // Perna Direita (R) - Em oposição exata de fase (180 graus):
      const sinR = Math.sin(phaseR);
      const cosR = Math.cos(phaseR);
      const uSwingR = 0.5 * (1.0 + Math.cos(phaseR - 0.20));
      const swingR = uSwingR * uSwingR * uSwingR;

      const thighAngleR = -0.38 * sinR - 0.04 * cosR;
      const qRUp = rUpLegBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), thighAngleR)
      );
      rUpLegRotValues.push(qRUp.x, qRUp.y, qRUp.z, qRUp.w);

      const kneeBendR = 0.84 * swingR + 0.08 * Math.max(0, -sinR);
      const qRLeg = rLegBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), kneeBendR)
      );
      rLegRotValues.push(qRLeg.x, qRLeg.y, qRLeg.z, qRLeg.w);

      const footPitchR = 0.16 * Math.sin(phaseR - 0.40) - kneeBendR * 0.35;
      const qRFoot = rFootBaseQ.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), footPitchR)
      );
      rFootRotValues.push(qRFoot.x, qRFoot.y, qRFoot.z, qRFoot.w);
    }

    const walkTracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('Hips.position', walkTimes, hipsWalkPosValues),
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', walkTimes, hipsWalkRotValues),
      new THREE.QuaternionKeyframeTrack('LeftUpLeg.quaternion', walkTimes, lUpLegRotValues),
      new THREE.QuaternionKeyframeTrack('RightUpLeg.quaternion', walkTimes, rUpLegRotValues),
      new THREE.QuaternionKeyframeTrack('LeftLeg.quaternion', walkTimes, lLegRotValues),
      new THREE.QuaternionKeyframeTrack('RightLeg.quaternion', walkTimes, rLegRotValues),
      new THREE.QuaternionKeyframeTrack('LeftFoot.quaternion', walkTimes, lFootRotValues),
      new THREE.QuaternionKeyframeTrack('RightFoot.quaternion', walkTimes, rFootRotValues),
    ];

    const walkClip = new THREE.AnimationClip('walk', walkDuration, walkTracks);
    this.actions['walk'] = this.mixer.clipAction(walkClip);
    this.actions['walk'].setLoop(THREE.LoopRepeat, Infinity);

    // 3. ANIMAÇÃO DE AIM (Postura Weaver de Tiro Tático Isosceles / Estável)
    const aimDuration = 2.0;
    const aimTimes = [0, 1.0, 2.0];
    const aimTracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('Hips.position', aimTimes, [
        hipsBase.x, hipsBase.y, hipsBase.z,
        hipsBase.x, hipsBase.y - 0.002, hipsBase.z,
        hipsBase.x, hipsBase.y, hipsBase.z
      ]),
      new THREE.QuaternionKeyframeTrack('Hips.quaternion', aimTimes, [
        hipsBaseQ.x, hipsBaseQ.y, hipsBaseQ.z, hipsBaseQ.w,
        hipsBaseQ.x, hipsBaseQ.y, hipsBaseQ.z, hipsBaseQ.w,
        hipsBaseQ.x, hipsBaseQ.y, hipsBaseQ.z, hipsBaseQ.w
      ]),
      new THREE.QuaternionKeyframeTrack('LeftUpLeg.quaternion', aimTimes, [
        lUpLegBaseQ.x, lUpLegBaseQ.y, lUpLegBaseQ.z, lUpLegBaseQ.w,
        lUpLegBaseQ.x, lUpLegBaseQ.y, lUpLegBaseQ.z, lUpLegBaseQ.w,
        lUpLegBaseQ.x, lUpLegBaseQ.y, lUpLegBaseQ.z, lUpLegBaseQ.w
      ]),
      new THREE.QuaternionKeyframeTrack('RightUpLeg.quaternion', aimTimes, [
        rUpLegBaseQ.x, rUpLegBaseQ.y, rUpLegBaseQ.z, rUpLegBaseQ.w,
        rUpLegBaseQ.x, rUpLegBaseQ.y, rUpLegBaseQ.z, rUpLegBaseQ.w,
        rUpLegBaseQ.x, rUpLegBaseQ.y, rUpLegBaseQ.z, rUpLegBaseQ.w
      ]),
      new THREE.QuaternionKeyframeTrack('LeftLeg.quaternion', aimTimes, [
        lLegBaseQ.x, lLegBaseQ.y, lLegBaseQ.z, lLegBaseQ.w,
        lLegBaseQ.x, lLegBaseQ.y, lLegBaseQ.z, lLegBaseQ.w,
        lLegBaseQ.x, lLegBaseQ.y, lLegBaseQ.z, lLegBaseQ.w
      ]),
      new THREE.QuaternionKeyframeTrack('RightLeg.quaternion', aimTimes, [
        rLegBaseQ.x, rLegBaseQ.y, rLegBaseQ.z, rLegBaseQ.w,
        rLegBaseQ.x, rLegBaseQ.y, rLegBaseQ.z, rLegBaseQ.w,
        rLegBaseQ.x, rLegBaseQ.y, rLegBaseQ.z, rLegBaseQ.w
      ])
    ];

    const aimClip = new THREE.AnimationClip('aim', aimDuration, aimTracks);
    this.actions['aim'] = this.mixer.clipAction(aimClip);
    this.actions['aim'].setLoop(THREE.LoopRepeat, Infinity);
  }

  /**
   * Transição suave com crossFadeTo de 0.2s entre ações para eliminar estalos
   */
  public transitionTo(targetActionName: string, duration: number = 0.2) {
    if (this.currentActionName === targetActionName) return;

    const currentAction = this.actions[this.currentActionName];
    const targetAction = this.actions[targetActionName];

    if (!targetAction) return;

    targetAction.enabled = true;
    targetAction.setEffectiveTimeScale(1);
    targetAction.setEffectiveWeight(1);
    targetAction.time = 0;

    if (currentAction) {
      currentAction.crossFadeTo(targetAction, duration, true);
    } else {
      targetAction.play();
    }

    targetAction.play();
    this.currentActionName = targetActionName;
  }

  /**
   * Sincroniza o estado de locomoção e ajusta o timeScale do mixer
   * para eliminar patinação no piso (velocidade atual / velocidade padrão)
   */
  public setLocomotionState(isMoving: boolean, currentSpeed: number) {
    this.isMoving = isMoving;

    // Transição de estado baseada no movimento
    const targetState = isMoving ? 'walk' : 'idle';
    if (this.currentActionName !== targetState) {
      this.transitionTo(targetState, 0.2);
    }

    // Sincroniza o timeScale do walkAction com a velocidade real de deslocamento
    const walkAction = this.actions['walk'];
    if (walkAction && isMoving) {
      const speedRatio = Math.max(0.2, currentSpeed / this.standardWalkSpeed);
      walkAction.timeScale = speedRatio;
    }
  }

  /**
   * Atualização frame a frame do AnimationMixer
   */
  public update(delta: number) {
    this.mixer.update(delta);
  }
}
