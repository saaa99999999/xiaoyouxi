import { GameType } from '../types/GameTypes';
import { Logger } from '../utils/Logger';

/**
 * 每日挑战管理器
 *
 * 基于日期种子的确定性挑战生成算法 (12种模板: 4游戏×3变体),
 * getTodayChallenges()、markCompleted()、跨天自动重置。
 */

export interface DailyChallenge {
  date: string;
  gameType: GameType;
  title: string;
  description: string;
  target: number;
  reward: string;
  completed: boolean;
}

export class DailyChallengeManager {
  private static instance: DailyChallengeManager;
  private currentDate: string = '';
  private challenges: DailyChallenge[] = [];
  private completedKeys: string[] = [];

  private static readonly CHALLENGE_POOLS: Record<GameType, Array<{ title: string; desc: string }>> = {
    [GameType.RHYTHM_SYNC]: [
      { title: '节拍大师日', desc: '单局达成5次Perfect判定' },
      { title: '默契节拍', desc: '两人判定偏差在100ms内超过8次' },
      { title: '速度挑战', desc: '在困难模式下完成一局' },
    ],
    [GameType.MEMORY_MATCH]: [
      { title: '超级记忆', desc: '在1分钟内完成全部8对配对' },
      { title: '连续配对', desc: '一回合内连续配对成功3对' },
      { title: '完美记忆', desc: '整局0次配对失败' },
    ],
    [GameType.WORD_CHAIN]: [
      { title: '词汇爆发', desc: '单局组出15个以上词语' },
      { title: '极速接龙', desc: '每次10秒内完成组词' },
      { title: '长词专家', desc: '使用1个3字以上的词' },
    ],
    [GameType.JOINT_DRAWING]: [
      { title: '创意迸发', desc: '使用5种以上颜色完成作品' },
      { title: '细节大师', desc: '绘制30笔以上完成作品' },
      { title: '快速创作', desc: '在2分钟内完成绘画' },
    ]
  };

  static getInstance(): DailyChallengeManager {
    if (!DailyChallengeManager.instance) {
      DailyChallengeManager.instance = new DailyChallengeManager();
    }
    return DailyChallengeManager.instance;
  }

  getTodayChallenges(): DailyChallenge[] {
    const today = new Date().toISOString().slice(0, 10);
    if (this.currentDate !== today) {
      this.currentDate = today;
      this.challenges = [];
      this.completedKeys = [];
      this.loadCompleted();

      const gameTypes = [GameType.RHYTHM_SYNC, GameType.MEMORY_MATCH, GameType.WORD_CHAIN, GameType.JOINT_DRAWING];
      for (const gameType of gameTypes) {
        const challenge = this.generate(gameType);
        this.challenges.push(challenge);
      }
    }
    const result: DailyChallenge[] = [];
    for (const c of this.challenges) {
      result.push({
        date: c.date,
        gameType: c.gameType,
        title: c.title,
        description: c.description,
        target: c.target,
        reward: c.reward,
        completed: this.completedKeys.includes(this.challengeKey(c))
      });
    }
    return result;
  }

  markCompleted(challenge: DailyChallenge): void {
    const key = this.challengeKey(challenge);
    if (this.completedKeys.includes(key)) return;
    this.completedKeys.push(key);

    const stored = this.challenges.find(c => this.challengeKey(c) === key);
    if (stored) {
      stored.completed = true;
    }

    this.persist();
    Logger.info('DailyChallenge', `Completed: ${challenge.title}`);
  }

  getCompletedCount(): number {
    return this.completedKeys.length;
  }

  getTotalCount(): number {
    return 4;
  }

  private generate(gameType: GameType): DailyChallenge {
    const pool = DailyChallengeManager.CHALLENGE_POOLS[gameType];
    const dateNum = parseInt(this.currentDate.replace(/-/g, ''));
    const idx = dateNum % pool.length;
    const template = pool[idx];
    return {
      date: this.currentDate,
      gameType: gameType,
      title: template.title,
      description: template.desc,
      target: 10,
      reward: '+10 默契经验值',
      completed: false
    };
  }

  private challengeKey(challenge: DailyChallenge): string {
    return `${challenge.date}_${challenge.gameType}`;
  }

  private loadCompleted(): void {
    try {
      const stored = AppStorage.get<string>('daily_challenges_completed');
      if (stored) {
        const data = JSON.parse(stored) as Record<string, number | string | boolean | Object | undefined>;
        if (data['date'] === this.currentDate) {
          const keys = data['keys'] as string[];
          for (const k of keys) {
            this.completedKeys.push(k);
          }
        }
      }
    } catch (_e) {
      // ignore
    }
  }

  private persist(): void {
    try {
      AppStorage.setOrCreate('daily_challenges_completed', JSON.stringify({
        date: this.currentDate,
        keys: this.completedKeys.slice()
      }));
    } catch (_e) {
      // ignore
    }
  }
}
