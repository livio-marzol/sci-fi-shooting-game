import * as THREE from 'three';

/**
 * Environment.ts - Constrói o estande de tiro profissional (Shooting Range) moderno e claro.
 * Iluminação cinematográfica balanceada, bancada tática, baias amplas,
 * trilhos de LED no teto, refletores focados nos alvos e materiais realistas de estande.
 */
export class Environment {
  public scene: THREE.Scene;
  public colliders: THREE.Object3D[] = [];
  private animatedMaterials: THREE.Material[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildShootingRange();
  }

  private buildShootingRange() {
    // ==========================================
    // 1. MATERIAIS REALISTAS DE ESTANDE DE TIRO
    // ==========================================
    // Piso de concreto industrial/borracha vulcanizada com leve reflexo
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x272e3b,
      roughness: 0.45,
      metalness: 0.3
    });

    // Painéis acústicos das paredes (cinza arquitetônico com amortecimento sonoro)
    const wallAcousticMat = new THREE.MeshStandardMaterial({
      color: 0x424c5c,
      roughness: 0.65,
      metalness: 0.2
    });

    const wallDarkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      roughness: 0.5,
      metalness: 0.6
    });

    // Teto modular com perfil acústico
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: 0x333d4d,
      roughness: 0.7,
      metalness: 0.25
    });

    // Bancada de tiro (Aço escovado e tampo emborrachado)
    const counterTopMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.3,
      metalness: 0.85
    });

    const counterBaseMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      roughness: 0.5,
      metalness: 0.5
    });

    // Vidro balístico das divisórias laterais
    const ballisticGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88b0d0,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.8,
      ior: 1.52
    });

    // Materiais luminosos das luminárias LED de teto (luz de estande diurna 5000K)
    const ledFixtureMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xf8fafc,
      emissiveIntensity: 2.2,
      roughness: 0.1
    });

    // Faixas de segurança amarelas/hazard
    const safetyYellowMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.4,
      metalness: 0.2
    });

    // ==========================================
    // 2. ESTRUTURA DO AMBIENTE (SALA AMPLA)
    // ==========================================
    // Dimensões: Largura 14m, Altura 5.0m, Comprimento de z=+7.5m até z=-38m
    const rangeLength = 46;
    const centerZ = -15.5;

    // A. Piso Principal
    const floorGeo = new THREE.PlaneGeometry(14, rangeLength);
    const floor = new THREE.Mesh(floorGeo, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, centerZ);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Linha de tiro vermelha/amarela no chão logo antes do balcão (z = 0.95)
    const firingLineGeo = new THREE.PlaneGeometry(14, 0.25);
    const firingLineMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.3
    });
    const firingLine = new THREE.Mesh(firingLineGeo, firingLineMat);
    firingLine.rotation.x = -Math.PI / 2;
    firingLine.position.set(0, 0.015, 0.95);
    this.scene.add(firingLine);

    // Faixas de marcação lateral da pista de tiro
    const laneBorderGeo = new THREE.PlaneGeometry(0.12, rangeLength);
    const laneBorderL = new THREE.Mesh(laneBorderGeo, safetyYellowMat);
    laneBorderL.rotation.x = -Math.PI / 2;
    laneBorderL.position.set(-3.2, 0.012, centerZ);
    this.scene.add(laneBorderL);

    const laneBorderR = new THREE.Mesh(laneBorderGeo, safetyYellowMat);
    laneBorderR.rotation.x = -Math.PI / 2;
    laneBorderR.position.set(3.2, 0.012, centerZ);
    this.scene.add(laneBorderR);

    // B. Teto com vigas industriais
    const ceilingGeo = new THREE.PlaneGeometry(14, rangeLength);
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 5.0, centerZ);
    this.scene.add(ceiling);

    // C. Paredes Laterais (Esquerda e Direita)
    const wallGeo = new THREE.PlaneGeometry(rangeLength, 5.0);

    const leftWall = new THREE.Mesh(wallGeo, wallAcousticMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-7.0, 2.5, centerZ);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, wallAcousticMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(7.0, 2.5, centerZ);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    // Rodapé reforçado nas paredes
    const baseboardGeo = new THREE.BoxGeometry(0.2, 0.4, rangeLength);
    const baseboardL = new THREE.Mesh(baseboardGeo, wallDarkTrimMat);
    baseboardL.position.set(-6.9, 0.2, centerZ);
    this.scene.add(baseboardL);

    const baseboardR = new THREE.Mesh(baseboardGeo, wallDarkTrimMat);
    baseboardR.position.set(6.9, 0.2, centerZ);
    this.scene.add(baseboardR);

    // D. Parede Traseira do Estande (Recuada em z = +7.5m - BEM longe da câmera)
    const backWallGroup = new THREE.Group();
    const backWallGeo = new THREE.BoxGeometry(14, 5.0, 0.4);
    const backWall = new THREE.Mesh(backWallGeo, wallAcousticMat);
    backWall.position.set(0, 2.5, 7.5);
    backWall.receiveShadow = true;
    backWallGroup.add(backWall);

    // Porta tática de acesso na parede traseira (planos Z claramente separados para zero Z-fighting)
    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.8, 0.06), wallDarkTrimMat);
    doorFrame.position.set(0, 1.402, 7.27); // Face frontal em z = 7.24, base 2mm acima do piso
    doorFrame.castShadow = false;
    doorFrame.receiveShadow = false;
    backWallGroup.add(doorFrame);

    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 0.04), counterBaseMat);
    doorPanel.position.set(0, 1.302, 7.21); // Face frontal em z = 7.19 (5cm à frente da moldura)
    doorPanel.castShadow = false;
    doorPanel.receiveShadow = false;
    backWallGroup.add(doorPanel);

    const doorHandle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), counterTopMat);
    doorHandle.position.set(0.52, 1.30, 7.17);
    doorHandle.castShadow = false;
    doorHandle.receiveShadow = false;
    backWallGroup.add(doorHandle);

    // Placa de segurança no fundo
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.6, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3 })
    );
    signBoard.position.set(0, 3.4, 7.24);
    backWallGroup.add(signBoard);

    this.scene.add(backWallGroup);
    this.colliders.push(backWall);

    // E. Parede do Fundo do Stand (Para-balas / Bullet Trap em z = -38m)
    const trapGroup = new THREE.Group();
    const trapGeo = new THREE.BoxGeometry(14, 5.0, 1.5);
    const trapMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.8,
      metalness: 0.4
    });
    const trap = new THREE.Mesh(trapGeo, trapMat);
    trap.position.set(0, 2.5, -38);
    trapGroup.add(trap);

    // Painel absorvedor de impacto com iluminação indireta
    const absorbPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 4.0),
      new THREE.MeshStandardMaterial({
        color: 0x064e3b,
        emissive: 0x059669,
        emissiveIntensity: 0.45,
        roughness: 0.5
      })
    );
    absorbPanel.position.set(0, 2.5, -37.2);
    trapGroup.add(absorbPanel);
    this.animatedMaterials.push(absorbPanel.material as THREE.Material);

    this.scene.add(trapGroup);

    // ==========================================
    // 3. A BANCADA DE TIRO DO ATIRADOR (SHOOTING BENCH)
    // ==========================================
    // Posição: z = 0.95m, altura 1.02m (perfeita para apoiar/mirar sobre o balcão)
    const benchGroup = new THREE.Group();

    // Tampo da bancada com acabamento industrial
    const benchTop = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.12, 0.85),
      counterTopMat
    );
    benchTop.position.set(0, 1.02, 0.95);
    benchTop.castShadow = true;
    benchTop.receiveShadow = true;
    benchGroup.add(benchTop);

    // Painel frontal blindado da bancada
    const benchBase = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.96, 0.65),
      counterBaseMat
    );
    benchBase.position.set(0, 0.48, 0.95);
    benchBase.castShadow = true;
    benchBase.receiveShadow = true;
    benchGroup.add(benchBase);

    // Tapete de borracha anti-impacto sobre a bancada
    const rubberMat = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.02, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 })
    );
    rubberMat.position.set(0, 1.09, 0.95);
    benchGroup.add(rubberMat);

    // Props sobre a bancada: Caixa de munição 9mm tática
    const ammoBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.12, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.4, metalness: 0.7 })
    );
    ammoBox.position.set(-0.95, 1.15, 0.9);
    ammoBox.rotation.y = 0.25;
    ammoBox.castShadow = true;
    benchGroup.add(ammoBox);

    // Abafador de ruído tático (headset) apoiado no balcão
    const earmuffGroup = new THREE.Group();
    earmuffGroup.position.set(-0.6, 1.12, 1.0);
    const earmuffL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3 })
    );
    earmuffL.rotation.z = Math.PI / 2;
    earmuffGroup.add(earmuffL);
    const earmuffR = earmuffL.clone();
    earmuffR.position.set(0.12, 0, 0);
    earmuffGroup.add(earmuffR);
    const headband = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.012, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })
    );
    headband.position.set(0.06, 0.04, 0);
    earmuffGroup.add(headband);
    benchGroup.add(earmuffGroup);

    // Terminal de controle de pista (Monitor digital na bancada)
    const terminalScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.32, 0.03),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: 0x0284c7,
        emissiveIntensity: 1.4,
        roughness: 0.1
      })
    );
    terminalScreen.position.set(1.15, 1.25, 0.88);
    terminalScreen.rotation.x = -0.32;
    terminalScreen.rotation.y = -0.18;
    benchGroup.add(terminalScreen);

    // Divisórias laterais da baia (Vidro balístico espaçado a 2.6m para visão ampla)
    const partitionL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 2.8), ballisticGlassMat);
    partitionL.position.set(-2.6, 1.2, 2.1);
    benchGroup.add(partitionL);
    this.colliders.push(partitionL);

    const partitionR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 2.8), ballisticGlassMat);
    partitionR.position.set(2.6, 1.2, 2.1);
    benchGroup.add(partitionR);
    this.colliders.push(partitionR);

    // Molduras de aço das divisórias
    const frameL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), counterBaseMat);
    frameL.position.set(-2.6, 1.15, 0.7);
    benchGroup.add(frameL);
    const frameR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.3, 0.1), counterBaseMat);
    frameR.position.set(2.6, 1.15, 0.7);
    benchGroup.add(frameR);

    this.scene.add(benchGroup);
    this.colliders.push(benchTop, partitionL, partitionR);

    // ==========================================
    // 4. MARCADORES DE DISTÂNCIA E ARCOS ESTRUTURAIS
    // ==========================================
    const distances = [5, 10, 15, 20, 25, 30, 35];
    distances.forEach((dist) => {
      const zPos = -dist;
      const archGroup = new THREE.Group();

      // Trave superior metálica
      const beam = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.25, 0.3), counterBaseMat);
      beam.position.set(0, 4.85, zPos);
      archGroup.add(beam);

      // Faixa no chão indicando metros com alto contraste
      const floorLine = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.18), safetyYellowMat);
      floorLine.rotation.x = -Math.PI / 2;
      floorLine.position.set(0, 0.018, zPos);
      archGroup.add(floorLine);

      // Placa iluminada suspensa com a metragem ("10M", "20M", etc)
      const signMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0284c7,
        emissiveIntensity: 1.2,
        roughness: 0.2
      });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 0.05), signMat);
      sign.position.set(dist % 2 === 0 ? 4.2 : -4.2, 4.2, zPos);
      archGroup.add(sign);

      this.scene.add(archGroup);
    });

    // ==========================================
    // 5. ILUMINAÇÃO PROFISSIONAL E CLARA DO ESTANDE
    // ==========================================
    // A. Luz Hemisférica (Rebate de luz ambiente natural do teto e chão - elimina breu)
    const hemiLight = new THREE.HemisphereLight(0xf1f5f9, 0x475569, 1.4);
    hemiLight.position.set(0, 10, 0);
    this.scene.add(hemiLight);

    // B. Luz Direcional Principal (Única fonte de sombra realista no piso do estande)
    const mainDirLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainDirLight.position.set(1.2, 9.5, 2.2);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 2048;
    mainDirLight.shadow.mapSize.height = 2048;
    mainDirLight.shadow.radius = 2;
    mainDirLight.shadow.camera.near = 0.5;
    mainDirLight.shadow.camera.far = 45;
    mainDirLight.shadow.camera.left = -8;
    mainDirLight.shadow.camera.right = 8;
    mainDirLight.shadow.camera.top = 8;
    mainDirLight.shadow.camera.bottom = -8;
    mainDirLight.shadow.bias = -0.0005;
    mainDirLight.shadow.normalBias = 0.02;
    this.scene.add(mainDirLight);

    // C. Holofote Focado na Baia do Jogador (Iluminação de destaque sem duplicar sombra no chão)
    const boothSpot = new THREE.SpotLight(0xfffbeb, 3.8, 12, Math.PI / 3.2, 0.45, 1.2);
    boothSpot.position.set(0, 4.8, 2.0);
    boothSpot.target.position.set(0, 1.0, 1.0);
    boothSpot.castShadow = false;
    this.scene.add(boothSpot);
    this.scene.add(boothSpot.target);

    // D. Luminárias LED Longas no Teto (Distribuídas ao longo de todo o comprimento)
    const ledPositionsZ = [+3.0, 0.0, -7.0, -14.0, -21.0, -28.0, -34.0];
    ledPositionsZ.forEach((zPos) => {
      // Calha física iluminada no teto
      const fixtureMesh = new THREE.Mesh(
        new THREE.BoxGeometry(7.0, 0.1, 0.4),
        ledFixtureMat
      );
      fixtureMesh.position.set(0, 4.95, zPos);
      this.scene.add(fixtureMesh);

      // Ponto de luz amplo para iluminar o chão e paredes uniformemente
      const stripLight = new THREE.PointLight(0xffffff, 2.2, 16, 1.2);
      stripLight.position.set(0, 4.6, zPos);
      this.scene.add(stripLight);
    });

    // E. Refletores Específicos para a Linha de Alvos (Target Floodlights)
    const targetSpot1 = new THREE.SpotLight(0xdbeafe, 3.2, 22, Math.PI / 4, 0.35, 1.0);
    targetSpot1.position.set(-2, 4.6, -6);
    targetSpot1.target.position.set(-1.5, 2.0, -10);
    this.scene.add(targetSpot1);
    this.scene.add(targetSpot1.target);

    const targetSpot2 = new THREE.SpotLight(0xdbeafe, 3.2, 25, Math.PI / 4, 0.35, 1.0);
    targetSpot2.position.set(2, 4.6, -16);
    targetSpot2.target.position.set(0, 2.2, -22);
    this.scene.add(targetSpot2);
    this.scene.add(targetSpot2.target);

    const targetSpot3 = new THREE.SpotLight(0xdbeafe, 3.5, 25, Math.PI / 4, 0.35, 1.0);
    targetSpot3.position.set(0, 4.6, -26);
    targetSpot3.target.position.set(0, 2.4, -34);
    this.scene.add(targetSpot3);
    this.scene.add(targetSpot3.target);

    // F. Luz de Preenchimento Suave (Warm Fill)
    const warmFill = new THREE.PointLight(0xfef3c7, 1.5, 8);
    warmFill.position.set(-1.8, 2.4, 3.0);
    this.scene.add(warmFill);
  }

  public update(time: number) {
    // Pulso sutil no fundo do para-balas
    const pulse = Math.sin(time * 2.5) * 0.15 + 0.45;
    this.animatedMaterials.forEach((mat) => {
      if ('emissiveIntensity' in mat) {
        (mat as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
      }
    });
  }
}
