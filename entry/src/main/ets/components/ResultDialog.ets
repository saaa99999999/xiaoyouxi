import { GameResult, DeviceRole, GameType } from '../common/types/GameTypes';
import { GAME_REGISTRY } from '../constants/GameConstants';
import { SoundManager } from '../common/manager/SoundManager';
import { SessionManager } from '../common/manager/SessionManager';

@CustomDialog
export struct ResultDialog {
  @Prop result: GameResult = {
    gameType: GameType.RHYTHM_SYNC,
    hostScore: 0,
    guestScore: 0,
    winner: 'draw' as 'draw',
    details: {}
  };
  controller: CustomDialogController;
  onPlayAgain?: () => void;
  onBackToLobby?: () => void;
  @State private appearScale: number = 0.8;
  @State private appearOpacity: number = 0;
  private appearTimerId: number = 0;

  aboutToAppear(): void {
    // Play result sound
    if (this.result.winner === 'draw') {
      SoundManager.getInstance().play('countdown_go');
    } else {
      const myRole = SessionManager.getInstance().getMyRole();
      if (myRole && this.result.winner === myRole) {
        SoundManager.getInstance().play('game_win');
      } else {
        SoundManager.getInstance().play('game_lose');
      }
    }
    // Animate in
    this.appearTimerId = setTimeout(() => {
      this.appearTimerId = 0;
      this.appearScale = 1.0;
      this.appearOpacity = 1.0;
    }, 50);
  }

  aboutToDisappear(): void {
    if (this.appearTimerId) {
      clearTimeout(this.appearTimerId);
      this.appearTimerId = 0;
    }
  }

  build() {
    Column() {
      // 胜负图标
      Text(this.result.winner === 'draw' ? '🤝' : '🏆')
        .fontSize(48)
        .margin({ top: 24, bottom: 4 });

      // 标题
      Text(this.getTitleText())
        .fontSize(28).fontWeight(FontWeight.Bold)
        .fontColor(this.getTitleColor())
        .margin({ bottom: 4 });

      Text(GAME_REGISTRY[this.result.gameType]?.name || '')
        .fontSize(14).fontColor('#757575')
        .margin({ bottom: 20 });

      // 分数
      Row() {
        this.scoreColumn('主机', this.result.hostScore, this.result.winner === DeviceRole.HOST);
        Divider().vertical(true).height(60).margin({ left: 24, right: 24 });
        this.scoreColumn('客机', this.result.guestScore, this.result.winner === DeviceRole.GUEST);
      }
      .margin({ bottom: 20 });

      // 默契率 (如果有)
      if (this.result.syncRate !== undefined && this.result.syncRate > 0) {
        Row() {
          Text('默契率 ')
            .fontSize(14).fontColor('#757575');
          Text(`${this.result.syncRate!.toFixed(1)}%`)
            .fontSize(22).fontWeight(FontWeight.Bold).fontColor('#007DFF');
        }
        .margin({ bottom: 16 });
      }

      // 按钮
      Row() {
        Button('返回大厅')
          .fontSize(14)
          .backgroundColor('#F5F5F5').fontColor('#424242')
          .onClick(() => {
            SoundManager.getInstance().play('button_click');
            this.controller.close();
            if (this.onBackToLobby) this.onBackToLobby();
          });

        Button('再来一局')
          .fontSize(14)
          .backgroundColor('#007DFF').fontColor(Color.White)
          .margin({ left: 16 })
          .onClick(() => {
            SoundManager.getInstance().play('button_click');
            this.controller.close();
            if (this.onPlayAgain) this.onPlayAgain();
          });
      }
      .width('100%').justifyContent(FlexAlign.Center)
      .margin({ bottom: 24 });
    }
    .width('80%').borderRadius(20).backgroundColor(Color.White)
    .scale({ x: this.appearScale, y: this.appearScale })
    .opacity(this.appearOpacity)
    .animation({ duration: 300, curve: Curve.EaseOut });
  }

  @Builder scoreColumn(label: string, score: number, isWinner: boolean) {
    Column() {
      Text(label).fontSize(12).fontColor('#757575').margin({ bottom: 4 });
      Text(`${score}`).fontSize(36).fontWeight(FontWeight.Bold)
        .fontColor(isWinner ? '#FF6B35' : '#212121');
      if (isWinner) {
        Text('🏆').fontSize(16).margin({ top: 4 });
      }
    }
  }

  private getTitleText(): string {
    if (this.result.winner === 'draw') return '平局!';
    const myRole = SessionManager.getInstance().getMyRole();
    if (myRole && this.result.winner === myRole) return '你赢了!';
    return '你输了';
  }

  private getTitleColor(): string {
    if (this.result.winner === 'draw') return '#007DFF';
    const myRole = SessionManager.getInstance().getMyRole();
    if (myRole && this.result.winner === myRole) return '#FF6B35';
    return '#757575';
  }
}
