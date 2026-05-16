import router from '@ohos.router';
import Want from '@ohos.app.ability.Want';
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';
import { DeviceManager } from '../common/manager/DeviceManager';
import { SessionManager } from '../common/manager/SessionManager';
import { SyncManager } from '../common/manager/SyncManager';
import { AppContext } from '../common/manager/AppContext';
import { DeviceInfo, ConnectionState, DeviceRole, PlayerInfo, SessionHandshake } from '../common/types/GameTypes';
import { DeviceList } from '../components/DeviceList';
import { SoundManager } from '../common/manager/SoundManager';
import { Logger } from '../common/utils/Logger';
import { ScreenUtils } from '../common/utils/ScreenUtils';
import { ThemeManager } from '../common/manager/ThemeManager';
import { LightTheme, AppTheme } from '../constants/UIConstants';

const DISTRIBUTED_PERMISSION: Permissions = 'ohos.permission.DISTRIBUTED_DATASYNC';

@Entry
@Component
struct DeviceConnectPage {
  @State connectionState: ConnectionState = ConnectionState.IDLE;
  @State devices: DeviceInfo[] = [];
  @State selectedDevice: DeviceInfo | null = null;
  @State roomCode: string = '';
  @State mode: 'host' | 'guest' = 'host';
  @State isScanning: boolean = false;
  @State statusText: string = '';
  @State connectMethod: number = 3;
  @State nfcStatusText: string = '';
  private dm = DeviceManager.getInstance();
  private sm = SessionManager.getInstance();
  private sync = SyncManager.getInstance();
  private connectTimeoutId: number = 0;
  private nfcConnectTimeoutId: number = 0;
  private hasNavigatedBack: boolean = false;
  private screen = ScreenUtils.getInstance();
  @StorageLink('currentTheme') currentTheme: AppTheme = LightTheme;
  private getTheme(): AppTheme { return this.currentTheme || LightTheme; }

  aboutToAppear(): void {
    AppStorage.setOrCreate('currentTheme', ThemeManager.getInstance().getTheme());
    const params = router.getParams() as Record<string, number | string | boolean | Object | undefined>;
    if (params && params['mode']) this.mode = params['mode'] as 'host' | 'guest';
    this.statusText = this.mode === 'host' ? '创建房间等待对方加入' : '输入房间码加入游戏';
  }

  aboutToDisappear(): void {
    this.dm.stopDiscovery();
    this.sync.offDataChange('hs_guest');
    this.sync.offDataChange('hs_host');
    this.sync.offStatusChange();
    this.clearConnectTimeout();
    if (this.nfcConnectTimeoutId) {
      clearTimeout(this.nfcConnectTimeoutId);
      this.nfcConnectTimeoutId = 0;
    }
  }

  build() {
    Column() {
      // 导航栏
      Row() {
        Text('←').fontSize(this.screen.scaleFont(22)).fontColor(this.getTheme().textPrimary)
          .onClick(() => { router.back(); });
        Blank();
        Text(this.mode === 'host' ? '创建房间' : '加入房间')
          .fontSize(this.screen.scaleFont(18)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary);
        Blank();
        Row().width(22);
      }
      .width('100%').padding({ left: 16, right: 16, top: 12, bottom: 12 });

      // 方式选择
      Row() {
        ForEach(['碰一碰', '房间码', '扫描', '本地对战'], (label: string, index: number) => {
          Text(label)
            .fontSize(this.screen.scaleFont(13)).fontWeight(this.connectMethod === index ? FontWeight.Bold : FontWeight.Normal)
            .fontColor(this.connectMethod === index ? '#FFFFFF' : this.getTheme().textSecondary)
            .padding({ left: 14, right: 14, top: 8, bottom: 8 })
            .borderRadius(20)
            .backgroundColor(this.connectMethod === index ? this.getTheme().brandBlue : this.getTheme().divider)
            .onClick(() => {
              this.connectMethod = index;
              if (index === 2) this.startScan();
              SoundManager.getInstance().play('button_click');
            });
        }, (label: string, index: number) => index.toString());
      }
      .width('100%').padding({ left: 16, right: 16, top: 8, bottom: 16 })
      .justifyContent(FlexAlign.Center);

      // 内容区
      if (this.connectMethod === 0) {
        // NFC
        Column() {
          Text('📱').fontSize(this.screen.scaleFont(64)).margin({ top: 40, bottom: 20 });
          Text('碰一碰连接').fontSize(this.screen.scaleFont(20)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary)
            .margin({ bottom: 10 });
          Text('将两台设备背部轻轻碰触\n系统会自动发现并配对')
            .fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textSecondary).textAlign(TextAlign.Center).lineHeight(22);
          Text(this.nfcStatusText)
            .fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().brandBlue).fontWeight(FontWeight.Medium)
            .margin({ top: 20 });
        }
        .width('100%').layoutWeight(1).alignItems(HorizontalAlign.Center);

        Row() {
          Button('开始碰一碰配对')
            .fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
            .backgroundColor(this.getTheme().brandBlue).fontColor(Color.White)
            .height(48).borderRadius(24).layoutWeight(1)
            .margin({ left: 20, right: 20 })
            .onClick(() => { this.startNfcPairing(); });
        }
        .padding({ bottom: 20 });
      } else if (this.connectMethod === 1) {
        // 房间码
        Column() {
          Row() {
            Text('创建').fontSize(this.screen.scaleFont(14))
              .fontColor(this.mode === 'host' ? this.getTheme().brandBlue : this.getTheme().textSecondary)
              .fontWeight(this.mode === 'host' ? FontWeight.Bold : FontWeight.Normal)
              .padding({ left: 24, right: 24, top: 8, bottom: 8 })
              .backgroundColor(this.mode === 'host' ? '#007DFF10' : Color.Transparent)
              .borderRadius(20)
              .onClick(() => { this.mode = 'host'; this.statusText = '创建房间等待对方加入'; SoundManager.getInstance().play('button_click'); });
            Text('加入').fontSize(this.screen.scaleFont(14))
              .fontColor(this.mode === 'guest' ? this.getTheme().brandBlue : this.getTheme().textSecondary)
              .fontWeight(this.mode === 'guest' ? FontWeight.Bold : FontWeight.Normal)
              .padding({ left: 24, right: 24, top: 8, bottom: 8 })
              .backgroundColor(this.mode === 'guest' ? '#007DFF10' : Color.Transparent)
              .borderRadius(20)
              .margin({ left: 8 })
              .onClick(() => { this.mode = 'guest'; this.statusText = '输入房间码加入游戏'; SoundManager.getInstance().play('button_click'); });
          }
          .margin({ top: 16, bottom: 24 });

          if (this.mode === 'guest') {
            Column() {
              Text('输入房间码').fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textSecondary).margin({ bottom: 12 });
              TextInput({ placeholder: '请输入4位房间码', text: this.roomCode })
                .fontSize(this.screen.scaleFont(28)).fontWeight(FontWeight.Bold).letterSpacing(12).maxLength(4)
                .textAlign(TextAlign.Center)
                .width('65%').height(56)
                .backgroundColor(this.getTheme().bgPrimary).borderRadius(12)
                .onChange((value: string) => { this.roomCode = value.toUpperCase(); });
            }
            .alignItems(HorizontalAlign.Center);
          } else if (this.roomCode) {
            Column() {
              Text('房间码').fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textSecondary).margin({ bottom: 8 });
              Text(this.roomCode).fontSize(this.screen.scaleFont(48)).fontWeight(FontWeight.Bold)
                .fontColor(this.getTheme().brandBlue).letterSpacing(12);
              Text('告诉好友输入此房间码').fontSize(this.screen.scaleFont(12)).fontColor(this.getTheme().textSecondary).margin({ top: 8 });
            }
            .alignItems(HorizontalAlign.Center).margin({ top: 20 });
          }

          Text(this.statusText).fontSize(this.screen.scaleFont(13)).fontColor(this.getTheme().textSecondary).margin({ top: 20 });
        }
        .layoutWeight(1).alignItems(HorizontalAlign.Center);

        Row() {
          Button(this.mode === 'host' ? '创建房间' : '加入房间')
            .fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
            .backgroundColor(this.getTheme().brandBlue).fontColor(Color.White)
            .height(48).borderRadius(24).layoutWeight(1)
            .margin({ left: 20, right: 20 })
            .onClick(() => { this.connectDistributed(); });
        }
        .padding({ bottom: 20 });
      } else if (this.connectMethod === 2) {
        // 扫描
        Column() {
          Text(this.statusText).fontSize(this.screen.scaleFont(13)).fontColor(this.getTheme().textSecondary).margin({ top: 16, bottom: 12 });
          DeviceList({
            devices: this.devices,
            selectedId: this.selectedDevice ? this.selectedDevice.deviceId : '',
            onDeviceSelect: (device: DeviceInfo) => { this.selectedDevice = device; }
          });
        }
        .layoutWeight(1);

        Row() {
          Button(this.isScanning ? '停止扫描' : '刷新')
            .fontSize(this.screen.scaleFont(14)).backgroundColor(this.getTheme().bgPrimary).fontColor(this.getTheme().textPrimary)
            .height(40).borderRadius(20)
            .onClick(() => {
              if (this.isScanning) { this.dm.stopDiscovery(); this.isScanning = false; }
              else { this.startScan(); }
            });
          Button('确认连接')
            .fontSize(this.screen.scaleFont(15)).fontWeight(FontWeight.Medium)
            .backgroundColor(this.getTheme().brandBlue).fontColor(Color.White)
            .height(40).borderRadius(20).layoutWeight(1).margin({ left: 12 })
            .onClick(() => { this.connectDistributed(); });
        }
        .width('100%').padding({ left: 20, right: 20, bottom: 20 });
      } else {
        // 本地对战
        Column() {
          Text('🎮').fontSize(this.screen.scaleFont(64)).margin({ top: 40, bottom: 20 });
          Text('本地双人对战').fontSize(this.screen.scaleFont(20)).fontWeight(FontWeight.Bold).fontColor(this.getTheme().textPrimary)
            .margin({ bottom: 10 });
          Text('在同一台设备上轮流操作\n适合模拟器测试和面对面对战')
            .fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().textSecondary).textAlign(TextAlign.Center).lineHeight(22);
          Text(this.statusText)
            .fontSize(this.screen.scaleFont(14)).fontColor(this.getTheme().brandBlue).fontWeight(FontWeight.Medium)
            .margin({ top: 20 });
        }
        .width('100%').layoutWeight(1).alignItems(HorizontalAlign.Center);

        Row() {
          Button('开始本地对战')
            .fontSize(this.screen.scaleFont(16)).fontWeight(FontWeight.Bold)
            .backgroundColor(this.getTheme().accentOrange).fontColor(Color.White)
            .height(48).borderRadius(24).layoutWeight(1)
            .margin({ left: 20, right: 20 })
            .onClick(() => { this.connectLocal(); });
        }
        .padding({ bottom: 20 });
      }
    }
    .width('100%').height('100%').backgroundColor(this.getTheme().bgCard);
  }

  // ============ 本地对战 ============

  private connectLocal(): void {
    try {
      this.connectionState = ConnectionState.CONNECTING;
      this.clearConnectTimeout();
      this.hasNavigatedBack = false;
      const code = this.sm.createRoom();
      this.roomCode = code;
      this.sync.createLocalSession(code);
      const guestPlayer: PlayerInfo = { deviceId: 'local-guest', deviceName: '玩家2', role: DeviceRole.GUEST, isReady: true };
      this.sm.onGuestJoined(guestPlayer);
      this.sync.set('hs_host', this.buildHandshake('host_ready'));
      this.sync.set('hs_guest', { type: 'guest_join', sessionId: code, from: DeviceRole.GUEST, player: guestPlayer, timestamp: Date.now() } as SessionHandshake);
      this.markConnected('本地对战已就绪');
    } catch (err) {
      Logger.error('DeviceConnectPage', 'connectLocal failed', err);
      this.connectionState = ConnectionState.ERROR;
      this.statusText = '本地对战启动失败';
    }
  }

  // ============ 分布式连接 ============

  private startNfcPairing(): void {
    this.nfcStatusText = '正在发现设备...';
    this.connectionState = ConnectionState.DISCOVERING;
    SoundManager.getInstance().play('device_connect');
    try {
      if (this.mode === 'host') {
        this.createHostSession();
        this.nfcStatusText = `房间码: ${this.roomCode}\n将对方设备碰触本机背部`;
      }
      this.dm.startDiscovery((device: DeviceInfo) => {
        this.nfcStatusText = `发现设备: ${device.deviceName}`;
        SoundManager.getInstance().play('device_connect');
        this.selectedDevice = device;
        if (this.nfcConnectTimeoutId) clearTimeout(this.nfcConnectTimeoutId);
        this.nfcConnectTimeoutId = setTimeout(() => { this.nfcConnectTimeoutId = 0; this.connectDistributed(); }, 500);
      });
    } catch (err) {
      this.nfcStatusText = 'NFC 不可用，请尝试房间码方式';
      this.connectionState = ConnectionState.IDLE;
    }
  }

  private startScan(): void {
    if (this.isScanning) this.dm.stopDiscovery();
    this.isScanning = true;
    this.connectionState = ConnectionState.DISCOVERING;
    this.statusText = '正在扫描附近设备...';
    try {
      this.dm.startDiscovery((device: DeviceInfo) => {
        const exists = this.devices.find(d => d.deviceId === device.deviceId);
        if (!exists) {
          const newList: DeviceInfo[] = [];
          for (const d of this.devices) { newList.push(d); }
          newList.push(device);
          this.devices = newList;
        }
        this.statusText = `发现 ${this.devices.length} 台设备`;
      });
    } catch (err) {
      this.statusText = '扫描失败，模拟器不支持设备发现';
      this.isScanning = false;
      this.connectionState = ConnectionState.IDLE;
    }
  }

  private async connectDistributed(): Promise<void> {
    this.connectionState = ConnectionState.CONNECTING;
    this.clearConnectTimeout();
    this.hasNavigatedBack = false;
    const ctx = AppContext.getInstance().get();
    if (!ctx) { this.statusText = '应用未初始化，请重启'; this.connectionState = ConnectionState.ERROR; return; }
    const granted = await AppContext.getInstance().requestPermission(DISTRIBUTED_PERMISSION);
    if (!granted) { this.connectionState = ConnectionState.ERROR; this.showPermissionDialog(); return; }
    if (this.mode === 'host') this.createHostSession();
    else this.joinGuestSession();
  }

  private createHostSession(): void {
    try {
      const ctx = AppContext.getInstance().get();
      if (!this.sync.isSessionActive() && ctx) { this.sync.init(ctx); }
      const code = this.sm.createRoom();
      this.roomCode = code;
      this.sync.createSession(code, { hs_host: this.buildHandshake('host_ready'), hs_guest: {} });
      this.registerDistributedHandlers();
      this.sync.set('hs_host', this.buildHandshake('host_ready'));
      this.connectionState = ConnectionState.CONNECTING;
      this.statusText = `房间码: ${code} — 等待对方加入`;
      this.startConnectTimeout('等待超时，请确认对方输入了正确房间码');
    } catch (err) {
      Logger.error('DeviceConnectPage', 'createHostSession failed', err);
      this.connectionState = ConnectionState.ERROR;
      this.showPermissionDialog();
    }
  }

  private joinGuestSession(): void {
    const code = this.roomCode.trim().toUpperCase();
    if (!code || code.length !== 4) { this.statusText = '请输入4位房间码'; this.connectionState = ConnectionState.IDLE; return; }
    this.roomCode = code;
    try {
      const ctx = AppContext.getInstance().get();
      if (!this.sync.isSessionActive() && ctx) { this.sync.init(ctx); }
      this.sm.joinRoom(code);
      this.sync.createSession(code, { hs_host: {}, hs_guest: this.buildHandshake('guest_join') });
      this.registerDistributedHandlers();
      this.sync.set('hs_guest', this.buildHandshake('guest_join'));
      this.connectionState = ConnectionState.CONNECTING;
      this.statusText = '已发送加入请求，等待确认';
      this.startConnectTimeout('连接超时，请检查房间码');
    } catch (err) {
      Logger.error('DeviceConnectPage', 'joinGuestSession failed', err);
      this.connectionState = ConnectionState.ERROR;
      this.showPermissionDialog();
    }
  }

  private registerDistributedHandlers(): void {
    this.sync.offDataChange('hs_guest');
    this.sync.offDataChange('hs_host');
    this.sync.offStatusChange();
    this.sync.onDataChange('hs_guest', (_key: string, value: Object) => { this.handleHandshake(value as SessionHandshake); });
    this.sync.onDataChange('hs_host', (_key: string, value: Object) => { this.handleHandshake(value as SessionHandshake); });
    this.sync.onStatusChange((status: string) => {
      if (status === 'online') { this.statusText = this.mode === 'host' ? `房间码: ${this.roomCode} — 对方在线` : '设备在线，等待确认'; }
      else if (status === 'offline') { this.connectionState = ConnectionState.DISCONNECTED; this.statusText = '对方设备离线'; }
    });
  }

  private showPermissionDialog(): void {
    AlertDialog.show({
      title: '需要设备协同权限',
      message: '创建房间需要"分布式数据同步"权限。\n\n点击"授权"弹出系统授权对话框。',
      alignment: DialogAlignment.Center,
      primaryButton: { value: '授权', action: async () => {
        const granted = await AppContext.getInstance().requestPermission(DISTRIBUTED_PERMISSION);
        if (granted) { this.connectionState = ConnectionState.IDLE; this.connectDistributed(); }
        else { this.statusText = '授权被拒绝，可使用"本地对战"模式'; this.showSettingsFallbackDialog(); }
      }},
      secondaryButton: { value: '取消', action: () => { this.statusText = '需要授权才能创建/加入房间'; } }
    });
  }

  private showSettingsFallbackDialog(): void {
    AlertDialog.show({
      title: '手动授权',
      message: '自动授权未成功。\n\n请前往 系统设置 > 应用 > 默契挑战 > 权限 中手动开启"分布式数据同步"。\n\n或使用"本地对战"模式，无需权限。',
      alignment: DialogAlignment.Center,
      primaryButton: { value: '去设置', action: () => { this.openAppSettings(); } },
      secondaryButton: { value: '取消', action: () => { this.statusText = '需要授权才能创建/加入房间'; } }
    });
  }

  private openAppSettings(): void {
    try {
      const want: Want = { bundleName: 'com.ohos.settings', abilityName: 'com.ohos.settings.MainAbility', parameters: {} };
      AppContext.getInstance().startAbility(want);
    } catch (err) {
      Logger.error('DeviceConnectPage', 'openAppSettings failed', err);
      this.statusText = '无法打开设置，请手动前往 系统设置 > 应用 > 默契挑战 > 权限';
    }
  }

  private handleHandshake(handshake: SessionHandshake): void {
    try {
      if (!handshake || !handshake.type || handshake.sessionId !== this.roomCode) return;
      const myRole = this.mode === 'host' ? DeviceRole.HOST : DeviceRole.GUEST;
      if (handshake.from === myRole) return;
      if (this.mode === 'host' && handshake.type === 'guest_join') {
        this.sm.onGuestJoined(handshake.player);
        this.sync.set('hs_host', this.buildHandshake('guest_ack'));
        this.markConnected('对方已加入');
      }
      if (this.mode === 'guest' && (handshake.type === 'host_ready' || handshake.type === 'guest_ack')) {
        this.sm.confirmJoined(handshake.player);
        if (handshake.type === 'host_ready') { this.sync.set('hs_guest', this.buildHandshake('guest_join')); }
        this.markConnected('连接成功');
      }
    } catch (err) { Logger.error('DeviceConnectPage', 'handleHandshake failed', err); }
  }

  private buildHandshake(type: 'host_ready' | 'guest_join' | 'guest_ack'): SessionHandshake {
    const player = this.getLocalPlayer(type === 'guest_join' ? DeviceRole.GUEST : DeviceRole.HOST);
    return { type, sessionId: this.roomCode || this.sm.getSessionId(), from: player.role, player, timestamp: Date.now() };
  }

  private getLocalPlayer(role: DeviceRole): PlayerInfo {
    const info = this.sm.getMyInfo();
    if (info) return { deviceId: info.deviceId, deviceName: info.deviceName, role, isReady: true };
    return { deviceId: `local-${Date.now()}`, deviceName: '本机设备', role, isReady: true };
  }

  private markConnected(message: string): void {
    this.clearConnectTimeout();
    this.connectionState = ConnectionState.CONNECTED;
    this.statusText = message;
    if (this.hasNavigatedBack) return;
    this.hasNavigatedBack = true;
    this.connectTimeoutId = setTimeout(() => { try { router.back(); } catch (_e) { /* ignore */ } }, 800);
  }

  private startConnectTimeout(message: string): void {
    this.connectTimeoutId = setTimeout(() => {
      if (this.connectionState === ConnectionState.CONNECTING) { this.connectionState = ConnectionState.ERROR; this.statusText = message; }
    }, 30000);
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutId) { clearTimeout(this.connectTimeoutId); this.connectTimeoutId = 0; }
  }
}
