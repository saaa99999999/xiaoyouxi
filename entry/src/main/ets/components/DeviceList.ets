import { DeviceInfo } from '../common/types/GameTypes';
import { resolveImage } from '../common/utils/ResourceUtils';

@Component
export struct DeviceList {
  @Prop devices: DeviceInfo[] = [];
  @Prop selectedId: string = '';
  onDeviceSelect?: (device: DeviceInfo) => void;

  build() {
    if (this.devices.length === 0) {
      Column() {
        Image(resolveImage('app.media.empty_state'))
          .width(120).height(120).objectFit(ImageFit.Contain)
          .opacity(0.4).margin({ bottom: 12 });
        Text('未发现附近鸿蒙设备')
          .fontSize(14).fontColor('#9E9E9E');
        Text('请确保两台设备登录同一华为账号\n且在同一WiFi网络下')
          .fontSize(12).fontColor('#BDBDBD')
          .textAlign(TextAlign.Center).margin({ top: 4 });
      }
      .width('100%').padding(32).justifyContent(FlexAlign.Center);
    } else {
      List() {
        ForEach(this.devices, (device: DeviceInfo) => {
          ListItem() {
            Row() {
              Column() {
                Text(device.deviceName)
                  .fontSize(16).fontWeight(FontWeight.Medium);
                Text(this.getTypeLabel(device.deviceType))
                  .fontSize(12).fontColor('#757575');
              }.alignItems(HorizontalAlign.Start);

              Blank();

              if (this.selectedId === device.deviceId) {
                Text('已选择')
                  .fontSize(12).fontColor(Color.White)
                  .padding({ left: 12, right: 12, top: 4, bottom: 4 })
                  .borderRadius(12).backgroundColor('#007DFF');
              }
            }
            .width('100%').padding(16)
            .borderRadius(12).backgroundColor(Color.White)
            .margin({ bottom: 8 })
            .onClick(() => {
              if (this.onDeviceSelect) this.onDeviceSelect(device);
            });
          }
        }, (device: DeviceInfo) => device.deviceId);
      }
      .width('100%').layoutWeight(1);
    }
  }

  private getTypeLabel(type: string): string {
    switch (type) {
      case 'phone': return '手机';
      case 'tablet': return '平板';
      case '2in1': return '折叠屏';
      default: return '未知设备';
    }
  }
}
