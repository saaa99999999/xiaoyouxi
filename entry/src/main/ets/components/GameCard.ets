import { GameMeta } from '../common/types/GameTypes';
import { resolveGameIcon } from '../common/utils/ResourceUtils';
import { SoundManager } from '../common/manager/SoundManager';
import { ScreenUtils } from '../common/utils/ScreenUtils';

@Component
export struct GameCard {
  @Prop meta: GameMeta;
  @Prop locked: boolean = false;
  onSelect?: (type: string) => void;
  @State private cardScale: number = 1.0;
  private screen = ScreenUtils.getInstance();

  build() {
    Column() {
      Image(resolveGameIcon(this.meta.icon))
        .width(48).height(48)
        .objectFit(ImageFit.Contain)
        .margin({ bottom: 8 });

      Text(this.meta.name)
        .fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
        .fontColor(this.locked ? '#9E9E9E' : '#1A1A1A')
        .margin({ bottom: 4 });

      Text(this.meta.description)
        .fontSize(12).fontColor('#999999')
        .maxLines(2).textAlign(TextAlign.Center)
        .padding({ left: 8, right: 8 });

      if (this.locked) {
        Text('需要解锁')
          .fontSize(11).fontColor('#FF9900').fontWeight(FontWeight.Medium)
          .margin({ top: 8 });
      } else {
        Text(this.meta.duration)
          .fontSize(11).fontColor('#007DFF').fontWeight(FontWeight.Medium)
          .margin({ top: 8 });
      }
    }
    .width(this.screen.isWideScreen() ? '22%' : '46%')
    .padding(16)
    .borderRadius(12).backgroundColor(Color.White)
    .shadow({ radius: 6, color: '#0A000000', offsetY: 2 })
    .opacity(this.locked ? 0.6 : 1.0)
    .scale({ x: this.cardScale, y: this.cardScale })
    .animation({ duration: 150, curve: Curve.EaseOut })
    .onClick(() => {
      if (!this.locked) {
        SoundManager.getInstance().play('button_click');
      }
      if (this.onSelect) this.onSelect(this.meta.type);
    })
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.cardScale = 0.95;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.cardScale = 1.0;
      }
    });
  }
}
