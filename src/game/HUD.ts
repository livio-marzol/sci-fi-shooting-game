import { ScoreData } from './ScoreSystem';
import { AudioSystem } from './AudioSystem';

/**
 * HUD.ts - Gerencia os elementos gráficos sobrepostos em tempo real:
 * Retículo dinâmico, hitmarkers, barras de munição, pontuação e telas de pausa.
 */
export class HUD {
  private container: HTMLElement;
  private audioSystem: AudioSystem;

  // Elementos HTML
  private crosshairElem!: HTMLElement;
  private hitmarkerElem!: HTMLElement;
  private ammoCountElem!: HTMLElement;
  private ammoBarsElem!: HTMLElement;
  private reloadPromptElem!: HTMLElement;
  private scoreElem!: HTMLElement;
  private streakBadgeElem!: HTMLElement;
  private accuracyElem!: HTMLElement;
  private pauseOverlayElem!: HTMLElement;
  private popupContainerElem!: HTMLElement;

  constructor(container: HTMLElement, audioSystem: AudioSystem) {
    this.container = container;
    this.audioSystem = audioSystem;
    this.buildHUDStructure();
  }

  private buildHUDStructure() {
    this.container.innerHTML = `
      <!-- RETÍCULO CENTRAL TÁTICO ESTILO SCI-FI / RE4 -->
      <div id="crosshair-wrapper" class="crosshair-container">
        <div class="reticle-dot"></div>
        <div class="reticle-bracket top"></div>
        <div class="reticle-bracket bottom"></div>
        <div class="reticle-bracket left"></div>
        <div class="reticle-bracket right"></div>
        <div id="hitmarker" class="hitmarker-hidden">✕</div>
      </div>

      <!-- POPUPS DE PONTUAÇÃO FLUTUANTE -->
      <div id="popup-container" class="popup-container"></div>

      <!-- PAINEL SUPERIOR: PONTUAÇÃO E COMBO -->
      <header class="hud-top-bar">
        <div class="hud-panel stat-box">
          <span class="hud-label">PONTUAÇÃO</span>
          <span id="hud-score" class="hud-value score-glow">00000</span>
        </div>

        <div class="hud-panel stat-box">
          <span class="hud-label">COMBO MULTIPLIER</span>
          <span id="hud-streak" class="hud-value combo-badge">1.0x</span>
        </div>

        <div class="hud-panel stat-box">
          <span class="hud-label">PRECISÃO</span>
          <span id="hud-accuracy" class="hud-value">100%</span>
        </div>
      </header>

      <!-- PAINEL INFERIOR DIREITO: MUNIÇÃO DE PLASMA -->
      <footer class="hud-bottom-bar">
        <div class="ammo-display-panel">
          <div class="ammo-header">
            <span class="ammo-label">CÉLULA DE ENERGIA</span>
            <span id="ammo-numeric" class="ammo-digits">12 / 12</span>
          </div>
          <div id="ammo-bars" class="ammo-bar-track"></div>
          <div id="reload-prompt" class="reload-prompt-hidden">
            <span class="pulse-text">PRESSIONE [R] PARA RECARREGAR</span>
          </div>
        </div>
      </footer>

      <!-- TELA INICIAL / PAUSA / CONTROLES -->
      <div id="pause-overlay" class="pause-screen">
        <div class="pause-card">
          <div class="sci-fi-decor-line"></div>
          <h1 class="pause-title">STAND DE TIRO SCI-FI</h1>
          <p class="pause-subtitle">SIMULAÇÃO BALÍSTICA HOLOGRÁFICA EM TERCEIRA PESSOA</p>

          <div class="controls-guide">
            <div class="control-row">
              <span class="key-badge">W A S D</span>
              <span class="action-desc">Movimentação tática na baia</span>
            </div>
            <div class="control-row">
              <span class="key-badge">MOUSE</span>
              <span class="action-desc">Controle da mira (Pitch / Yaw)</span>
            </div>
            <div class="control-row">
              <span class="key-badge">CLIQUE ESQUERDO</span>
              <span class="action-desc">Disparar arma de plasma (Hitscan)</span>
            </div>
            <div class="control-row">
              <span class="key-badge">CLIQUE DIREITO</span>
              <span class="action-desc">Aproximar mira sobre o ombro (ADS)</span>
            </div>
            <div class="control-row">
              <span class="key-badge">TECLA R</span>
              <span class="action-desc">Recarregar célula de energia</span>
            </div>
            <div class="control-row">
              <span class="key-badge">ESC</span>
              <span class="action-desc">Liberar cursor / Pausar</span>
            </div>
          </div>

          <div class="start-action-container">
            <button id="btn-start" class="start-btn">
              CLIQUE PARA ENTRAR NA MIRA
            </button>
            <button id="btn-audio-toggle" class="audio-btn">
              🔊 Áudio Ativo
            </button>
          </div>
          <div class="sci-fi-decor-line"></div>
        </div>
      </div>
    `;

    // Captura os elementos
    this.crosshairElem = document.getElementById('crosshair-wrapper')!;
    this.hitmarkerElem = document.getElementById('hitmarker')!;
    this.ammoCountElem = document.getElementById('ammo-numeric')!;
    this.ammoBarsElem = document.getElementById('ammo-bars')!;
    this.reloadPromptElem = document.getElementById('reload-prompt')!;
    this.scoreElem = document.getElementById('hud-score')!;
    this.streakBadgeElem = document.getElementById('hud-streak')!;
    this.accuracyElem = document.getElementById('hud-accuracy')!;
    this.pauseOverlayElem = document.getElementById('pause-overlay')!;
    this.popupContainerElem = document.getElementById('popup-container')!;

    // Inicializa barras de munição
    this.renderAmmoBars(12, 12, false);

    // Botão de Áudio
    const audioBtn = document.getElementById('btn-audio-toggle');
    if (audioBtn) {
      audioBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMuted = this.audioSystem.toggleMute();
        audioBtn.textContent = isMuted ? '🔇 Áudio Desligado' : '🔊 Áudio Ativo';
      });
    }
  }

  /**
   * Atualiza as barras gráficas e contagem de munição
   */
  public renderAmmoBars(ammo: number, maxAmmo: number, reloading: boolean) {
    if (reloading) {
      this.ammoCountElem.textContent = 'CARREGANDO...';
      this.reloadPromptElem.className = 'reload-prompt-active';
      this.reloadPromptElem.innerHTML = '<span class="pulse-text spin-glow">⚡ RECARREGANDO CAPACITOR...</span>';
    } else {
      this.ammoCountElem.textContent = `${ammo} / ${maxAmmo}`;
      if (ammo <= 3) {
        this.reloadPromptElem.className = 'reload-prompt-active';
        this.reloadPromptElem.innerHTML = '<span class="pulse-text">[R] RECARREGAR</span>';
      } else {
        this.reloadPromptElem.className = 'reload-prompt-hidden';
      }
    }

    // Renderiza blocos de plasma
    let html = '';
    for (let i = 0; i < maxAmmo; i++) {
      const active = i < ammo && !reloading;
      const lowWarn = ammo <= 3 ? 'low' : '';
      html += `<div class="ammo-cell ${active ? 'filled' : 'empty'} ${lowWarn}"></div>`;
    }
    this.ammoBarsElem.innerHTML = html;
  }

  /**
   * Atualiza os placares do topo
   */
  public updateScore(data: ScoreData) {
    this.scoreElem.textContent = data.score.toString().padStart(5, '0');
    this.streakBadgeElem.textContent = `${data.multiplier.toFixed(1)}x (${data.streak}x combo)`;
    this.accuracyElem.textContent = `${data.accuracy}%`;

    // Se houve pontuação recente, exibe popup flutuante
    if (data.lastPointsAdded > 0) {
      this.showScorePopup(`+${data.lastPointsAdded} ${data.lastHitType}`, data.lastHitType === 'BULLSEYE');
    }
  }

  /**
   * Feedback visual de impacto (Hitmarker)
   */
  public triggerHitmarker(isBullseye: boolean) {
    this.hitmarkerElem.className = isBullseye ? 'hitmarker-bullseye' : 'hitmarker-active';
    setTimeout(() => {
      this.hitmarkerElem.className = 'hitmarker-hidden';
    }, 120);
  }

  /**
   * Disparo expande brevemente o retículo
   */
  public triggerRecoilReticle() {
    this.crosshairElem.classList.add('recoil-bloom');
    setTimeout(() => {
      this.crosshairElem.classList.remove('recoil-bloom');
    }, 100);
  }

  /**
   * Notificação flutuante de acerto/pontuação
   */
  private showScorePopup(text: string, isCritical: boolean) {
    const popup = document.createElement('div');
    popup.className = `score-popup ${isCritical ? 'critical' : 'normal'}`;
    popup.textContent = text;
    this.popupContainerElem.appendChild(popup);

    setTimeout(() => {
      popup.remove();
    }, 1200);
  }

  /**
   * Alterna a tela de pausa/trava do mouse
   */
  public setPointerLocked(locked: boolean) {
    if (locked) {
      this.pauseOverlayElem.style.display = 'none';
      document.body.classList.add('in-game');
    } else {
      this.pauseOverlayElem.style.display = 'flex';
      document.body.classList.remove('in-game');
    }
  }
}
