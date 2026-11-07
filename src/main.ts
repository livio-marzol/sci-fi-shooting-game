import './style.css';
import { GameEngine } from './game/GameEngine';

// Inicializa a aplicação após o carregamento do DOM
window.addEventListener('DOMContentLoaded', () => {
  const canvasContainer = document.getElementById('canvas-container');
  const hudContainer = document.getElementById('hud-container');

  if (!canvasContainer || !hudContainer) {
    console.error('Contêineres necessários não encontrados no DOM.');
    return;
  }

  // Inicializa o motor do jogo 3D
  new GameEngine(canvasContainer, hudContainer);
});
