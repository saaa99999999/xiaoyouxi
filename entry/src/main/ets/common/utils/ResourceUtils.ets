/**
 * 资源工具 — 将计划书中的 string 资源路径解析为 $r() Resource 对象
 *
 * ArkTS 不允许在 .ts 文件中使用 $r()，必须在 .ets 中解析。
 */

export function resolveGameIcon(iconPath: string): Resource {
  const map: Record<string, Resource> = {
    'app.media.game_icon_rhythm': $r('app.media.game_icon_rhythm'),
    'app.media.game_icon_drawing': $r('app.media.game_icon_drawing'),
    'app.media.game_icon_memory': $r('app.media.game_icon_memory'),
    'app.media.game_icon_wordchain': $r('app.media.game_icon_wordchain'),
  };
  return map[iconPath] || $r('app.media.app_icon');
}

export function resolveImage(imagePath: string): Resource {
  const map: Record<string, Resource> = {
    'app.media.app_icon': $r('app.media.app_icon'),
    'app.media.card_back': $r('app.media.card_back'),
    'app.media.rhythm_bg': $r('app.media.rhythm_bg'),
    'app.media.drawing_bg': $r('app.media.drawing_bg'),
    'app.media.memory_bg': $r('app.media.memory_bg'),
    'app.media.wordchain_bg': $r('app.media.wordchain_bg'),
    'app.media.empty_state': $r('app.media.empty_state'),
    'app.media.tutorial_1': $r('app.media.tutorial_1'),
    'app.media.tutorial_2': $r('app.media.tutorial_2'),
    'app.media.tutorial_3': $r('app.media.tutorial_3'),
  };
  return map[imagePath] || $r('app.media.app_icon');
}

export function resolveSound(soundName: string): string {
  return soundName; // SoundManager uses rawfile name
}

export function resolveColor(colorKey: string): string {
  const map: Record<string, string> = {
    'brand_blue': '#007DFF',
    'accent_orange': '#FF6B35',
    'success_green': '#00C853',
    'warning_yellow': '#FFD600',
    'error_red': '#FF5252',
    'text_primary': '#212121',
    'text_secondary': '#757575',
    'bg_primary': '#F5F5F5',
    'bg_card': '#FFFFFF',
    'divider': '#E0E0E0',
    'perfect_gold': '#FFD700',
    'great_green': '#4CAF50',
    'good_blue': '#2196F3',
    'miss_red': '#FF5252',
    'host_zone': '#E3F2FD',
    'guest_zone': '#FFF3E0'
  };
  return map[colorKey] || '#000000';
}

export function resolveString(stringKey: string): string {
  const map: Record<string, string> = {
    'app_name': '默契挑战',
    'btn_create_room': '创建房间',
    'btn_join_room': '加入房间',
    'btn_start_game': '开始游戏',
    'btn_play_again': '再来一局',
    'btn_back_to_lobby': '返回大厅',
    'btn_retry': '重试',
    'btn_skip': '跳过',
    'btn_confirm': '确认',
    'label_my_device': '我的设备',
    'label_partner_device': '对方设备',
    'label_searching': '正在扫描附近设备...',
    'label_no_device': '未发现附近鸿蒙设备',
    'label_connecting': '正在连接...',
    'label_connected': '已连接',
    'label_disconnected': '连接已断开',
    'label_reconnecting': '正在重新连接...',
    'label_waiting_partner': '等待对方加入...',
    'label_permission_denied': '需要设备协同权限',
    'label_empty_history': '还没有游戏记录'
  };
  return map[stringKey] || stringKey;
}
