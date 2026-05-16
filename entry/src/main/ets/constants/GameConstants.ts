import { GameType, GameMeta } from '../common/types/GameTypes';

// 游戏元数据注册表
export const GAME_REGISTRY: Record<string, GameMeta> = {
  [GameType.RHYTHM_SYNC]: {
    type: GameType.RHYTHM_SYNC,
    name: '节奏共鸣',
    description: '同步敲击节拍，比拼默契度',
    icon: 'app.media.game_icon_rhythm',
    minPlayers: 2,
    maxPlayers: 2,
    duration: '90秒/局',
    difficulty: 2,
    isFree: true
  },
  [GameType.JOINT_DRAWING]: {
    type: GameType.JOINT_DRAWING,
    name: '合体绘画',
    description: '各画一半，实时合成完整作品',
    icon: 'app.media.game_icon_drawing',
    minPlayers: 2,
    maxPlayers: 2,
    duration: '2-5分钟',
    difficulty: 1,
    isFree: false
  },
  [GameType.MEMORY_MATCH]: {
    type: GameType.MEMORY_MATCH,
    name: '记忆碎片',
    description: '合作记忆配对，考验沟通',
    icon: 'app.media.game_icon_memory',
    minPlayers: 2,
    maxPlayers: 2,
    duration: '2-3分钟',
    difficulty: 3,
    isFree: true
  },
  [GameType.WORD_CHAIN]: {
    type: GameType.WORD_CHAIN,
    name: '词语接龙',
    description: '轮流用对方尾字开头组新词',
    icon: 'app.media.game_icon_wordchain',
    minPlayers: 2,
    maxPlayers: 2,
    duration: '3-5分钟',
    difficulty: 3,
    isFree: false
  }
};

// 节奏游戏常量
export const RHYTHM_DIFFICULTIES = {
  1: { bpm: 90, beatsPerBar: 4, totalBars: 6, noteDensity: 0.5, label: '简单' },
  2: { bpm: 110, beatsPerBar: 4, totalBars: 8, noteDensity: 0.7, label: '普通' },
  3: { bpm: 130, beatsPerBar: 4, totalBars: 10, noteDensity: 0.9, label: '困难' }
};

// 判定窗口 (毫秒) — 放宽让普通玩家也能玩
export const JUDGE_WINDOWS = {
  PERFECT: 80,
  GREAT: 150,
  GOOD: 250
};

// 默契判定窗口 (毫秒) — 两人点击时间差
export const SYNC_WINDOWS = {
  PERFECT: 150,
  GREAT: 300,
  GOOD: 500
};

// 得分
export const SCORES = {
  PERFECT: 100,
  GREAT: 70,
  GOOD: 40,
  MISS: 0,
  MEMORY_MATCH_SUCCESS: 10,
  WORD_CHAIN_SUCCESS: 1
};

// 记忆游戏常量
export const MEMORY_TOTAL_CARDS = 16;
export const MEMORY_CARDS_PER_DEVICE = 8;

// 词语接龙常量
export const WORD_CHAIN_CHARS_PER_DEVICE = 12;
export const WORD_CHAIN_TURN_TIMEOUT_MS = 45_000;
export const WORD_CHAIN_MIN_WORD_LENGTH = 2;
export const WORD_CHAIN_MAX_WORD_LENGTH = 4;

// 绘画常量
export const DRAWING_CANVAS_WIDTH = 800;
export const DRAWING_CANVAS_HEIGHT = 600;
export const DRAWING_MAX_STROKES = 500;
export const DRAWING_SYNC_THROTTLE_MS = 16;

// 连接常量
export const RECONNECT_TIMEOUT_MS = 30_000;
export const DEVICE_SCAN_TIMEOUT_MS = 15_000;
export const SESSION_ID_LENGTH = 4;
