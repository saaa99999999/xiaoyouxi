import { SessionState, DeviceRole, GameType, PlayerInfo } from '../types/GameTypes';
import { RECONNECT_TIMEOUT_MS } from '../../constants/GameConstants';
import { Logger } from '../utils/Logger';

/**
 * 会话状态机
 *
 * 管理整个多设备协作会话的生命周期:
 * IDLE → HOSTING/JOINING → CONNECTED → IN_GAME → DISCONNECTED → IDLE
 */
export class SessionManager {
  private static instance: SessionManager;
  private state: SessionState = SessionState.IDLE;
  private sessionId: string = '';
  private host: PlayerInfo | null = null;
  private guest: PlayerInfo | null = null;
  private myInfo: PlayerInfo | null = null;
  private reconnectTimerId: number | null = null;
  private stateChangeListeners: Array<(oldState: SessionState, newState: SessionState) => void> = [];

  private static readonly VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
    [SessionState.IDLE]: [SessionState.HOSTING, SessionState.JOINING, SessionState.IN_GAME],
    [SessionState.HOSTING]: [SessionState.CONNECTED, SessionState.IDLE],
    [SessionState.JOINING]: [SessionState.CONNECTED, SessionState.IDLE],
    [SessionState.CONNECTED]: [SessionState.IN_GAME, SessionState.IDLE],
    [SessionState.IN_GAME]: [SessionState.CONNECTED, SessionState.DISCONNECTED, SessionState.IDLE],
    [SessionState.DISCONNECTED]: [SessionState.IN_GAME, SessionState.IDLE]
  };

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  init(myInfo: PlayerInfo): void {
    this.myInfo = myInfo;
    Logger.info('SessionManager', `Initialized as: ${myInfo.deviceName}`);
  }

  createRoom(): string {
    // 如果不在 IDLE 状态，先重置（防止闪退）
    if (this.state !== SessionState.IDLE) {
      this.cancelReconnectTimer();
      this.sessionId = '';
      this.host = null;
      this.guest = null;
      this.state = SessionState.IDLE;
    }
    this.assertTransition(SessionState.HOSTING);
    this.sessionId = this.generateRoomCode();
    const info = this.ensureMyInfo();
    this.host = {
      deviceId: info.deviceId,
      deviceName: info.deviceName,
      role: DeviceRole.HOST,
      isReady: true
    };
    this.guest = null;
    this.transitionTo(SessionState.HOSTING);
    Logger.info('SessionManager', `Room created: ${this.sessionId}`);
    return this.sessionId;
  }

  joinRoom(sessionId: string): void {
    // 如果不在 IDLE 状态，先重置（防止闪退）
    if (this.state !== SessionState.IDLE) {
      this.cancelReconnectTimer();
      this.sessionId = '';
      this.host = null;
      this.guest = null;
      this.state = SessionState.IDLE;
    }
    this.assertTransition(SessionState.JOINING);
    this.sessionId = sessionId;
    this.host = null;
    const info = this.ensureMyInfo();
    this.guest = {
      deviceId: info.deviceId,
      deviceName: info.deviceName,
      role: DeviceRole.GUEST,
      isReady: true
    };
    this.transitionTo(SessionState.JOINING);
    Logger.info('SessionManager', `Joining room: ${sessionId}`);
  }

  confirmJoined(hostInfo: PlayerInfo): void {
    if (this.state !== SessionState.JOINING) {
      Logger.warn('SessionManager', 'confirmJoined called in wrong state');
      return;
    }
    this.host = {
      deviceId: hostInfo.deviceId,
      deviceName: hostInfo.deviceName,
      role: DeviceRole.HOST,
      isReady: true
    };
    this.transitionTo(SessionState.CONNECTED);
    Logger.info('SessionManager', `Joined room: ${this.sessionId}`);
  }

  onGuestJoined(guestInfo: PlayerInfo): void {
    if (this.state !== SessionState.HOSTING) {
      Logger.warn('SessionManager', 'onGuestJoined called in wrong state');
      return;
    }
    this.guest = {
      deviceId: guestInfo.deviceId,
      deviceName: guestInfo.deviceName,
      role: DeviceRole.GUEST,
      isReady: true
    };
    this.transitionTo(SessionState.CONNECTED);
  }

  startGame(gameType: GameType): void {
    this.assertTransition(SessionState.IN_GAME);
    if (this.state === SessionState.IDLE && this.myInfo) {
      this.sessionId = `solo-${Date.now()}`;
      this.host = {
        deviceId: this.myInfo.deviceId,
        deviceName: this.myInfo.deviceName,
        role: DeviceRole.HOST,
        isReady: true
      };
      this.guest = null;
    }
    this.transitionTo(SessionState.IN_GAME);
  }

  endGame(): void {
    if (this.state !== SessionState.IN_GAME) return;
    if (this.guest) {
      this.assertTransition(SessionState.CONNECTED);
      this.transitionTo(SessionState.CONNECTED);
    } else {
      this.transitionTo(SessionState.IDLE);
    }
  }

  handleDisconnect(): void {
    if (this.state !== SessionState.IN_GAME) return;
    this.transitionTo(SessionState.DISCONNECTED);
    this.startReconnectTimer();
  }

  handleReconnect(): void {
    if (this.state !== SessionState.DISCONNECTED) return;
    this.cancelReconnectTimer();
    this.transitionTo(SessionState.IN_GAME);
  }

  leaveSession(): void {
    this.cancelReconnectTimer();
    this.sessionId = '';
    this.host = null;
    this.guest = null;
    this.transitionTo(SessionState.IDLE);
  }

  getState(): SessionState { return this.state; }
  getSessionId(): string { return this.sessionId; }
  getMyInfo(): PlayerInfo | null { return this.myInfo; }
  getHostInfo(): PlayerInfo | null { return this.host; }
  getGuestInfo(): PlayerInfo | null { return this.guest; }

  getMyRole(): DeviceRole | null {
    if (!this.myInfo) return null;
    if (this.host && this.host.deviceId === this.myInfo.deviceId) return DeviceRole.HOST;
    if (this.guest && this.guest.deviceId === this.myInfo.deviceId) return DeviceRole.GUEST;
    return null;
  }

  getPartnerInfo(): PlayerInfo | null {
    const myRole = this.getMyRole();
    if (myRole === DeviceRole.HOST) return this.guest;
    if (myRole === DeviceRole.GUEST) return this.host;
    return null;
  }

  onStateChange(callback: (oldState: SessionState, newState: SessionState) => void): void {
    this.stateChangeListeners.push(callback);
  }

  offStateChange(): void {
    this.stateChangeListeners = [];
  }

  private assertTransition(target: SessionState): void {
    const allowed = SessionManager.VALID_TRANSITIONS[this.state];
    if (!allowed || !allowed.includes(target)) {
      throw new Error(`Invalid session state transition: ${this.state} → ${target}`);
    }
  }

  private transitionTo(newState: SessionState): void {
    const oldState = this.state;
    this.state = newState;
    Logger.info('SessionManager', `State: ${oldState} → ${newState}`);
    for (const cb of this.stateChangeListeners) {
      cb(oldState, newState);
    }
  }

  private startReconnectTimer(): void {
    this.reconnectTimerId = setTimeout(() => {
      Logger.info('SessionManager', 'Reconnect timeout — forfeiting');
      this.transitionTo(SessionState.IDLE);
    }, RECONNECT_TIMEOUT_MS);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimerId !== null) {
      clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  private ensureMyInfo(): PlayerInfo {
    if (!this.myInfo) {
      this.myInfo = {
        deviceId: `local-${Date.now()}`,
        deviceName: '本机设备',
        role: DeviceRole.HOST,
        isReady: true
      };
    }
    return this.myInfo;
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }
}
