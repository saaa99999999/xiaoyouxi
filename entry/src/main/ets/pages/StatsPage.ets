import router from '@ohos.router';
import { StorageManager } from '../common/manager/StorageManager';
import { AchievementManager, Achievement } from '../common/manager/AchievementManager';
import { GameType, GameResult, DeviceRole } from '../common/types/GameTypes';
import { SyncHarmonyCalculator, SyncHarmonyScore, GameStats, SYNC_TITLES } from '../common/utils/SyncHarmonyCalculator';
import { Logger } from '../common/utils/Logger';
import { SessionManager } from '../common/manager/SessionManager';
import { ScreenUtils } from '../common/utils/ScreenUtils';
import { ThemeManager } from '../common/manager/ThemeManager';
import { LightTheme, AppTheme } from '../constants/UIConstants';

@Entry
@Component
struct StatsPage {
  @State syncScore: number = 0;
  @State syncLevel: number = 0;
  @State syncTitle: string = '初识默契';
  @State totalGames: number = 0;
  @State winRate: string = '0%';
  @State streak: number = 0;
  @State bestStreak: number = 0;
  @State perfectCount: number = 0;
  @State rhythmScore: number = 0;
  @State drawingScore: number = 0;
  @State memoryScore: number = 0;
  @State wordChainScore: number = 0;
  @State recentGames: GameRecord[] = [];
  @State achievements: AchievementDisplay[] = [];
  @State isLoading: boolean = true;
  private storageMgr = StorageManager.getInstance();
  private achievementMgr = AchievementManager.getInstance();
  @State unlockedCount: number = 0;
  private myRole: DeviceRole = DeviceRole.HOST;
  private screen = ScreenUtils.getInstance();
  @StorageLink('currentTheme') currentTheme: AppTheme = LightTheme;
  private getTheme(): AppTheme { return this.currentTheme || LightTheme; }

  aboutToAppear(): void {
    AppStorage.setOrCreate('currentTheme', ThemeManager.getInstance().getTheme());
    this.loadStats(); }

  private async loadStats(): Promise<void> {
    this.isLoading = true;
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    try {
      const history: GameResult[] = await this.storageMgr.getGameHistory();
      this.totalGames = history.length;
      const wins = history.filter(g => g.winner === myRole).length;
      this.winRate = this.totalGames > 0 ? `${Math.round(wins / this.totalGames * 100)}%` : '0%';
      const gameStats: GameStats = {
        [GameType.RHYTHM_SYNC]: { played: 0, won: 0, totalSyncRate: 0, bestSyncRate: 0 },
        [GameType.JOINT_DRAWING]: { played: 0, won: 0, totalSyncRate: 0, bestSyncRate: 0 },
        [GameType.MEMORY_MATCH]: { played: 0, won: 0, totalSyncRate: 0, bestSyncRate: 0 },
        [GameType.WORD_CHAIN]: { played: 0, won: 0, totalSyncRate: 0, bestSyncRate: 0 },
      };
      for (const g of history) {
        const stats = gameStats[g.gameType];
        if (stats) {
          stats.played++;
          if (g.winner === myRole) stats.won++;
          if (g.syncRate !== undefined && g.syncRate > 0) { stats.totalSyncRate += g.syncRate; stats.bestSyncRate = Math.max(stats.bestSyncRate, g.syncRate); }
        }
      }
      const harmony = SyncHarmonyCalculator.calculateSyncScore(history, gameStats, myRole);
      this.syncScore = harmony.overall; this.syncLevel = harmony.level; this.syncTitle = harmony.title;
      this.streak = harmony.currentStreak; this.bestStreak = harmony.bestStreak; this.perfectCount = harmony.totalPerfects;
      this.rhythmScore = harmony.rhythmSync; this.drawingScore = harmony.creativeSync;
      this.memoryScore = harmony.memorySync; this.wordChainScore = harmony.wordSync;
      const gameRecords: GameRecord[] = [];
      for (let i = 0; i < Math.min(history.length, 10); i++) {
        const g = history[i];
        gameRecords.push({ gameName: this.getGameName(g.gameType), isWin: g.winner === myRole, detail: `主机${g.hostScore} : 客机${g.guestScore}`, timestamp: g.timestamp || Date.now() });
      }
      this.recentGames = gameRecords;
      const allAchievements = this.achievementMgr.getAllAchievements();
      const achDisplays: AchievementDisplay[] = [];
      for (const a of allAchievements) { achDisplays.push({ id: a.id, name: a.name, icon: a.icon, description: a.description, unlocked: a.unlockedAt !== undefined }); }
      this.achievements = achDisplays;
      this.unlockedCount = achDisplays.filter(a => a.unlocked).length;
    } catch (err) { Logger.error('StatsPage', `loadStats failed: ${JSON.stringify(err)}`); }
    finally { this.isLoading = false; }
  }

  private getGameName(gameType: GameType): string {
    switch (gameType) {
      case GameType.RHYTHM_SYNC: return '节奏共鸣';
      case GameType.JOINT_DRAWING: return '合体绘画';
      case GameType.MEMORY_MATCH: return '记忆碎片';
      case GameType.WORD_CHAIN: return '词语接龙';
      default: return '未知游戏';
    }
  }

  build() {
    Column() {
      // 导航栏
      Row() {
        Text('←').fontSize(this.screen.scaleFont(22)).fontColor(this.getTheme().textPrimary)
          .onClick(() => { router.back(); }).padding(10);
        Text('我的数据').fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary)
          .layoutWeight(1).textAlign(TextAlign.Center);
        Row().width(40);
      }
      .width('100%').padding({ left: 8, right: 8, top: 8, bottom: 8 })
      .backgroundColor(this.getTheme().bgCard);

      Row().width('100%').height(0.5).backgroundColor(this.getTheme().divider);

      if (this.isLoading) {
        Column() {
          LoadingProgress().width(48).height(48).color(this.getTheme().brandBlue);
          Text('加载中...').fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textSecondary).margin({ top: 12 });
        }
        .width('100%').layoutWeight(1).justifyContent(FlexAlign.Center);
      } else {
        Scroll() {
          Column() {
            // 默契指数 — 宽屏时限制最大宽度
            Column() {
              Stack() {
                Progress({ value: this.syncScore, total: 100, type: ProgressType.Ring })
                  .width(120).height(120).color(this.getTheme().brandBlue).style({ strokeWidth: 8 });
                Column() {
                  Text(`${this.syncScore}`).fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().brandBlue);
                  Text('默契指数').fontSize(10).fontColor(this.getTheme().textSecondary);
                }
              }
              Text(`Lv.${this.syncLevel} — ${this.syncTitle}`)
                .fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textSecondary).margin({ top: 8 });
            }
            .width('100%').padding(16).alignItems(HorizontalAlign.Center);

            // 4格统计卡
            Row() {
              this.statCard('总局数', `${this.totalGames}`);
              this.statCard('胜率', this.winRate);
              this.statCard('连胜', `${this.streak}`);
              this.statCard('最佳连胜', `${this.bestStreak}`);
            }
            .width('100%').padding({ left: 8, right: 8 });

            // 分项统计
            Column() {
              Text('分项统计').fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary).margin({ bottom: 8 });
              this.scoreBar('节奏共鸣', this.rhythmScore);
              this.scoreBar('合体绘画', this.drawingScore);
              this.scoreBar('记忆碎片', this.memoryScore);
              this.scoreBar('词语接龙', this.wordChainScore);
            }
            .width('100%').padding(16).backgroundColor(this.getTheme().bgCard).borderRadius(12)
            .margin({ left: 16, right: 16, top: 8 });

            // 最近战绩
            if (this.recentGames.length > 0) {
              Column() {
                Text('最近战绩').fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary).margin({ bottom: 8 });
                ForEach(this.recentGames.slice(0, 10), (game: GameRecord, index: number) => {
                  Row() {
                    Text(game.isWin ? '🟢' : '🔴').fontSize(this.screen.scaleFont(14));
                    Text(game.gameName).fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textPrimary).layoutWeight(1).margin({ left: 8 });
                    Text(game.isWin ? '胜' : '败').fontSize(this.screen.scaleFont(12)).fontColor(game.isWin ? this.getTheme().successGreen : this.getTheme().errorRed);
                    Text(game.detail).fontSize(this.screen.scaleFont(12)).fontColor(this.getTheme().textSecondary).margin({ left: 8 });
                  }
                  .width('100%').padding({ top: 6, bottom: 6 });
                }, (game: GameRecord, index: number) => index.toString());
              }
              .width('100%').padding(16).backgroundColor(this.getTheme().bgCard).borderRadius(12)
              .margin({ left: 16, right: 16, top: 8 });
            }

            // 成就墙
            Column() {
              Row() {
                Text('成就').fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary);
                Blank();
                Text(`${this.unlockedCount}/${this.achievements.length}`).fontSize(12).fontColor(this.getTheme().textSecondary);
              }
              .width('100%').margin({ bottom: 8 });
              Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.Start }) {
                ForEach(this.achievements, (ach: AchievementDisplay) => {
                  Column() {
                    Text(ach.icon).fontSize(28).opacity(ach.unlocked ? 1 : 0.3);
                    Text(ach.name).fontSize(9).fontColor(this.getTheme().textSecondary).maxLines(1).margin({ top: 2 });
                  }
                  .width('20%').padding(4).alignItems(HorizontalAlign.Center);
                }, (ach: AchievementDisplay) => ach.id);
              }
            }
            .width('100%').padding(16).backgroundColor(this.getTheme().bgCard).borderRadius(12)
            .margin({ left: 16, right: 16, top: 8, bottom: 16 });
          }
        }
        .layoutWeight(1);
      }
    }
    .width('100%').height('100%').backgroundColor(this.getTheme().bgPrimary);
  }

  @Builder statCard(label: string, value: string) {
    Column() {
      Text(value).fontSize(this.screen.scaleFont(20)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().brandBlue);
      Text(label).fontSize(10).fontColor(this.getTheme().textSecondary).margin({ top: 2 });
    }
    .layoutWeight(1).padding(8).backgroundColor(this.getTheme().bgCard).borderRadius(12)
    .margin({ left: 4, right: 4 }).alignItems(HorizontalAlign.Center);
  }

  @Builder scoreBar(label: string, score: number) {
    Row() {
      Text(label).fontSize(12).fontColor(this.getTheme().textSecondary).width(60);
      Progress({ value: score, total: 100, type: ProgressType.Linear })
        .layoutWeight(1).height(8).color(this.getTheme().brandBlue);
      Text(`${score}`).fontSize(12).fontColor(this.getTheme().brandBlue).width(28).textAlign(TextAlign.End);
    }
    .width('100%').margin({ top: 4, bottom: 4 });
  }
}

interface GameRecord { gameName: string; isWin: boolean; detail: string; timestamp: number; }
interface AchievementDisplay { id: string; name: string; icon: string; description: string; unlocked: boolean; }
