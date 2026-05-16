import { GameType } from '../types/GameTypes';
import { Logger } from '../utils/Logger';

/**
 * 成就系统管理器
 *
 * 17项成就定义、进度追踪、持久化、解锁回调通知。
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: (stats: PlayerStats) => boolean;
  reward: string;
  unlockedAt?: number;
}

export interface PlayerStats {
  totalGamesPlayed: number;
  totalPerfectSyncs: number;
  totalWins: number;
  maxWinStreak: number;
  rhythmHighScore: number;
  memoryBestPairs: number;
  wordChainBestWords: number;
  drawingThemesCompleted: number;
  gamesWithSamePartner: number;
  uniquePartnerCount: number;
  consecutiveDaysPlayed: number;
  allGamesPlayed: string[];
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_game',
    name: '初次默契',
    description: '完成第一局任意游戏',
    icon: '🎯',
    condition: (s) => s.totalGamesPlayed >= 1,
    reward: '解锁"默契指数"面板'
  },
  {
    id: 'ten_games',
    name: '默契常客',
    description: '累计完成 10 局游戏',
    icon: '🔟',
    condition: (s) => s.totalGamesPlayed >= 10,
    reward: '解锁"快速匹配"模式'
  },
  {
    id: 'fifty_games',
    name: '默契达人',
    description: '累计完成 50 局游戏',
    icon: '🏆',
    condition: (s) => s.totalGamesPlayed >= 50,
    reward: '金色名牌框'
  },
  {
    id: 'perfect_rhythm',
    name: '节拍大师',
    description: '节奏共鸣中达成单局100% Perfect',
    icon: '🎵',
    condition: (s) => s.rhythmHighScore >= 1000,
    reward: '解锁"电音"音效包'
  },
  {
    id: 'memory_master',
    name: '记忆之王',
    description: '记忆碎片中一回合连续配对4对以上',
    icon: '🧠',
    condition: (s) => s.memoryBestPairs >= 4,
    reward: '解锁"霓虹"卡牌皮肤'
  },
  {
    id: 'word_wizard',
    name: '词语大师',
    description: '词语接龙中单局组出10个以上词语',
    icon: '📝',
    condition: (s) => s.wordChainBestWords >= 10,
    reward: '解锁"书法"字池皮肤'
  },
  {
    id: 'creative_soul',
    name: '艺术灵魂',
    description: '合体绘画中完成所有10个主题',
    icon: '🎨',
    condition: (s) => s.drawingThemesCompleted >= 10,
    reward: '解锁"水彩"画笔套装'
  },
  {
    id: 'five_streak',
    name: '五连胜',
    description: '连续获胜 5 局 (任意游戏)',
    icon: '🔥',
    condition: (s) => s.maxWinStreak >= 5,
    reward: '火焰粒子特效'
  },
  {
    id: 'ten_streak',
    name: '十连胜',
    description: '连续获胜 10 局',
    icon: '💎',
    condition: (s) => s.maxWinStreak >= 10,
    reward: '钻石粒子特效'
  },
  {
    id: 'friend_bond',
    name: '最佳拍档',
    description: '与同一伙伴完成 20 局游戏',
    icon: '🤝',
    condition: (s) => s.gamesWithSamePartner >= 20,
    reward: '拍档专属称号'
  },
  {
    id: 'daily_warrior',
    name: '每日先锋',
    description: '连续 7 天每天至少完成 1 局游戏',
    icon: '📅',
    condition: (s) => s.consecutiveDaysPlayed >= 7,
    reward: '7天加倍经验卡'
  },
  {
    id: 'all_games',
    name: '全能默契',
    description: '完成全部 4 种游戏',
    icon: '⭐',
    condition: (s) => s.allGamesPlayed.length >= 4,
    reward: '解锁"暗金"主题包'
  },
  {
    id: 'quick_sync',
    name: '闪电默契',
    description: '累计达成 50 次 Perfect 判定',
    icon: '⚡',
    condition: (s) => s.totalPerfectSyncs >= 50,
    reward: '雷电触觉反馈'
  },
  {
    id: 'perfect_sync',
    name: '天地同频',
    description: '累计达成 100 次 Perfect 同步判定',
    icon: '✨',
    condition: (s) => s.totalPerfectSyncs >= 100,
    reward: '星光触觉反馈'
  },
  {
    id: 'comeback',
    name: '绝地反击',
    description: '连胜 3 局以上',
    icon: '🔄',
    condition: (s) => s.maxWinStreak >= 3,
    reward: '解锁"竞技"排行榜'
  },
  {
    id: 'speed_demon',
    name: '速度与默契',
    description: '词语接龙中单局组出6个以上词语',
    icon: '🚀',
    condition: (s) => s.wordChainBestWords >= 6,
    reward: '解锁"极速"接龙模式'
  },
  {
    id: 'social_butterfly',
    name: '社交达人',
    description: '与 5 个不同设备完成过游戏',
    icon: '🦋',
    condition: (s) => s.uniquePartnerCount >= 5,
    reward: '解锁"好友列表"功能'
  }
];

export class AchievementManager {
  private static instance: AchievementManager;
  private unlocked: string[] = [];
  private unlockTimestamps: Record<string, number> = {};
  private unlockListeners: Array<(achievement: Achievement) => void> = [];

  static getInstance(): AchievementManager {
    if (!AchievementManager.instance) {
      AchievementManager.instance = new AchievementManager();
    }
    return AchievementManager.instance;
  }

  init(): void {
    try {
      const stored = AppStorage.get<string>('achievements_unlocked');
      if (stored) {
        const data = JSON.parse(stored) as Record<string, Object>;
        const ids = data['ids'] as string[];
        const timestamps = data['timestamps'] as Record<string, number>;
        for (const id of ids) {
          if (!this.unlocked.includes(id)) {
            this.unlocked.push(id);
          }
        }
        if (timestamps) {
          this.unlockTimestamps = timestamps;
        }
      }
      Logger.info('AchievementManager', `Restored ${this.unlocked.length} achievements`);
    } catch (err) {
      Logger.error('AchievementManager', 'Init failed', err);
    }
  }

  checkAndUnlock(stats: PlayerStats): Achievement[] {
    const newlyUnlocked: Achievement[] = [];
    for (const achievement of ACHIEVEMENTS) {
      if (this.unlocked.includes(achievement.id)) continue;
      try {
        if (achievement.condition(stats)) {
          this.unlocked.push(achievement.id);
          const ts = Date.now();
          this.unlockTimestamps[achievement.id] = ts;
          const unlockedAchievement: Achievement = {
            id: achievement.id,
            name: achievement.name,
            description: achievement.description,
            icon: achievement.icon,
            condition: achievement.condition,
            reward: achievement.reward,
            unlockedAt: ts
          };
          newlyUnlocked.push(unlockedAchievement);
        }
      } catch (err) {
        Logger.error('AchievementManager', `Check failed for ${achievement.id}`, err);
      }
    }

    if (newlyUnlocked.length > 0) {
      this.persist();
      for (const a of newlyUnlocked) {
        for (const cb of this.unlockListeners) {
          try { cb(a); } catch (_e) { /* ignore */ }
        }
      }
    }

    return newlyUnlocked;
  }

  isUnlocked(achievementId: string): boolean {
    return this.unlocked.includes(achievementId);
  }

  getUnlockedCount(): number {
    return this.unlocked.length;
  }

  getTotalCount(): number {
    return ACHIEVEMENTS.length;
  }

  getAllAchievements(): Achievement[] {
    return ACHIEVEMENTS.map(a => {
      const result: Achievement = {
        id: a.id,
        name: a.name,
        description: a.description,
        icon: a.icon,
        condition: a.condition,
        reward: a.reward,
        unlockedAt: this.unlocked.includes(a.id) ? (this.unlockTimestamps[a.id] || 0) : undefined
      };
      return result;
    });
  }

  onUnlock(callback: (achievement: Achievement) => void): void {
    this.unlockListeners.push(callback);
  }

  private persist(): void {
    try {
      const data = {
        ids: this.unlocked.slice(),
        timestamps: this.unlockTimestamps
      };
      AppStorage.setOrCreate('achievements_unlocked', JSON.stringify(data));
    } catch (_e) {
      // ignore
    }
  }
}
