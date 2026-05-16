import { ConnectionState } from '../common/types/GameTypes';

@Component
export struct ConnectionStatus {
  @Prop state: ConnectionState = ConnectionState.IDLE;
  @Prop partnerName: string = '';

  build() {
    Row() {
      Circle({ width: 10, height: 10 })
        .fill(this.getStatusColor());

      Text(this.getStatusText())
        .fontSize(13).fontColor('#424242')
        .margin({ left: 6 });

      Blank();

      if (this.partnerName) {
        Text(this.partnerName)
          .fontSize(12).fontColor('#007DFF');
      }
    }
    .width('100%').padding({ left: 16, right: 16, top: 8, bottom: 8 })
    .backgroundColor(this.getBgColor())
    .borderRadius(8);
  }

  private getStatusColor(): string {
    switch (this.state) {
      case ConnectionState.CONNECTED: return '#00C853';
      case ConnectionState.CONNECTING:
      case ConnectionState.DISCOVERING:
      case ConnectionState.RECONNECTING: return '#FFD600';
      case ConnectionState.DISCONNECTED:
      case ConnectionState.ERROR: return '#FF5252';
      default: return '#BDBDBD';
    }
  }

  private getStatusText(): string {
    switch (this.state) {
      case ConnectionState.IDLE: return '未连接';
      case ConnectionState.DISCOVERING: return '正在扫描...';
      case ConnectionState.CONNECTING: return '正在连接...';
      case ConnectionState.CONNECTED: return '已连接';
      case ConnectionState.DISCONNECTED: return '已断开';
      case ConnectionState.RECONNECTING: return '重连中...';
      case ConnectionState.ERROR: return '连接错误';
      default: return '未知';
    }
  }

  private getBgColor(): string {
    switch (this.state) {
      case ConnectionState.CONNECTED: return '#E8F5E9';
      case ConnectionState.CONNECTING:
      case ConnectionState.DISCOVERING:
      case ConnectionState.RECONNECTING: return '#FFF8E1';
      case ConnectionState.ERROR:
      case ConnectionState.DISCONNECTED: return '#FFEBEE';
      default: return '#F5F5F5';
    }
  }
}
