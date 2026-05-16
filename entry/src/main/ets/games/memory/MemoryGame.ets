import { MemoryEngine } from './MemoryEngine';
import { GameType, DeviceRole, GamePhase, SyncPacket, GameResult } from '../../common/types/GameTypes';
import { SyncManager } from '../../common/manager/SyncManager';
import { SessionManager } from '../../common/manager/SessionManager';
import { SoundManager } from '../../common/manager/SoundManager';
import { HapticManager } from '../../common/manager/HapticManager';
import { Logger } from '../../common/utils/Logger';
import { ScreenUtils } from '../../common/utils/ScreenUtils';

interface CardDisplay {
  id: number;
  emoji: string;
  state: 'hidden' | 'revealed' | 'matched';
  flipProgress: number;
}

/**
 * 记忆碎片游戏 — 响应式版
 *
 * 改进:
 * - 使用 layoutWeight 替代固定高度，手机/平板自适应
 * - 字体和间距使用 ScreenUtils 缩放
 * - 牌区各占约 38% 屏幕高度，牌面更大更清晰
 * - 平板上自动放大 emoji 和字体
 */
@Component
export struct MemoryGame {
  @Link gamePhase: GamePhase;
  @Prop @Watch('onRestart') restartKey: number = 0;
  @State myCards: CardDisplay[] = [];
  @State partnerCards: CardDisplay[] = [];
  @State myScore: number = 0;
  @State partnerScore: number = 0;
  @State isMyTurn: boolean = false;
  @State matchedPairs: string[] = [];
  @State messageText: string = '';
  @State lastMatchResult: string = ''; // 'match' | 'mismatch' | ''
  @State matchStreak: number = 0;
  @State selectedDifficulty: number = 2; // 1=简单, 2=普通, 3=困难
  private engine: MemoryEngine = new MemoryEngine();
  private syncMgr = SyncManager.getInstance();
  private screen = ScreenUtils.getInstance();
  private matchResultTimerId: number = 0;
  private difficultyLabels: string[] = ['简单', '普通', '困难'];
  private difficultyDescs: string[] = ['6对', '8对', '12对'];
  private difficultyColors: string[] = ['#4CAF50', '#FF9800', '#F44336'];
  onGameFinished?: (result: GameResult) => void;

  aboutToAppear(): void {
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.setSyncCallback((packet: SyncPacket) => {
      this.syncMgr.push('memory', packet);
    });
    this.engine.setStateChangeCallback((state) => {
      if (myRole === DeviceRole.HOST) {
        this.myScore = state.hostScore;
        this.partnerScore = state.guestScore;
      } else {
        this.myScore = state.guestScore;
        this.partnerScore = state.hostScore;
      }
      this.isMyTurn = state.currentTurn === myRole;
      this.matchStreak = state.matchStreak;
      const prevMatchedCount = this.matchedPairs.length;
      this.refreshCardsDisplay(myRole);
      const newMatchedCount = this.matchedPairs.length;
      if (newMatchedCount > prevMatchedCount) {
        SoundManager.getInstance().play('card_match');
        HapticManager.getInstance().play('card_match');
        this.lastMatchResult = 'match';
        if (this.matchResultTimerId) clearTimeout(this.matchResultTimerId);
        this.matchResultTimerId = setTimeout(() => { this.matchResultTimerId = 0; this.lastMatchResult = ''; }, 800);
      } else if (newMatchedCount === prevMatchedCount && state.isChecking) {
        SoundManager.getInstance().play('card_mismatch');
        HapticManager.getInstance().play('card_mismatch');
        this.lastMatchResult = 'mismatch';
        if (this.matchResultTimerId) clearTimeout(this.matchResultTimerId);
        this.matchResultTimerId = setTimeout(() => { this.matchResultTimerId = 0; this.lastMatchResult = ''; }, 600);
      }
      if (state.phase === GamePhase.FINISHED && this.gamePhase !== GamePhase.FINISHED) {
        this.gamePhase = GamePhase.FINISHED;
        if (this.onGameFinished) this.onGameFinished(this.engine.getResult());
      }
    });

    this.engine.init({ gameType: GameType.MEMORY_MATCH, myRole: myRole, difficulty: this.selectedDifficulty });
    this.refreshCardsDisplay(myRole);

    this.syncMgr.onDataChangePrefix('memory', (_key: string, value: Object) => {
      this.engine.handleSync(value as SyncPacket);
    });
  }

  aboutToDisappear(): void {
    if (this.matchResultTimerId) {
      clearTimeout(this.matchResultTimerId);
      this.matchResultTimerId = 0;
    }
    this.engine.cleanup();
    this.syncMgr.offDataChangePrefix('memory');
  }

  onRestart(): void {
    if (this.matchResultTimerId) {
      clearTimeout(this.matchResultTimerId);
      this.matchResultTimerId = 0;
    }
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.init({ gameType: GameType.MEMORY_MATCH, myRole: myRole, difficulty: this.selectedDifficulty });
    this.myScore = 0;
    this.partnerScore = 0;
    this.matchedPairs = [];
    this.messageText = '';
    this.lastMatchResult = '';
    this.refreshCardsDisplay(myRole);
  }

  build() {
    Column() {
      // 难度选择 — 仅在 WAITING 阶段显示
      if (this.gamePhase === GamePhase.WAITING) {
        Column() {
          Text('记忆碎片')
            .fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold)
            .fontColor('#1A1A1A').margin({ bottom: 8 });
          Text('选择难度')
            .fontSize(this.screen.scaleFont(14)).fontColor('#757575').margin({ bottom: 16 });
          Row() {
            ForEach([1, 2, 3], (diff: number, index: number) => {
              Column() {
                Text(this.difficultyLabels[index])
                  .fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
                  .fontColor(this.selectedDifficulty === diff ? Color.White : '#424242');
                Text(this.difficultyDescs[index])
                  .fontSize(this.screen.scaleFont(12)).fontColor('#757575')
                  .margin({ top: 4 });
              }
              .width(90).padding({ top: 14, bottom: 14 })
              .backgroundColor(this.selectedDifficulty === diff ? this.difficultyColors[index] : '#F5F5F5')
              .borderRadius(12)
              .alignItems(HorizontalAlign.Center)
              .margin({ left: 6, right: 6 })
              .onClick(() => {
                this.selectedDifficulty = diff;
                SoundManager.getInstance().play('button_click');
              });
            }, (diff: number) => diff.toString());
          }
          .margin({ bottom: 24 });
          Button('开始游戏')
            .fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold)
            .backgroundColor('#007DFF').fontColor(Color.White)
            .width(180).height(52).borderRadius(26)
            .onClick(() => {
              const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
              this.engine.init({ gameType: GameType.MEMORY_MATCH, myRole: myRole, difficulty: this.selectedDifficulty });
              this.refreshCardsDisplay(myRole);
              SoundManager.getInstance().play('button_click');
            });
        }
        .width('100%').layoutWeight(1)
        .justifyContent(FlexAlign.Center).alignItems(HorizontalAlign.Center);
      } else {
      // 正常游戏UI — 状态栏 — 白色背景
      Row() {
        Column() {
          Text(`${this.myScore}`).fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold).fontColor('#007DFF');
          Text('我').fontSize(this.screen.scaleFont(11)).fontColor('#999999');
        }
        .layoutWeight(1).alignItems(HorizontalAlign.Center);

        Column() {
          if (this.gamePhase === GamePhase.COUNTDOWN) {
            Text('记住牌面!')
              .fontSize(this.screen.scaleFont(16)).fontColor('#FF6B35')
              .fontWeight(FontWeight.Bold);
          } else if (this.matchStreak >= 2) {
            Text(`${this.matchStreak}连配!`)
              .fontSize(this.screen.scaleFont(16)).fontColor('#FF6B35')
              .fontWeight(FontWeight.Bold);
          } else {
            Text(this.isMyTurn ? '你的回合' : '对方回合')
              .fontSize(this.screen.scaleFont(16)).fontColor('#1A1A1A')
              .fontWeight(FontWeight.Bold);
          }
          if (this.lastMatchResult === 'match') {
            Text('✓ 配对成功!').fontSize(this.screen.scaleFont(14)).fontColor('#64BB5C').fontWeight(FontWeight.Bold);
          } else if (this.lastMatchResult === 'mismatch') {
            Text('✗ 不匹配').fontSize(this.screen.scaleFont(14)).fontColor('#FF5252');
          }
        }
        .layoutWeight(2).alignItems(HorizontalAlign.Center);

        Column() {
          Text(`${this.partnerScore}`).fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold).fontColor('#FF9900');
          Text('对方').fontSize(this.screen.scaleFont(11)).fontColor('#999999');
        }
        .layoutWeight(1).alignItems(HorizontalAlign.Center);
      }
      .width('100%').padding({ left: 16, right: 16, top: 14, bottom: 14 })
      .backgroundColor(Color.White);

      // 已配对展示
      if (this.matchedPairs.length > 0) {
        Row() {
          Text('已配对: ').fontSize(this.screen.scaleFont(13)).fontColor('#757575');
          ForEach(this.matchedPairs, (emoji: string) => {
            Text(emoji).fontSize(this.screen.scaleFont(20)).margin({ left: 4, right: 4 });
          }, (emoji: string) => emoji);
        }
        .width('100%').padding({ left: 16, right: 16, top: 8, bottom: 4 });
      }

      // 对方牌区标签
      Row() {
        Text('对方牌区').fontSize(this.screen.scaleFont(14)).fontColor('#757575').fontWeight(FontWeight.Medium);
        Blank();
        Text(`${this.partnerCards.filter(c => c.state === 'matched').length}/${this.partnerCards.length} 已配`)
          .fontSize(this.screen.scaleFont(12)).fontColor('#9E9E9E');
      }
      .width('100%').padding({ left: 12, right: 12 });

      // 对方牌区
      Grid() {
        ForEach(this.partnerCards, (card: CardDisplay) => {
          GridItem() { this.cardView(card, this.isMyTurn && card.state === 'hidden'); };
        }, (card: CardDisplay) => card.id.toString());
      }
      .columnsTemplate(this.getGridCols())
      .rowsTemplate(this.getGridRows(this.partnerCards.length))
      .width('100%').layoutWeight(3.8)
      .padding(8).backgroundColor('#FFF3E015')
      .borderRadius(14).margin({ left: 8, right: 8, top: 4 });

      // 分隔
      Row() {
        Row().width(60).height(2).borderRadius(1)
          .linearGradient({ direction: GradientDirection.Right, colors: [['#BDBDBD', 0], ['#E0E0E0', 1]] });
        Text('VS').fontSize(this.screen.scaleFont(14)).fontWeight(FontWeight.Bold).fontColor('#BDBDBD')
          .margin({ left: 12, right: 12 });
        Row().width(60).height(2).borderRadius(1)
          .linearGradient({ direction: GradientDirection.Right, colors: [['#E0E0E0', 0], ['#BDBDBD', 1]] });
      }
      .width('100%').justifyContent(FlexAlign.Center).margin({ top: 6, bottom: 6 });

      // 我的牌区标签
      Row() {
        Text('我的牌区').fontSize(this.screen.scaleFont(14)).fontColor('#757575').fontWeight(FontWeight.Medium);
        Blank();
        Text(`${this.myCards.filter(c => c.state === 'matched').length}/${this.myCards.length} 已配`)
          .fontSize(this.screen.scaleFont(12)).fontColor('#9E9E9E');
      }
      .width('100%').padding({ left: 12, right: 12 });

      // 我的牌区
      Grid() {
        ForEach(this.myCards, (card: CardDisplay) => {
          GridItem() {
            this.cardView(card, this.isMyTurn && card.state === 'hidden');
          };
        }, (card: CardDisplay) => card.id.toString());
      }
      .columnsTemplate(this.getGridCols())
      .rowsTemplate(this.getGridRows(this.myCards.length))
      .width('100%').layoutWeight(4.5)
      .padding(8).backgroundColor('#E3F2FD20')
      .borderRadius(14).margin({ left: 8, right: 8, top: 4 });

      // 提示
      if (this.messageText) {
        Text(this.messageText)
          .fontSize(this.screen.scaleFont(14)).fontColor('#FF6B35')
          .margin({ top: 8 });
      }
      } // end else (game UI)
    }
    .width('100%').height('100%').backgroundColor('#FAFAFA');
  }

  @Builder cardView(card: CardDisplay, tappable: boolean) {
    Stack() {
      if (card.state === 'matched') {
        Column() {
          Text(card.emoji).fontSize(this.screen.scaleFont(36)).opacity(0.4);
          Text('✓').fontSize(this.screen.scaleFont(12)).fontColor('#66BB6A');
        }
      } else if (card.state === 'revealed') {
        Stack() {
          Text(card.emoji).fontSize(this.screen.scaleFont(44));
        }
        .border({ width: 2, color: '#FF8F00' })
      } else {
        Column() {
          Text('?').fontSize(this.screen.scaleFont(32)).fontWeight(FontWeight.Bold).fontColor('#B0BEC5');
        }
      }
    }
    .width('100%').height('100%')
    .backgroundColor(card.state === 'matched' ? '#E8F5E9' :
                     card.state === 'revealed' ? '#FFF8E1' :
                     tappable ? '#E3F2FD' : '#F5F5F5')
    .borderRadius(14)
    .border({
      width: card.state === 'revealed' ? 2 : 1,
      color: card.state === 'revealed' ? '#FF8F00' :
             card.state === 'matched' ? '#66BB6A' :
             tappable ? '#42A5F5' : '#E0E0E0'
    })
    .shadow(tappable ? { radius: 8, color: '#1E88E540', offsetY: 2 } : { radius: 2, color: '#00000010', offsetY: 1 })
    .onClick(() => {
      if (tappable && card.state === 'hidden') {
        this.engine.handleInput({ type: 'PICK_CARD', data: { cardId: card.id } });
        SoundManager.getInstance().play('card_flip');
        HapticManager.getInstance().play('card_flip');
      }
    });
  }

  private toCardState(state: string): 'hidden' | 'revealed' | 'matched' {
    if (state === 'hidden') return 'hidden';
    if (state === 'revealed') return 'revealed';
    if (state === 'matched') return 'matched';
    return 'hidden';
  }

  private refreshCardsDisplay(myRole: DeviceRole): void {
    const state = this.engine.getState();
    const myDeviceCards = this.engine.getCardsForDevice(myRole);
    const partnerRole = myRole === DeviceRole.HOST ? DeviceRole.GUEST : DeviceRole.HOST;
    const partnerDeviceCards = this.engine.getCardsForDevice(partnerRole);

    const myCardsList: CardDisplay[] = [];
    for (const c of myDeviceCards) {
      myCardsList.push({
        id: c.id, emoji: c.emoji,
        state: this.toCardState(c.state as string),
        flipProgress: this.toCardState(c.state as string) === 'revealed' ? 1 : 0
      });
    }
    this.myCards = myCardsList;

    const partnerCardsList: CardDisplay[] = [];
    for (const c of partnerDeviceCards) {
      partnerCardsList.push({
        id: c.id,
        emoji: c.emoji,
        state: this.toCardState(c.state as string),
        flipProgress: this.toCardState(c.state as string) === 'revealed' ? 1 : 0
      });
    }
    this.partnerCards = partnerCardsList;

    const matched = state.cards.filter(c => c.state === 'matched');
    const uniqueEmojis: string[] = [];
    const seen: string[] = [];
    for (const c of matched) {
      if (!seen.includes(c.emoji)) {
        seen.push(c.emoji);
        uniqueEmojis.push(c.emoji);
      }
    }
    this.matchedPairs = uniqueEmojis;
  }

  private getGridCols(): string {
    const count = this.myCards.length || this.partnerCards.length;
    if (count <= 6) return '1fr 1fr 1fr';
    if (count <= 8) return '1fr 1fr 1fr 1fr';
    return '1fr 1fr 1fr 1fr';
  }

  private getGridRows(count: number): string {
    if (count <= 6) return '1fr 1fr';
    if (count <= 8) return '1fr 1fr';
    return '1fr 1fr 1fr';
  }
}
