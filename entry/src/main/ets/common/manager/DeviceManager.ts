import common from '@ohos.app.ability.common';
import deviceManager from '@ohos.distributedDeviceManager';
import { DeviceInfo, ConnectionState } from '../types/GameTypes';
import { DEVICE_SCAN_TIMEOUT_MS } from '../../constants/GameConstants';
import { Logger } from '../utils/Logger';

/**
 * 设备发现与连接管理器
 *
 * 封装 @ohos.distributedDeviceManager (OpenHarmony API 12)，提供:
 * - 已信任设备列表获取
 * - 附近设备扫描
 * - 设备状态事件监听
 */
export class DeviceManager {
  private static instance: DeviceManager;
  private dmInstance: deviceManager.DeviceManager | null = null;
  private discoveredDevices: Record<string, DeviceInfo> = {};
  private discoveryCallback?: (device: DeviceInfo) => void;
  private stateChangeCallback?: (state: ConnectionState) => void;

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager();
    }
    return DeviceManager.instance;
  }

  async init(context: common.Context): Promise<void> {
    try {
      const bundleName = context.applicationInfo.name;
      this.dmInstance = deviceManager.createDeviceManager(bundleName);

      if (!this.dmInstance) return;

      this.dmInstance.on('deviceStateChange', (data: { action: deviceManager.DeviceStateChange; device: deviceManager.DeviceBasicInfo }) => {
        const deviceId = data.device?.deviceId || '';
        Logger.info('DeviceManager', `Device state changed: ${data.action}, deviceId: ${deviceId}`);
        if (data.action === deviceManager.DeviceStateChange.UNAVAILABLE) {
          delete this.discoveredDevices[deviceId];
          if (this.stateChangeCallback) {
            this.stateChangeCallback(ConnectionState.DISCONNECTED);
          }
        }
      });

      this.dmInstance.on('discoverSuccess', (data: { device: deviceManager.DeviceBasicInfo }) => {
        const device = data.device;
        const info: DeviceInfo = {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          deviceType: this.mapDeviceType(device.deviceType),
          networkId: device.networkId || ''
        };
        this.discoveredDevices[device.deviceId] = info;
        if (this.discoveryCallback) {
          this.discoveryCallback(info);
        }
        Logger.info('DeviceManager', `Device found: ${device.deviceName}`);
      });

      Logger.info('DeviceManager', 'Initialized');
    } catch (err) {
      Logger.error('DeviceManager', 'Init failed', err);
    }
  }

  getTrustedDevices(): DeviceInfo[] {
    if (!this.dmInstance) return [];
    try {
      const devices = this.dmInstance.getAvailableDeviceListSync();
      return devices.map(d => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        deviceType: this.mapDeviceType(d.deviceType),
        networkId: d.networkId || ''
      }));
    } catch (err) {
      Logger.error('DeviceManager', 'getTrustedDevices failed', err);
      return [];
    }
  }

  startDiscovery(callback: (device: DeviceInfo) => void): void {
    if (!this.dmInstance) {
      Logger.error('DeviceManager', 'Not initialized');
      return;
    }
    this.discoveryCallback = callback;
    this.discoveredDevices = {};

    try {
      this.dmInstance.startDiscovering({
        discoverTargetType: 1
      });
      Logger.info('DeviceManager', 'Discovery started');

      setTimeout(() => {
        this.stopDiscovery();
      }, DEVICE_SCAN_TIMEOUT_MS);
    } catch (err) {
      Logger.error('DeviceManager', 'startDiscovery failed', err);
    }
  }

  stopDiscovery(): void {
    if (this.dmInstance) {
      try {
        this.dmInstance.stopDiscovering();
        Logger.info('DeviceManager', 'Discovery stopped');
      } catch (err) {
        Logger.error('DeviceManager', 'stopDiscovery failed', err);
      }
    }
  }

  getLocalDeviceInfo(): DeviceInfo | null {
    if (!this.dmInstance) return null;
    try {
      const deviceId = this.dmInstance.getLocalDeviceId();
      const deviceName = this.dmInstance.getLocalDeviceName();
      const deviceTypeNum = this.dmInstance.getLocalDeviceType();
      return {
        deviceId: deviceId,
        deviceName: deviceName,
        deviceType: this.mapDeviceTypeFromNum(deviceTypeNum),
        networkId: this.dmInstance.getLocalDeviceNetworkId()
      };
    } catch (err) {
      Logger.error('DeviceManager', 'getLocalDeviceInfo failed', err);
      return null;
    }
  }

  getDiscoveredDevices(): DeviceInfo[] {
    const result: DeviceInfo[] = [];
    const keys = Object.keys(this.discoveredDevices);
    for (const key of keys) {
      const d = this.discoveredDevices[key];
      if (d) result.push(d);
    }
    return result;
  }

  onConnectionStateChange(callback: (state: ConnectionState) => void): void {
    this.stateChangeCallback = callback;
  }

  destroy(): void {
    this.stopDiscovery();
    this.discoveryCallback = undefined;
    this.stateChangeCallback = undefined;
    this.discoveredDevices = {};
    if (this.dmInstance) {
      try { deviceManager.releaseDeviceManager(this.dmInstance); } catch (_e) { /* ignore */ }
    }
    this.dmInstance = null;
  }

  private mapDeviceType(type: string): 'phone' | 'tablet' | '2in1' | 'unknown' {
    if (type === 'phone') return 'phone';
    if (type === 'tablet') return 'tablet';
    if (type === '2in1') return '2in1';
    return 'unknown';
  }

  private mapDeviceTypeFromNum(type: number): 'phone' | 'tablet' | '2in1' | 'unknown' {
    switch (type) {
      case 0x00E: return 'phone';
      case 0x011: return 'tablet';
      case 0x0A2: return '2in1';
      default: return 'unknown';
    }
  }
}
