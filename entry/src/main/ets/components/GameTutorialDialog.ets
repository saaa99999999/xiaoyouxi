import { GameType } from '../common/types/GameTypes';
import { SoundManager } from '../common/manager/SoundManager';

/**
 * 游戏玩法说明组件
 *
 * 每个游戏开始前显示简短的规则说明，可跳过。
 * 首次自动显示，之后通过帮助按钮手动触发。
 */
@CustomDialog
export struct GameTutorialDialog {
  @Prop gameType: GameType = GameType.RHYTHM_SYNC;
  controller: CustomDialogController;
  onStart?: () => void;

  build() {
    Column() {
      // 标题
      Text(this.getTitle())
        .fontSize(22).fontWeight(FontWeight.Bold).fontColor('#212121')
        .margin({ bottom: 16 });

      // 规则说明
      Column() {
        ForEach(this.getRules(), (rule: string, index: number) => {
          Row() {
            Text(`${index + 1}`).fontSize(14).fontWeight(FontWeight.Bold)
              .fontColor('#007DFF').width(24).textAlign(TextAlign.Center);
            Text(rule).fontSize(14).fontColor('#424242')
              .layoutWeight(1).margin({ left: 8 });
          }
          .width('100%').alignItems(VerticalAlign.Top)
          .margin({ bottom: 10 });
        }, (rule: string, index: number) => index.toString());
      }
      .width('100%').padding({ left: 16, right: 16 })
      .margin({ bottom: 20 });

      // 提示
      Text(this.getTip())
        .fontSize(12).fontColor('#9E9E9E').fontStyle(FontStyle.Italic)
        .margin({ bottom: 16 });

      // 开始按钮
      Button('开始游戏')
        .width('60%').height(44)
        .fontSize(16).fontWeight(FontWeight.Bold)
        .backgroundColor('#007DFF').fontColor(Color.White)
        .borderRadius(22)
        .onClick(() => {
          SoundManager.getInstance().play('button_click');
          this.controller.close();
          if (this.onStart) this.onStart();
        });
    }
    .padding(24).backgroundColor(Color.White).borderRadius(20)
  }

  private getTitle(): string {
    switch (this.gameType) {
      case GameType.RHYTHM_SYNC: return '🎵 节奏共鸣';
      case GameType.JOINT_DRAWING: return '🎨 合体绘画';
      case GameType.MEMORY_MATCH: return '🧩 记忆碎片';
      case GameType.WORD_CHAIN: return '📖 词语接龙';
      default: return '游戏说明';
    }
  }

  private getRules(): string[] {
    switch (this.gameType) {
      case GameType.RHYTHM_SYNC:
        return [
          '音符从上方下落到判定线，在判定线附近点击对应轨道按钮',
          '判定越精准分数越高：Perfect > Great > Good > Miss',
          '双方同时点击同一音符可获得同步奖励加分',
          '连续精准点击触发 Combo，倍率最高 x5'
        ];
      case GameType.JOINT_DRAWING:
        return [
          '双方在同一画布上合作绘画，各画一半',
          '选择画笔颜色和粗细，用手指在画布上绘制',
          '虚线左侧是你的画板，右侧是对方的画板',
          '画完后点击"完成绘画"，双方都完成后展示作品'
        ];
      case GameType.MEMORY_MATCH:
        return [
          '牌面朝下排列，每回合翻开两张牌',
          '你可以翻开自己区域或对方区域的牌',
          '如果两张牌的图案相同则配对成功，获得分数',
          '配对失败则翻回牌面，轮到对方操作'
        ];
      case GameType.WORD_CHAIN:
        return [
          '从你的字池中点选汉字组成词语',
          '词语必须以上一个词的最后一个字开头',
          '组成的词必须在词库中存在才算有效',
          '超过 3 个字的词语获得额外奖励分'
        ];
      default:
        return ['享受游戏吧！'];
    }
  }

  private getTip(): string {
    switch (this.gameType) {
      case GameType.RHYTHM_SYNC: return '提示: 专注判定线的位置，提前准备点击';
      case GameType.JOINT_DRAWING: return '提示: 先看主题再动笔，和搭档配合效果更好';
      case GameType.MEMORY_MATCH: return '提示: 记住对方翻开过的牌，协作配对更高效';
      case GameType.WORD_CHAIN: return '提示: 优先组 3 字以上的词，奖励更多';
      default: return '';
    }
  }
}
