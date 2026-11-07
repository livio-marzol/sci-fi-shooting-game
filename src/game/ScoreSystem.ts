import { HitResult } from './TargetSystem';
import { AudioSystem } from './AudioSystem';

export interface ScoreData {
  score: number;
  streak: number;
  multiplier: number;
  accuracy: number;
  totalShots: number;
  totalHits: number;
  bullseyes: number;
  lastPointsAdded: number;
  lastHitType: string;
}

/**
 * ScoreSystem.ts - Gerencia pontuação, multiplicadores de combo, precisão balística
 * e estatísticas da sessão de tiro ao alvo.
 */
export class ScoreSystem {
  public score: number = 0;
  public streak: number = 0;
  public highestStreak: number = 0;
  public totalShots: number = 0;
  public totalHits: number = 0;
  public bullseyes: number = 0;

  private audioSystem: AudioSystem;
  public onScoreChanged?: (data: ScoreData) => void;

  constructor(audioSystem: AudioSystem) {
    this.audioSystem = audioSystem;
  }

  /**
   * Chamado quando um tiro é disparado
   */
  public registerShot(hitResult: HitResult | null) {
    this.totalShots++;

    let pointsAdded = 0;
    let hitType = 'MISS';

    if (hitResult && hitResult.hit) {
      this.totalHits++;
      this.streak++;
      if (this.streak > this.highestStreak) {
        this.highestStreak = this.streak;
      }

      const multiplier = this.getMultiplier();
      pointsAdded = Math.round(hitResult.score * multiplier);
      this.score += pointsAdded;

      if (hitResult.isBullseye) {
        this.bullseyes++;
        hitType = 'BULLSEYE';
      } else if (hitResult.isInner) {
        hitType = 'INNER RING';
      } else {
        hitType = 'OUTER RING';
      }

      // Hype sonoro em marcos de combo
      if (this.streak === 5 || this.streak === 10 || this.streak === 15) {
        this.audioSystem.playComboUp();
      }
    } else {
      // Tiro errou: zera a sequência de combo
      this.streak = 0;
    }

    if (this.onScoreChanged) {
      this.onScoreChanged(this.getScoreData(pointsAdded, hitType));
    }
  }

  public getMultiplier(): number {
    if (this.streak >= 10) return 3.0;
    if (this.streak >= 6) return 2.0;
    if (this.streak >= 3) return 1.5;
    return 1.0;
  }

  public getAccuracy(): number {
    if (this.totalShots === 0) return 100;
    return Math.round((this.totalHits / this.totalShots) * 100);
  }

  public getScoreData(lastPointsAdded: number = 0, lastHitType: string = ''): ScoreData {
    return {
      score: this.score,
      streak: this.streak,
      multiplier: this.getMultiplier(),
      accuracy: this.getAccuracy(),
      totalShots: this.totalShots,
      totalHits: this.totalHits,
      bullseyes: this.bullseyes,
      lastPointsAdded,
      lastHitType
    };
  }

  public reset() {
    this.score = 0;
    this.streak = 0;
    this.totalShots = 0;
    this.totalHits = 0;
    this.bullseyes = 0;
    if (this.onScoreChanged) {
      this.onScoreChanged(this.getScoreData(0, 'RESET'));
    }
  }
}
