@Component
export struct TutorialOverlay {
  @State currentStep: number = 0;
  @State visible: boolean = true;
  onComplete?: () => void;

  private steps: TutorialStep[] = [
    {
      image: $r('app.media.tutorial_1'),
      title: '选择游戏',
      description: '从4款双人协作小游戏中选择你想玩的'
    },
    {
      image: $r('app.media.tutorial_2'),
      title: '连接设备',
      description: '创建或加入房间，与附近的鸿蒙设备建立连接'
    },
    {
      image: $r('app.media.tutorial_3'),
      title: '开始协作',
      description: '两台设备各司其职，通过默契配合完成挑战!'
    }
  ];

  build() {
    if (this.visible) {
      Stack() {
        Column() {
          Image(this.steps[this.currentStep].image)
            .width('80%').height(240).objectFit(ImageFit.Contain)
            .borderRadius(16).margin({ bottom: 20 });

          Text(this.steps[this.currentStep].title)
            .fontSize(24).fontWeight(FontWeight.Bold)
            .margin({ bottom: 8 });

          Text(this.steps[this.currentStep].description)
            .fontSize(14).fontColor('#757575')
            .textAlign(TextAlign.Center)
            .padding({ left: 24, right: 24 })
            .margin({ bottom: 24 });

          // 步骤指示器
          Row() {
            ForEach([0, 1, 2], (i: number) => {
              Circle({ width: 8, height: 8 })
                .fill(i === this.currentStep ? '#007DFF' : '#E0E0E0')
                .margin({ left: 4, right: 4 });
            }, (i: number) => i.toString());
          }
          .margin({ bottom: 24 });

          Row() {
            if (this.currentStep > 0) {
              Button('上一步')
                .fontSize(14).backgroundColor('#F5F5F5').fontColor('#424242')
                .onClick(() => { this.currentStep--; });
            }

            Button(this.currentStep < 2 ? '下一步' : '开始游戏')
              .fontSize(14).backgroundColor('#007DFF').fontColor(Color.White)
              .margin({ left: 16 })
              .onClick(() => {
                if (this.currentStep < 2) {
                  this.currentStep++;
                } else {
                  this.visible = false;
                  if (this.onComplete) this.onComplete();
                }
              });
          }

          Text('跳过')
            .fontSize(13).fontColor('#9E9E9E')
            .margin({ top: 16 })
            .onClick(() => {
              this.visible = false;
              if (this.onComplete) this.onComplete();
            });
        }
        .width('90%').padding(32)
        .borderRadius(24).backgroundColor(Color.White)
        .shadow({ radius: 16, color: '#20000000' });
      }
      .width('100%').height('100%')
      .backgroundColor('#80000000')
      .alignContent(Alignment.Center);
    }
  }
}

interface TutorialStep {
  image: Resource;
  title: string;
  description: string;
}
