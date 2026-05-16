import pasteboard from '@ohos.pasteboard';
import { Logger } from './Logger';

/**
 * 社交分享工具
 *
 * 使用 @ohos.pasteboard 实现剪贴板复制，
 * 分享功能暂时通过复制文本到剪贴板实现。
 */
export class ShareUtils {

  static async shareImage(_imagePath: string, _title?: string): Promise<void> {
    try {
      // 图片分享暂不可用，OpenHarmony ShareKit 尚未完全支持
      Logger.info('ShareUtils', 'shareImage: not supported yet');
    } catch (err) {
      Logger.error('ShareUtils', 'shareImage failed', err);
    }
  }

  static async shareScoreCard(scoreData: Record<string, number | string | boolean | Object | undefined>): Promise<void> {
    try {
      const text = ShareUtils.buildScoreCardText(scoreData);
      await ShareUtils.copyToClipboard(text);
      Logger.info('ShareUtils', 'shareScoreCard: copied to clipboard');
    } catch (err) {
      Logger.error('ShareUtils', 'shareScoreCard failed', err);
    }
  }

  static async shareRoomCode(roomCode: string): Promise<void> {
    try {
      const text = `来默契挑战! 房间码: ${roomCode}`;
      await ShareUtils.copyToClipboard(text);
      Logger.info('ShareUtils', 'shareRoomCode: copied to clipboard');
    } catch (err) {
      Logger.error('ShareUtils', 'shareRoomCode failed', err);
    }
  }

  static async shareAchievement(achievement: Record<string, number | string | boolean | Object | undefined>): Promise<void> {
    try {
      const text = `我刚解锁了 [${achievement['name']}] 成就!\n${achievement['description']}\n来默契挑战一起玩!`;
      await ShareUtils.copyToClipboard(text);
      Logger.info('ShareUtils', 'shareAchievement: copied to clipboard');
    } catch (err) {
      Logger.error('ShareUtils', 'shareAchievement failed', err);
    }
  }

  static isShareAvailable(): boolean {
    return true;
  }

  static async copyToClipboard(text: string): Promise<boolean> {
    try {
      const pasteData = pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, text);
      const systemPasteboard = pasteboard.getSystemPasteboard();
      await systemPasteboard.setData(pasteData);
      Logger.info('ShareUtils', `copyToClipboard: ${text.substring(0, 50)}`);
      return true;
    } catch (err) {
      Logger.error('ShareUtils', 'copyToClipboard failed', err);
      return false;
    }
  }

  private static buildScoreCardText(data: Record<string, number | string | boolean | Object | undefined>): string {
    const overall = (data['overall'] as string) || '--';
    const title = (data['title'] as string) || '';
    const gamesPlayed = (data['gamesPlayed'] as string) || '0';
    return `默契挑战 | 默契指数: ${overall}/100 (${title})\n总局数: ${gamesPlayed}\n— SyncTap`;
  }
}
