import { WordChainEngine } from './WordChainEngine';
import { GameType, DeviceRole, GamePhase, SyncPacket, GameResult } from '../../common/types/GameTypes';
import util from '@ohos.util';
import { SyncManager } from '../../common/manager/SyncManager';
import { SessionManager } from '../../common/manager/SessionManager';
import { CountdownTimer } from '../../components/CountdownTimer';
import { SoundManager } from '../../common/manager/SoundManager';
import { HapticManager } from '../../common/manager/HapticManager';
import { WORD_CHAIN_TURN_TIMEOUT_MS } from '../../constants/GameConstants';
import { Logger } from '../../common/utils/Logger';
import { ScreenUtils } from '../../common/utils/ScreenUtils';

/**
 * 词语接龙 — 升级版
 *
 * 改进:
 * - 更多字符 (12个)
 * - 重置选择按钮
 * - 词语长度奖励显示
 * - 成功组词有视觉+音效反馈
 * - 更友好的错误提示
 * - 对方字母池显示首字高亮
 */
@Component
export struct WordChainGame {
  @Link gamePhase: GamePhase;
  @Prop @Watch('onRestart') restartKey: number = 0;
  @State myChars: string[] = [];
  @State partnerChars: string[] = [];
  @State wordHistory: string[] = [];
  @State lastChar: string = '';
  @State myScore: number = 0;
  @State partnerScore: number = 0;
  @State isMyTurn: boolean = false;
  @State selectedIndices: number[] = [];
  @State currentWord: string = '';
  @State remainingMs: number = WORD_CHAIN_TURN_TIMEOUT_MS;
  @State errorMsg: string = '';
  @State isLoading: boolean = true;
  @State loadError: boolean = false;
  @State lastWordSuccess: boolean = false; // 最近组词是否成功
  @State hintText: string = ''; // 提示文本
  private engine: WordChainEngine = new WordChainEngine();
  private syncMgr = SyncManager.getInstance();
  private screen = ScreenUtils.getInstance();
  private errorMsgTimerId: number = 0;
  private successMsgTimerId: number = 0;
  private hintTimerId: number = 0;
  onGameFinished?: (result: GameResult) => void;

  aboutToAppear(): void {
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;

    this.isLoading = true;
    this.loadError = false;
    const innerRole = myRole;
    getContext().resourceManager.getRawFileContent('dictionary.json', (err, value) => {
      if (!err && value) {
        try {
          const textDecoder = util.TextDecoder.create('utf-8');
          const uint8Arr = new Uint8Array(value as ArrayBuffer);
          const json = textDecoder.decodeToString(uint8Arr);
          const dict = JSON.parse(json) as Record<string, string[]>;
          this.engine.loadDictionary(dict.words || []);
          this.isLoading = false;
          if (innerRole === DeviceRole.HOST) {
            this.engine.startGame();
          }
        } catch (parseErr) {
          Logger.error('WordChainGame', 'Dictionary parse failed', parseErr);
          this.isLoading = false;
          this.loadError = true;
        }
      } else {
        Logger.error('WordChainGame', 'Dictionary load failed', err);
        this.isLoading = false;
        this.loadError = true;
        const fallbackWords = ['天空','大地','人生','中国','高兴','音乐','思考','团结','蓝天','天气'];
        this.engine.loadDictionary(fallbackWords);
        if (innerRole === DeviceRole.HOST) {
          this.engine.startGame();
        }
      }
    });

    this.engine.setSyncCallback((packet: SyncPacket) => {
      this.syncMgr.push('wordchain', packet);
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
      this.lastChar = state.lastChar;
      const prevWordCount = this.wordHistory.length;
      this.wordHistory = state.wordHistory;
      this.remainingMs = state.remainingTimeMs;
      if (myRole === DeviceRole.HOST) {
        this.myChars = state.hostChars;
        this.partnerChars = state.guestChars;
      } else {
        this.myChars = state.guestChars;
        this.partnerChars = state.hostChars;
      }
      if (state.phase === GamePhase.FINISHED && this.gamePhase !== GamePhase.FINISHED) {
        this.gamePhase = GamePhase.FINISHED;
        if (this.onGameFinished) this.onGameFinished(this.engine.getResult());
      }
      // Word accepted feedback
      if (this.wordHistory.length > 0 && this.wordHistory.length > prevWordCount) {
        this.lastWordSuccess = true;
        // 清空选中状态，防止对方的组词残留自己的选中字符
        this.selectedIndices = [];
        this.currentWord = '';
        if (this.successMsgTimerId) clearTimeout(this.successMsgTimerId);
        this.successMsgTimerId = setTimeout(() => {
          this.successMsgTimerId = 0;
          this.lastWordSuccess = false;
        }, 2000);
        HapticManager.getInstance().play('game_win');
      }
    });

    this.engine.init({ gameType: GameType.WORD_CHAIN, myRole: myRole });

    this.syncMgr.onDataChangePrefix('wordchain', (_key: string, value: Object) => {
      const packet = value as SyncPacket;
      this.engine.handleSync(packet);
      // 显示对方组词失败信息
      if (packet.type === 'WORD_REJECTED') {
        const reason = packet.payload['reason'] as string;
        const player = packet.payload['player'] as DeviceRole;
        if (player !== myRole) {
          const reasonMap: Record<string, string> = {
            'invalid_length': '长度不符',
            'wrong_first_char': '首字不对',
            'chars_not_in_pool': '字不在池中',
            'not_in_dict': '不在词库中',
            'already_used': '已用过'
          };
          this.errorMsg = `对方组词失败: ${reasonMap[reason] || reason}`;
          if (this.errorMsgTimerId) clearTimeout(this.errorMsgTimerId);
          this.errorMsgTimerId = setTimeout(() => { this.errorMsgTimerId = 0; this.errorMsg = ''; }, 2000);
        }
      }
    });
  }

  aboutToDisappear(): void {
    if (this.errorMsgTimerId) {
      clearTimeout(this.errorMsgTimerId);
      this.errorMsgTimerId = 0;
    }
    if (this.successMsgTimerId) {
      clearTimeout(this.successMsgTimerId);
      this.successMsgTimerId = 0;
    }
    if (this.hintTimerId) {
      clearTimeout(this.hintTimerId);
      this.hintTimerId = 0;
    }
    this.engine.cleanup();
    this.syncMgr.offDataChangePrefix('wordchain');
  }

  onRestart(): void {
    if (this.errorMsgTimerId) {
      clearTimeout(this.errorMsgTimerId);
      this.errorMsgTimerId = 0;
    }
    if (this.successMsgTimerId) {
      clearTimeout(this.successMsgTimerId);
      this.successMsgTimerId = 0;
    }
    if (this.hintTimerId) {
      clearTimeout(this.hintTimerId);
      this.hintTimerId = 0;
    }
    const myRole = SessionManager.getInstance().getMyRole() || DeviceRole.HOST;
    this.engine.init({ gameType: GameType.WORD_CHAIN, myRole: myRole });
    this.myScore = 0;
    this.partnerScore = 0;
    this.selectedIndices = [];
    this.currentWord = '';
    this.errorMsg = '';
    this.lastWordSuccess = false;
    this.isMyTurn = false;
    this.myChars = [];
    this.partnerChars = [];
    this.wordHistory = [];
    this.lastChar = '';
    this.remainingMs = WORD_CHAIN_TURN_TIMEOUT_MS;
    if (myRole === DeviceRole.HOST) {
      this.engine.startGame();
    }
  }

  build() {
    Column() {
      if (this.isLoading) {
        Column() {
          LoadingProgress().width(48).height(48).color('#007DFF').margin({ bottom: 12 });
          Text('加载词典中...').fontSize(this.screen.scaleFont(14)).fontColor('#757575');
        }
        .width('100%').layoutWeight(1).justifyContent(FlexAlign.Center);
      } else {
        Scroll() {
          Column() {
        if (this.loadError) {
          Text('词库加载失败，使用精简词库').fontSize(this.screen.scaleFont(12)).fontColor('#FF6B35')
            .width('100%').padding({ left: 16, top: 4 });
        }

        // 顶部状态 — 白色背景
        Row() {
          Column() {
            Text(`${this.myScore}`).fontSize(this.screen.scaleFont(24)).fontWeight(FontWeight.Bold).fontColor('#007DFF');
            Text('我的得分').fontSize(this.screen.scaleFont(11)).fontColor('#999999');
          }
          .layoutWeight(1).alignItems(HorizontalAlign.Center);

          CountdownTimer({ totalMs: WORD_CHAIN_TURN_TIMEOUT_MS, remainingMs: this.remainingMs, sizeValue: this.isMyTurn ? 44 : 36 });

          Column() {
            Text(`${this.partnerScore}`).fontSize(this.screen.scaleFont(24)).fontWeight(FontWeight.Bold).fontColor('#FF9900');
            Text('对方得分').fontSize(this.screen.scaleFont(11)).fontColor('#999999');
          }
          .layoutWeight(1).alignItems(HorizontalAlign.Center);
        }
        .width('100%').padding({ left: 16, right: 16, top: 14, bottom: 14 })
        .backgroundColor(Color.White);

        // 对方字母池 (只读)
        Text('对方字母池').fontSize(this.screen.scaleFont(12)).fontColor('#9E9E9E').padding({ left: 16, top: 8 });
        Flex({ wrap: FlexWrap.Wrap }) {
          ForEach(this.partnerChars, (ch: string, index: number) => {
            Text(ch).fontSize(this.screen.scaleFont(22)).padding(8)
              .backgroundColor(ch === this.lastChar ? '#FFF3E0' : '#F5F5F5')
              .fontColor(ch === this.lastChar ? '#FF6B35' : '#757575')
              .borderRadius(10).margin(4)
              .border({ width: ch === this.lastChar ? 2 : 0, color: '#FF6B35' });
          }, (ch: string, index: number) => index.toString());
        }
        .width('100%').padding(8);

        // 词语链
        if (this.wordHistory.length > 0) {
          Scroll() {
            Row() {
              ForEach(this.wordHistory, (word: string, index: number) => {
                Row() {
                  Text(word).fontSize(this.screen.scaleFont(14))
                    .fontColor(index === this.wordHistory.length - 1 ? '#007DFF' : '#757575')
                    .fontWeight(index === this.wordHistory.length - 1 ? FontWeight.Bold : FontWeight.Normal);
                  if (index < this.wordHistory.length - 1) {
                    Text(' → ').fontSize(this.screen.scaleFont(12)).fontColor('#BDBDBD');
                  }
                };
              }, (word: string, index: number) => index.toString());
            }
            .padding(8);
          }
          .height(40).scrollable(ScrollDirection.Horizontal)
          .backgroundColor('#F5F5F5').borderRadius(8)
          .margin({ left: 8, right: 8 });
        }

        // 必须首字提示
        if (this.lastChar) {
          Row() {
            Text('接龙字: ').fontSize(this.screen.scaleFont(12)).fontColor('#757575');
            Text(this.lastChar).fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold).fontColor('#FF6B35');
            Text(' 开头').fontSize(this.screen.scaleFont(12)).fontColor('#757575');
          }
          .width('100%').padding({ left: 16, top: 4, bottom: 4 });
        }

        // 我的字母池 (可交互)
        Text('你的字母池').fontSize(this.screen.scaleFont(12)).fontColor('#9E9E9E').padding({ left: 16 });
        Flex({ wrap: FlexWrap.Wrap }) {
          ForEach(this.myChars, (ch: string, index: number) => {
            Text(ch)
              .fontSize(this.screen.scaleFont(24)).padding(8)
              .backgroundColor(this.selectedIndices.includes(index) ? '#007DFF' : Color.White)
              .fontColor(this.selectedIndices.includes(index) ? Color.White : '#212121')
              .borderRadius(12)
              .border({ width: ch === this.lastChar ? 2 : 1, color: ch === this.lastChar ? '#FF6B35' : '#E0E0E0' })
              .margin(3)
              .onClick(() => {
                if (!this.isMyTurn) return;
                const idx = this.selectedIndices.indexOf(index);
                if (idx >= 0) {
                  this.selectedIndices = [...this.selectedIndices.slice(0, idx), ...this.selectedIndices.slice(idx + 1)];
                } else {
                  this.selectedIndices = [...this.selectedIndices, index];
                }
                this.currentWord = this.selectedIndices.map(i => this.myChars[i]).join('');
                SoundManager.getInstance().play('button_click');
                HapticManager.getInstance().play('button_click');
              });
          }, (ch: string, index: number) => index.toString());
        }
        .width('100%').padding(10);

        // 已选字预览
        if (this.selectedIndices.length > 0) {
          Row() {
            Text('已选: ').fontSize(this.screen.scaleFont(12)).fontColor('#757575');
            ForEach(this.selectedIndices, (idx: number, index: number) => {
              Text(this.myChars[idx]).fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold)
                .fontColor('#007DFF').margin({ left: 2, right: 2 });
            }, (idx: number, index: number) => index.toString());
            Text(` = "${this.currentWord}"`)
              .fontSize(this.screen.scaleFont(14)).fontColor('#212121').fontWeight(FontWeight.Bold).margin({ left: 8 });
            // 词语长度奖励提示
            if (this.currentWord.length >= 4) {
              Text(` +4分`).fontSize(this.screen.scaleFont(10)).fontColor('#FF6B35');
            } else if (this.currentWord.length >= 3) {
              Text(` +2分`).fontSize(this.screen.scaleFont(10)).fontColor('#FF9900');
            }
          }
          .width('100%').padding({ left: 16, bottom: 4 });
        }

        if (this.errorMsg) {
          Text(this.errorMsg).fontSize(this.screen.scaleFont(12)).fontColor('#FF5252')
            .padding({ left: 16 });
        }

        // 成功反馈
        if (this.lastWordSuccess) {
          Text('✓ 组词成功!').fontSize(this.screen.scaleFont(14)).fontColor('#00C853').fontWeight(FontWeight.Bold)
            .padding({ left: 16, top: 4 });
        }

        // 提示文本
        if (this.hintText) {
          Text(this.hintText).fontSize(this.screen.scaleFont(13)).fontColor('#9C27B0').fontWeight(FontWeight.Medium)
            .padding({ left: 16, top: 4 });
        }

        // 操作按钮
        Row() {
          Button('提示')
            .fontSize(this.screen.scaleFont(13)).backgroundColor('#9C27B020').fontColor('#9C27B0')
            .height(36)
            .enabled(this.isMyTurn)
            .onClick(() => {
              this.showHint();
              SoundManager.getInstance().play('button_click');
            });

          Button('重选')
            .fontSize(this.screen.scaleFont(13)).backgroundColor('#F5F5F5').fontColor('#424242')
            .height(36).margin({ left: 4 })
            .enabled(this.isMyTurn)
            .onClick(() => {
              this.selectedIndices = [];
              this.currentWord = '';
              SoundManager.getInstance().play('button_click');
            });

          Button('跳过')
            .fontSize(this.screen.scaleFont(13)).backgroundColor('#F5F5F5').fontColor('#424242')
            .height(36)
            .enabled(this.isMyTurn).layoutWeight(1).margin({ left: 8 })
            .onClick(() => {
              this.engine.handleInput({ type: 'SKIP_TURN', data: {} });
              this.selectedIndices = [];
              this.currentWord = '';
            });

          Button('确认组词')
            .fontSize(this.screen.scaleFont(14)).backgroundColor('#007DFF').fontColor(Color.White)
            .height(36)
            .enabled(this.isMyTurn && this.currentWord.length >= 2)
            .layoutWeight(1).margin({ left: 8 })
            .onClick(() => {
              const usedCharsCopy: string[] = [];
              for (const idx of this.selectedIndices) { usedCharsCopy.push(this.myChars[idx]); }
              this.engine.handleInput({
                type: 'SUBMIT_WORD',
                data: { word: this.currentWord, usedChars: usedCharsCopy }
              });
              this.selectedIndices = [];
              this.currentWord = '';
              this.errorMsg = '';
              SoundManager.getInstance().play('button_click');
              HapticManager.getInstance().play('tap_medium');
            });
        }
        .width('100%').padding({ left: 16, right: 16, bottom: 12, top: 4 });
          } // end Column inside Scroll
        } // end Scroll
        .layoutWeight(1).width('100%');
      }
    }
    .width('100%').height('100%').backgroundColor('#FAFAFA');
  }

  private showHint(): void {
    if (!this.lastChar) {
      this.hintText = '首回合: 从字母池中组任意词语';
      if (this.hintTimerId) clearTimeout(this.hintTimerId);
      this.hintTimerId = setTimeout(() => { this.hintTimerId = 0; this.hintText = ''; }, 3000);
      return;
    }
    const validWords = this.engine.findValidWords(this.lastChar, this.myChars);
    if (validWords.length > 0) {
      // 显示第一个可用词，遮盖部分字符
      const word = validWords[0];
      const masked = word.charAt(0) + '●'.repeat(word.length - 2) + word.charAt(word.length - 1);
      this.hintText = `提示: 可组 "${masked}" (${word.length}字)`;
    } else {
      this.hintText = '没有可用的词语，请跳过';
    }
    if (this.hintTimerId) clearTimeout(this.hintTimerId);
    this.hintTimerId = setTimeout(() => { this.hintTimerId = 0; this.hintText = ''; }, 3000);
  }
}
