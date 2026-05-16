import router from '@ohos.router';
import pasteboard from '@ohos.pasteboard';
import { GameMeta, ConnectionState, SessionState, PlayerInfo, DeviceRole, GameType } from '../common/types/GameTypes';
import { GAME_REGISTRY } from '../constants/GameConstants';
import { SessionManager } from '../common/manager/SessionManager';
import { DeviceManager } from '../common/manager/DeviceManager';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { GameCard } from '../components/GameCard';
import { TutorialOverlay } from '../components/TutorialOverlay';
import { StorageManager } from '../common/manager/StorageManager';
import { DailyChallengeManager, DailyChallenge } from '../common/manager/DailyChallengeManager';
import { SoundManager } from '../common/manager/SoundManager';
import { ScreenUtils } from '../common/utils/ScreenUtils';
import { ThemeManager } from '../common/manager/ThemeManager';
import { LightTheme, AppTheme } from '../constants/UIConstants';

@Entry
@Component
struct MainPage {
  @State connectionState: ConnectionState = ConnectionState.IDLE;
  @State sessionState: SessionState = SessionState.IDLE;
  @State partnerName: string = '';
  @State roomCode: string = '';
  @State showTutorial: boolean = false;
  @State gameList: GameMeta[] = [];
  @State dailyChallenges: DailyChallenge[] = [];
  @State dailyCompleted: number = 0;
  private sm = SessionManager.getInstance();
  private dm = DeviceManager.getInstance();
  private dailyMgr = DailyChallengeManager.getInstance();
  @StorageLink('currentTheme') currentTheme: AppTheme = LightTheme;
  private themeMgr: ThemeManager = ThemeManager.getInstance();
  private screen = ScreenUtils.getInstance();

  private getTheme(): AppTheme { return this.currentTheme || LightTheme; }

  aboutToAppear(): void {
    AppStorage.setOrCreate('currentTheme', this.themeMgr.getTheme());
    const keys: GameType[] = [GameType.RHYTHM_SYNC, GameType.JOINT_DRAWING, GameType.MEMORY_MATCH, GameType.WORD_CHAIN];
    const list: GameMeta[] = [];
    for (const key of keys) {
      const meta = GAME_REGISTRY[key];
      if (meta) list.push(meta);
    }
    this.gameList = list;

    StorageManager.getInstance().getPreference('first_launch').then(val => {
      if (!val) {
        this.showTutorial = true;
        StorageManager.getInstance().savePreference('first_launch', 'done');
      }
    });

    const localDevice = this.dm.getLocalDeviceInfo();
    if (localDevice) {
      this.sm.init({
        deviceId: localDevice.deviceId,
        deviceName: localDevice.deviceName,
        role: DeviceRole.HOST,
        isReady: true
      });
    }

    this.sm.onStateChange((oldState, newState) => {
      this.sessionState = newState;
      this.connectionState = this.mapToConnectionState(newState);
      const partner = this.sm.getPartnerInfo();
      this.partnerName = partner ? partner.deviceName : '';
      this.roomCode = this.sm.getSessionId();
    });

    this.dailyChallenges = this.dailyMgr.getTodayChallenges();
    this.dailyCompleted = this.dailyMgr.getCompletedCount();
  }

  aboutToDisappear(): void {
    this.sm.offStateChange();
  }

  build() {
    Stack() {
    Column() {
      // 顶部标题栏
      Row() {
        Text('默契挑战')
          .fontSize(this.screen.scaleFont(22)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary);
        Text('SyncTap')
          .fontSize(this.screen.scaleFont(11)).fontColor(this.getTheme().textSecondary).margin({ left: 8 });
        Blank();
        if (this.roomCode) {
          Row() {
            Text(this.roomCode).fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().brandBlue)
              .letterSpacing(4);
          }
          .padding({ left: 12, right: 12, top: 6, bottom: 6 })
          .backgroundColor('#007DFF10').borderRadius(8)
          .onClick(() => {
            try {
              const pasteData = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, this.roomCode);
              pasteboard.getSystemPasteboard().setData(pasteData);
              AlertDialog.show({ message: `房间码 ${this.roomCode} 已复制`, alignment: DialogAlignment.Center });
            } catch (e) {
              AlertDialog.show({ message: `房间码: ${this.roomCode}`, alignment: DialogAlignment.Center });
            }
          });
        }
        Button() {
          Text('📊').fontSize(this.screen.scaleFont(20));
        }
        .width(44).height(44).backgroundColor(Color.Transparent)
        .margin({ left: 8 })
        .onClick(() => { router.pushUrl({ url: 'pages/StatsPage' }); });
      }
      .width('100%').padding({ left: 20, right: 20, top: 16, bottom: 12 });

      // 连接状态条
      if (this.connectionState === ConnectionState.CONNECTED) {
        Row() {
          Circle().width(8).height(8).fill(this.getTheme().successGreen);
          Text(`已连接${this.partnerName ? ' · ' + this.partnerName : ''}`)
            .fontSize(12).fontColor(this.getTheme().textSecondary).margin({ left: 6 });
        }
        .width('100%').padding({ left: 20, right: 20, bottom: 8 });
      } else if (this.connectionState === ConnectionState.CONNECTING || this.connectionState === ConnectionState.DISCOVERING) {
        Row() {
          Circle().width(8).height(8).fill(this.getTheme().accentOrange);
          Text('连接中...')
            .fontSize(12).fontColor(this.getTheme().textSecondary).margin({ left: 6 });
        }
        .width('100%').padding({ left: 20, right: 20, bottom: 8 });
      }

      // 连接/房间按钮
      Row() {
        Button(this.sessionState === SessionState.IDLE ? '创建房间' : '离开房间')
          .fontSize(this.screen.scaleFont(15)).fontWeight(FontWeight.Medium)
          .backgroundColor(this.getTheme().bgCard).fontColor('#333333')
          .height(44).borderRadius(22).layoutWeight(1)
          .onClick(() => {
            SoundManager.getInstance().play('button_click');
            if (this.sessionState === SessionState.IDLE) {
              router.pushUrl({ url: 'pages/DeviceConnectPage', params: { mode: 'host' } });
            } else {
              this.sm.leaveSession();
            }
          });

        Button(this.sessionState === SessionState.IDLE ? '加入房间' : '分享房间码')
          .fontSize(this.screen.scaleFont(15)).fontWeight(FontWeight.Medium)
          .backgroundColor(this.getTheme().brandBlue).fontColor(this.getTheme().bgCard)
          .height(44).borderRadius(22).layoutWeight(1).margin({ left: 12 })
          .onClick(() => {
            SoundManager.getInstance().play('button_click');
            if (this.sessionState === SessionState.IDLE) {
              router.pushUrl({ url: 'pages/DeviceConnectPage', params: { mode: 'guest' } });
            } else {
              const code = this.roomCode;
              if (code) {
                try {
                  const pasteData = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, code);
                  pasteboard.getSystemPasteboard().setData(pasteData);
                  AlertDialog.show({ message: `房间码 ${code} 已复制到剪贴板`, alignment: DialogAlignment.Center });
                } catch (e) {
                  AlertDialog.show({ message: `房间码: ${code}`, alignment: DialogAlignment.Center });
                }
              }
            }
          });
      }
      .width('100%').padding({ left: 20, right: 20, top: 4, bottom: 16 });

      // 每日挑战
      if (this.dailyChallenges.length > 0) {
        Column() {
          Row() {
            Text('每日挑战').fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary);
            Blank();
            Text(`${this.dailyCompleted}/${this.dailyMgr.getTotalCount()}`)
              .fontSize(12).fontColor(this.getTheme().textSecondary);
          }
          .width('100%').margin({ bottom: 10 });

          ForEach(this.dailyChallenges, (challenge: DailyChallenge, index: number) => {
            Row() {
              Text(challenge.completed ? '✅' : '⬜').fontSize(this.screen.scaleFont(16));
              Column() {
                Text(challenge.title).fontSize(this.screen.scaleFont(14)).fontWeight(FontWeight.Medium)
                  .fontColor(challenge.completed ? this.getTheme().textSecondary : this.getTheme().textPrimary);
                Text(challenge.description).fontSize(12).fontColor(this.getTheme().textSecondary).maxLines(1);
              }
              .layoutWeight(1).margin({ left: 10 });
              if (!challenge.completed) {
                Button('去挑战')
                  .fontSize(12).height(32)
                  .backgroundColor(this.getTheme().accentOrange).fontColor(this.getTheme().bgCard).borderRadius(16)
                  .onClick(() => {
                    SoundManager.getInstance().play('button_click');
                    router.pushUrl({
                      url: 'pages/GameContainerPage',
                      params: { gameType: challenge.gameType }
                    });
                  });
              }
            }
            .width('100%').padding({ top: 8, bottom: 8 });
          }, (challenge: DailyChallenge, index: number) => `${challenge.date}_${challenge.gameType}`);
        }
        .width('100%').padding(16)
        .backgroundColor(this.getTheme().bgCard).borderRadius(12)
        .margin({ left: 20, right: 20, top: 4, bottom: 12 })
        .shadow({ radius: 4, color: '#0A000000', offsetY: 1 });
      }

      // 游戏选择标题
      Row() {
        Text('选择游戏').fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary);
      }
      .width('100%').padding({ left: 20, top: 4, bottom: 8 });

      // 游戏卡片 — 宽屏时一排4张, 手机一排2张
      Scroll() {
        Flex({ wrap: FlexWrap.Wrap, justifyContent: this.screen.isWideScreen() ? FlexAlign.Start : FlexAlign.SpaceBetween }) {
          ForEach(this.gameList, (meta: GameMeta) => {
            GameCard({
              meta: meta,
              locked: !meta.isFree && this.sessionState !== SessionState.CONNECTED,
              onSelect: (type: string) => {
                if (this.sessionState === SessionState.CONNECTED || meta.isFree) {
                  router.pushUrl({
                    url: 'pages/GameContainerPage',
                    params: { gameType: type }
                  });
                } else {
                  AlertDialog.show({ message: '请先连接设备', alignment: DialogAlignment.Center });
                }
              }
            });
          }, (meta: GameMeta) => meta.type);
        }
        .padding({ left: 20, right: 20, bottom: 16 });
      }
      .layoutWeight(1);

      // 底部
      Text('v1.0 — 需要两台 HarmonyOS 设备')
        .fontSize(11).fontColor(this.getTheme().textSecondary).padding({ top: 8, bottom: 8 });
    }
    .width('100%').height('100%').backgroundColor(this.getTheme().bgPrimary);

    // 新手引导
    if (this.showTutorial) {
      TutorialOverlay({
        onComplete: () => { this.showTutorial = false; }
      });
    }
    }
    .width('100%').height('100%')
  }

  private mapToConnectionState(state: SessionState): ConnectionState {
    switch (state) {
      case SessionState.HOSTING:
      case SessionState.JOINING: return ConnectionState.CONNECTING;
      case SessionState.CONNECTED:
      case SessionState.IN_GAME: return ConnectionState.CONNECTED;
      case SessionState.DISCONNECTED: return ConnectionState.DISCONNECTED;
      default: return ConnectionState.IDLE;
    }
  }
}
