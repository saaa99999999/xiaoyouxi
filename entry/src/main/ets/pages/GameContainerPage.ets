import router from '@ohos.router';
import { GameType, GamePhase, GameResult } from '../common/types/GameTypes';
import { SessionManager } from '../common/manager/SessionManager';
import { StorageManager } from '../common/manager/StorageManager';
import { ResultDialog } from '../components/ResultDialog';
import { ExitConfirmDialog } from '../components/ExitConfirmDialog';
import { GameTutorialDialog } from '../components/GameTutorialDialog';
import { RhythmGame } from '../games/rhythm/RhythmGame';
import { DrawingGame } from '../games/drawing/DrawingGame';
import { MemoryGame } from '../games/memory/MemoryGame';
import { WordChainGame } from '../games/wordchain/WordChainGame';
import { SoundManager } from '../common/manager/SoundManager';
import { ScreenUtils } from '../common/utils/ScreenUtils';
import { ThemeManager } from '../common/manager/ThemeManager';
import { LightTheme, AppTheme } from '../constants/UIConstants';

@Entry
@Component
struct GameContainerPage {
  @State gameType: GameType = GameType.RHYTHM_SYNC;
  @State gamePhase: GamePhase = GamePhase.WAITING;
  @State gameResult: GameResult | null = null;
  @State restartKey: number = 0;
  @State showTutorial: boolean = true;
  private sm = SessionManager.getInstance();
  private screen = ScreenUtils.getInstance();
  @StorageLink('currentTheme') currentTheme: AppTheme = LightTheme;
  private getTheme(): AppTheme { return this.currentTheme || LightTheme; }
  private resultDialogCtrl: CustomDialogController | null = null;
  private exitDialogCtrl: CustomDialogController | null = null;
  private tutorialDialogCtrl: CustomDialogController | null = null;

  aboutToAppear(): void {
    AppStorage.setOrCreate('currentTheme', ThemeManager.getInstance().getTheme());
    const params = router.getParams() as Record<string, number | string | boolean | Object | undefined>;
    if (params && params['gameType']) { this.gameType = params['gameType'] as GameType; }
    this.sm.startGame(this.gameType);
    const tutorialKey = `tutorial_${this.gameType}`;
    StorageManager.getInstance().getPreference(tutorialKey).then(val => {
      if (val) { this.showTutorial = false; } else { this.showTutorial = true; this.openTutorial(); }
    }).catch(() => { this.showTutorial = true; this.openTutorial(); });
  }

  aboutToDisappear(): void { this.sm.endGame(); }

  onBackPress(): boolean {
    if (this.gamePhase === GamePhase.PLAYING || this.gamePhase === GamePhase.PAUSED) { this.showExitDialog(); return true; }
    return false;
  }

  private showExitDialog(): void {
    this.exitDialogCtrl = new CustomDialogController({
      builder: ExitConfirmDialog({ onConfirm: () => { this.sm.endGame(); router.back(); } }),
      autoCancel: true, customStyle: true
    });
    this.exitDialogCtrl.open();
  }

  private openTutorial(): void {
    this.tutorialDialogCtrl = new CustomDialogController({
      builder: GameTutorialDialog({ gameType: this.gameType, onStart: () => { this.onTutorialComplete(); } }),
      autoCancel: false, customStyle: true
    });
    this.tutorialDialogCtrl.open();
  }

  private onTutorialComplete(): void {
    this.showTutorial = false;
    StorageManager.getInstance().savePreference(`tutorial_${this.gameType}`, 'seen');
  }

  build() {
    Stack() {
      Column() {
        if (this.gameType === GameType.RHYTHM_SYNC) {
          // 无顶部导航栏
        } else {
          Row() {
            Text('←').fontSize(this.screen.scaleFont(22)).fontColor(this.getTheme().textPrimary)
              .onClick(() => {
                SoundManager.getInstance().play('button_click');
                if (this.gamePhase === GamePhase.PLAYING || this.gamePhase === GamePhase.PAUSED) { this.showExitDialog(); }
                else { router.back(); }
              }).padding(10);
            Blank();
            Text(this.getGameName()).fontSize(this.screen.scaleFont(17)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary);
            Blank();
            Text('?').fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textSecondary)
              .width(32).height(32).textAlign(TextAlign.Center)
              .borderRadius(16).backgroundColor(this.getTheme().bgPrimary)
              .onClick(() => { this.openTutorial(); });
          }
          .width('100%').padding({ left: 8, right: 12, top: 8, bottom: 8 })
          .backgroundColor(this.getTheme().bgCard);
          Row().width('100%').height(0.5).backgroundColor(this.getTheme().divider);
        }

        if (this.gameType === GameType.RHYTHM_SYNC) {
          RhythmGame({ gamePhase: $gamePhase, onGameFinished: (result: GameResult) => { this.onGameFinished(result); }, restartKey: this.restartKey });
        } else if (this.gameType === GameType.JOINT_DRAWING) {
          DrawingGame({ gamePhase: $gamePhase, onGameFinished: (result: GameResult) => { this.onGameFinished(result); }, restartKey: this.restartKey });
        } else if (this.gameType === GameType.MEMORY_MATCH) {
          MemoryGame({ gamePhase: $gamePhase, onGameFinished: (result: GameResult) => { this.onGameFinished(result); }, restartKey: this.restartKey });
        } else if (this.gameType === GameType.WORD_CHAIN) {
          WordChainGame({ gamePhase: $gamePhase, onGameFinished: (result: GameResult) => { this.onGameFinished(result); }, restartKey: this.restartKey });
        }
      }
      .width('100%').height('100%').backgroundColor(this.getTheme().bgPrimary)
    }
    .width('100%').height('100%')
  }

  onGameFinished(result: GameResult): void {
    this.gameResult = result;
    this.gamePhase = GamePhase.RESULT;
    result.timestamp = Date.now();
    StorageManager.getInstance().saveGameResult(result);
    this.resultDialogCtrl = new CustomDialogController({
      builder: ResultDialog({ result: result, onPlayAgain: () => { this.restartGame(); }, onBackToLobby: () => { router.back(); } }),
      autoCancel: false, customStyle: true
    });
    this.resultDialogCtrl.open();
  }

  private restartGame(): void { this.restartKey++; this.gamePhase = GamePhase.WAITING; this.gameResult = null; this.sm.startGame(this.gameType); }

  private getGameName(): string {
    switch (this.gameType) {
      case GameType.RHYTHM_SYNC: return '节奏共鸣';
      case GameType.JOINT_DRAWING: return '合体绘画';
      case GameType.MEMORY_MATCH: return '记忆碎片';
      case GameType.WORD_CHAIN: return '词语接龙';
      default: return '游戏';
    }
  }
}
