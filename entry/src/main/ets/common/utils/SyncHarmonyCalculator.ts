import { GameType, GameResult } from '../types/GameTypes';

/**
 * 默契指数计算器
 *
 * 5 维度加权算法:
 *   节奏 0.30 + 绘画 0.20 + 记忆 0.25 + 接龙 0.15 + 连胜 0.10
 */

export interface SyncHarmonyScore {
  overall: number;
  rhythmSync: number;
  creativeSync: number;
  memorySync: number;
  wordSync: number;
  gamesPlayed: number;
  bestStreak: number;
  currentStreak: number;
  totalPerfects: number;
  level: number;
  title: string;
}

export interface GameStats {
  [GameType.RHYTHM_SYNC]: { played: number; won: number; totalSyncRate: number; bestSyncRate: number };
  [GameType.JOINT_DRAWING]: { played: number; won: number; totalSyncRate: number; bestSyncRate: number };
  [GameType.MEMORY_MATCH]: { played: number; won: number; totalSyncRate: number; bestSyncRate: number };
  [GameType.WORD_CHAIN]: { played: number; won: number; totalSyncRate: number; bestSyncRate: number };
}

export const SYNC_TITLES: Record<number, string> = {
  0:  '初识默契',
  5:  '渐入佳境',
  10: '心有灵犀',
  15: '配合默契',
  20: '天作之合',
  25: '心领神会',
  30: '琴瑟和鸣',
  35: '如鱼得水',
  40: '浑然一体',
  45: '天人合一',
  50: '默契大师'
};

export class SyncHarmonyCalculator {
  private static readonly WEIGHTS = {
    rhythm: 0.30,
    drawing: 0.20,
    memory: 0.25,
    wordchain: 0.15,
    streak: 0.10
  };

  static calculateSyncScore(history: GameResult[], stats: GameStats, myRole?: string): SyncHarmonyScore {
    const gamesPlayed = history.length;

    // 分项计算
    const rhythmSync = SyncHarmonyCalculator.calcCategoryScore(stats[GameType.RHYTHM_SYNC]);
    const creativeSync = SyncHarmonyCalculator.calcCategoryScore(stats[GameType.JOINT_DRAWING]);
    const memorySync = SyncHarmonyCalculator.calcCategoryScore(stats[GameType.MEMORY_MATCH]);
    const wordSync = SyncHarmonyCalculator.calcCategoryScore(stats[GameType.WORD_CHAIN]);

    // 连胜分项
    const { currentStreak, bestStreak } = SyncHarmonyCalculator.calcStreaks(history, myRole);
    const streakScore = Math.min(100, bestStreak * 10);

    // 加权综合
    const overall = Math.round(
      rhythmSync * SyncHarmonyCalculator.WEIGHTS.rhythm +
      creativeSync * SyncHarmonyCalculator.WEIGHTS.drawing +
      memorySync * SyncHarmonyCalculator.WEIGHTS.memory +
      wordSync * SyncHarmonyCalculator.WEIGHTS.wordchain +
      streakScore * SyncHarmonyCalculator.WEIGHTS.streak
    );

    // 完美判定次数
    const totalPerfects = history.reduce((sum, r) => {
      return sum + (r.details['perfectCount'] as number || 0);
    }, 0);

    // 等级和称号
    const level = Math.min(50, Math.floor(overall / 2));
    const title = SyncHarmonyCalculator.getTitle(level);

    return {
      overall,
      rhythmSync,
      creativeSync,
      memorySync,
      wordSync,
      gamesPlayed,
      bestStreak,
      currentStreak,
      totalPerfects,
      level,
      title
    };
  }

  static updateAfterGame(current: SyncHarmonyScore, result: GameResult, myRole?: string): SyncHarmonyScore {
    const updated: SyncHarmonyScore = {
      overall: current.overall,
      rhythmSync: current.rhythmSync,
      creativeSync: current.creativeSync,
      memorySync: current.memorySync,
      wordSync: current.wordSync,
      gamesPlayed: current.gamesPlayed,
      bestStreak: current.bestStreak,
      currentStreak: current.currentStreak,
      totalPerfects: current.totalPerfects,
      level: current.level,
      title: current.title
    };
    updated.gamesPlayed++;

    // 只有输了才中断连胜，平局不中断
    if (result.winner === 'draw') {
      // 平局: 维持连胜，不增加
    } else if (myRole && result.winner === myRole) {
      updated.currentStreak++;
      updated.bestStreak = Math.max(updated.bestStreak, updated.currentStreak);
    } else {
      updated.currentStreak = 0;
    }

    if (result.syncRate !== undefined && result.syncRate > 0) {
      switch (result.gameType) {
        case GameType.RHYTHM_SYNC:
          updated.rhythmSync = SyncHarmonyCalculator.blendScore(updated.rhythmSync, result.syncRate);
          break;
        case GameType.JOINT_DRAWING:
          updated.creativeSync = SyncHarmonyCalculator.blendScore(updated.creativeSync, result.syncRate);
          break;
        case GameType.MEMORY_MATCH:
          updated.memorySync = SyncHarmonyCalculator.blendScore(updated.memorySync, result.syncRate);
          break;
        case GameType.WORD_CHAIN:
          updated.wordSync = SyncHarmonyCalculator.blendScore(updated.wordSync, result.syncRate);
          break;
      }
    }

    updated.totalPerfects += (result.details['perfectCount'] as number || 0);

    const streakScore = Math.min(100, updated.bestStreak * 10);
    updated.overall = Math.round(
      updated.rhythmSync * SyncHarmonyCalculator.WEIGHTS.rhythm +
      updated.creativeSync * SyncHarmonyCalculator.WEIGHTS.drawing +
      updated.memorySync * SyncHarmonyCalculator.WEIGHTS.memory +
      updated.wordSync * SyncHarmonyCalculator.WEIGHTS.wordchain +
      streakScore * SyncHarmonyCalculator.WEIGHTS.streak
    );

    updated.level = Math.min(50, Math.floor(updated.overall / 2));
    updated.title = SyncHarmonyCalculator.getTitle(updated.level);

    return updated;
  }

  private static calcCategoryScore(stats: { played: number; totalSyncRate: number; bestSyncRate: number }): number {
    if (stats.played === 0) return 0;
    const avg = stats.totalSyncRate / stats.played;
    return Math.min(100, Math.round((avg * 0.7 + stats.bestSyncRate * 0.3)));
  }

  private static calcStreaks(history: GameResult[], myRole?: string): { currentStreak: number; bestStreak: number } {
    let bestStreak = 0;
    let runningStreak = 0;

    // 历史记录从新到旧，先算当前连胜（从最新到首次败局），再扫描最佳连胜
    let currentBroken = false;
    let currentStreak = 0;

    for (const result of history) {
      const isDraw = result.winner === 'draw';
      if (isDraw) {
        // 平局不中断连胜也不增加
      } else if (myRole && result.winner as string === myRole) {
        runningStreak++;
        bestStreak = Math.max(bestStreak, runningStreak);
        if (!currentBroken) currentStreak++;
      } else if (!myRole) {
        // 无角色信息时，不计入连胜也不中断
        continue;
      } else {
        // 败局: 中断当前连胜，中断当前连胜计数
        if (!currentBroken) currentBroken = true;
        runningStreak = 0;
      }
    }
    bestStreak = Math.max(bestStreak, currentStreak);

    return { currentStreak, bestStreak };
  }

  private static blendScore(current: number, newScore: number): number {
    return Math.min(100, Math.round(current * 0.7 + newScore * 0.3));
  }

  static getTitle(level: number): string {
    const allKeys = Object.keys(SYNC_TITLES);
    const thresholds: number[] = [];
    for (const k of allKeys) {
      thresholds.push(Number(k));
    }
    thresholds.sort((a, b) => b - a);
    for (const threshold of thresholds) {
      if (level >= threshold) {
        return SYNC_TITLES[threshold];
      }
    }
    return SYNC_TITLES[0];
  }
}
