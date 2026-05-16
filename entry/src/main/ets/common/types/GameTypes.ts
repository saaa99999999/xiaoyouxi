// ============================================================
// 游戏公共类型定义
// 所有模块共享的基础类型
// ============================================================

// ---------- 枚举 ----------

export enum DeviceRole {
  HOST = 'host',
  GUEST = 'guest'
}

export enum ConnectionState {
  IDLE = 'idle',
  DISCOVERING = 'discovering',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

export enum GameType {
  RHYTHM_SYNC = 'rhythm_sync',
  JOINT_DRAWING = 'joint_drawing',
  MEMORY_MATCH = 'memory_match',
  WORD_CHAIN = 'word_chain'
}

export enum GamePhase {
  WAITING = 'waiting',
  COUNTDOWN = 'countdown',
  PLAYING = 'playing',
  PAUSED = 'paused',
  RESULT = 'result',
  FINISHED = 'finished'
}

export enum SessionState {
  IDLE = 'idle',
  HOSTING = 'hosting',
  JOINING = 'joining',
  CONNECTED = 'connected',
  IN_GAME = 'in_game',
  DISCONNECTED = 'disconnected'
}

export enum ErrorCode {
  DEVICE_NOT_FOUND = 1001,
  CONNECTION_FAILED = 1002,
  CONNECTION_TIMEOUT = 1003,
  PERMISSION_DENIED = 1004,
  SYNC_FAILED = 2001,
  DATA_CORRUPTED = 2002,
  GAME_LOGIC_ERROR = 3001,
  INVALID_INPUT = 3002
}

// ---------- 接口 ----------

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'phone' | 'tablet' | '2in1' | 'unknown';
  networkId: string;
}

export interface PlayerInfo {
  deviceId: string;
  deviceName: string;
  role: DeviceRole;
  isReady: boolean;
}

export interface BaseGameState {
  gameType: GameType;
  phase: GamePhase;
  round: number;
  hostScore: number;
  guestScore: number;
  myRole: DeviceRole;
}

export interface SessionInfo {
  sessionId: string;
  host: PlayerInfo;
  guest: PlayerInfo | null;
  state: SessionState;
  currentGame: GameType | null;
  createdAt: number;
}

export interface SessionHandshake {
  type: 'host_ready' | 'guest_join' | 'guest_ack';
  sessionId: string;
  from: DeviceRole;
  player: PlayerInfo;
  timestamp: number;
}

export interface SyncPacket {
  type: string;
  from: DeviceRole;
  payload: Record<string, number | string | boolean | Object | undefined>;
  seq: number;
  timestamp: number;
}

export interface GameResult {
  gameType: GameType;
  hostScore: number;
  guestScore: number;
  winner: DeviceRole | 'draw';
  syncRate?: number;
  timestamp?: number;
  details: Record<string, number | string | boolean | Object | undefined>;
}

export interface GameConfig {
  gameType: GameType;
  myRole: DeviceRole;
  difficulty?: number;
  roundCount?: number;
  timeLimit?: number;
  theme?: string;
}

export interface GameInput {
  type: string;
  data: Record<string, number | string | boolean | Object | undefined>;
}

export interface GameError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

export interface GameMeta {
  type: GameType;
  name: string;
  description: string;
  icon: string;           // resource name string, resolved to $r() in .ets via ResourceUtils
  minPlayers: number;
  maxPlayers: number;
  duration: string;
  difficulty: number;
  isFree: boolean;
}
