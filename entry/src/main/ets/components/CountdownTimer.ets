@Component
export struct CountdownTimer {
  @Prop totalMs: number = 3000;
  @Prop @Watch('onRemainingChange') remainingMs: number = 3000;
  @Prop sizeValue: number = 48;
  @State private pulseScale: number = 1.0;
  private pulseTimerId: number = 0;

  onRemainingChange(): void {
    if (this.remainingMs <= 5000 && this.remainingMs > 0) {
      if (this.pulseTimerId === 0) {
        this.pulseScale = 1.3;
        this.pulseTimerId = setInterval(() => {
          // 安全检查：如果不再需要脉冲，自动清除
          if (this.remainingMs <= 0 || this.remainingMs > 5000) {
            clearInterval(this.pulseTimerId);
            this.pulseTimerId = 0;
            this.pulseScale = 1.0;
            return;
          }
          this.pulseScale = this.pulseScale > 1.15 ? 1.0 : 1.3;
        }, 500);
      }
    } else {
      if (this.pulseTimerId) {
        clearInterval(this.pulseTimerId);
        this.pulseTimerId = 0;
      }
      this.pulseScale = 1.0;
    }
  }

  aboutToDisappear(): void {
    if (this.pulseTimerId) {
      clearInterval(this.pulseTimerId);
      this.pulseTimerId = 0;
    }
  }

  build() {
    Stack() {
      // 外圈脉冲 (低时间时)
      if (this.remainingMs <= 5000 && this.remainingMs > 0) {
        Circle()
          .width(this.sizeValue + 8).height(this.sizeValue + 8)
          .fill(Color.Transparent)
          .stroke(this.getRingColor())
          .strokeWidth(1)
          .opacity(0.3)
          .scale({ x: this.pulseScale, y: this.pulseScale })
          .animation({ duration: 500, curve: Curve.EaseInOut, iterations: 1 });
      }

      Progress({
        value: this.totalMs > 0 ? (this.remainingMs / this.totalMs) * 100 : 0,
        total: 100,
        type: ProgressType.Ring
      })
        .width(this.sizeValue).height(this.sizeValue)
        .color(this.getRingColor())
        .style({ strokeWidth: 4 });

      Column() {
        Text(`${Math.max(0, Math.ceil(this.remainingMs / 1000))}`)
          .fontSize(this.sizeValue * 0.35).fontWeight(FontWeight.Bold)
          .fontColor(this.getTextColor())
          .animation({ duration: 200, curve: Curve.EaseOut });
        Text('秒')
          .fontSize(10).fontColor('#757575');
      }
    }
    .width(this.sizeValue + 12).height(this.sizeValue + 12);
  }

  private getRingColor(): string {
    if (this.remainingMs <= 5000) return '#FF5252';
    if (this.remainingMs <= 10000) return '#FFD600';
    return '#00C853';
  }

  private getTextColor(): string {
    if (this.remainingMs <= 5000) return '#FF5252';
    return '#212121';
  }
}
