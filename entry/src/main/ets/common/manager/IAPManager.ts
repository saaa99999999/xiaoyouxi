import common from '@ohos.app.ability.common';
// TODO: @kit.IAPKit does not exist in OpenHarmony API 12.
// IAP functionality is stubbed out. Replace with OpenHarmony-compatible
// payment SDK when available.

import { GameType } from '../types/GameTypes';
import { PurchaseStatusManager, PurchaseState } from './PurchaseStatusManager';
import { Logger } from '../utils/Logger';

// Stub types for IAP (no real IAP in OpenHarmony)
interface StubProductInfo {
  productId: string;
  price: string;
  title: string;
  description: string;
  name: string;
  currency: string;
}

/**
 * IAP (应用内购买) 管理器
 *
 * STUB IMPLEMENTATION — @kit.IAPKit is not available in OpenHarmony.
 * All purchase operations are simulated locally.
 */
export class IAPManager {
  private static instance: IAPManager | null = null;
  private context: common.Context | null = null;
  private unlockedGames: string[] = [];
  private productInfoMap: Record<string, StubProductInfo> = {};
  private purchaseCallback: ((success: boolean, productId: string) => void) | null = null;
  private initialized: boolean = false;

  private readonly FREE_GAMES: GameType[] = [
    GameType.RHYTHM_SYNC,
    GameType.MEMORY_MATCH
  ];

  private static readonly CONSUMABLE_PRODUCTS: string[] = [
    'unlock_drawing',
    'unlock_wordchain',
    'unlock_all'
  ];

  private static readonly NON_CONSUMABLE_PRODUCTS: string[] = [
    'theme_pack_1',
    'theme_pack_2'
  ];

  private static readonly ALL_PRODUCTS: string[] =
    IAPManager.CONSUMABLE_PRODUCTS.concat(IAPManager.NON_CONSUMABLE_PRODUCTS);

  private static readonly PRODUCT_GAME_MAP: Record<string, GameType | null> = {
    'unlock_drawing':   GameType.JOINT_DRAWING,
    'unlock_wordchain': GameType.WORD_CHAIN,
    'unlock_all':       null
  };

  static getInstance(): IAPManager {
    if (!IAPManager.instance) {
      IAPManager.instance = new IAPManager();
    }
    return IAPManager.instance;
  }

  async init(context: common.Context): Promise<void> {
    if (this.initialized) return;
    this.context = context;

    try {
      this.initStubProducts();
      await this.restoreConsumablesFromLocal();

      this.initialized = true;
      Logger.info('IAPManager', `Initialized (stub) — ${Object.keys(this.productInfoMap).length} products, ${this.unlockedGames.length} unlocked`);
    } catch (err) {
      Logger.error('IAPManager', 'Init failed', err);
      this.initialized = true;
    }
  }

  private initStubProducts(): void {
    const stubs: Record<string, StubProductInfo> = {
      'unlock_drawing':   { productId: 'unlock_drawing',   price: '6.00',  title: '解锁合体绘画', description: '永久解锁合体绘画游戏', name: '解锁合体绘画', currency: 'CNY' },
      'unlock_wordchain': { productId: 'unlock_wordchain', price: '6.00',  title: '解锁词语接龙', description: '永久解锁词语接龙游戏', name: '解锁词语接龙', currency: 'CNY' },
      'unlock_all':       { productId: 'unlock_all',       price: '9.00',  title: '解锁全部游戏', description: '一次性解锁全部游戏',   name: '解锁全部游戏', currency: 'CNY' },
      'theme_pack_1':     { productId: 'theme_pack_1',     price: '3.00',  title: '极简主题包',   description: '3套极简风格画笔+2套卡牌皮肤', name: '极简主题包', currency: 'CNY' },
      'theme_pack_2':     { productId: 'theme_pack_2',     price: '3.00',  title: '自然主题包',   description: '3套自然风格画笔+2套卡牌皮肤', name: '自然主题包', currency: 'CNY' }
    };
    const keys = Object.keys(stubs);
    for (const key of keys) {
      this.productInfoMap[key] = stubs[key];
    }
  }

  getProductInfo(productId: string): StubProductInfo | null {
    return this.productInfoMap[productId] || null;
  }

  getAllProductInfos(): StubProductInfo[] {
    const result: StubProductInfo[] = [];
    const keys = Object.keys(this.productInfoMap);
    for (const key of keys) {
      result.push(this.productInfoMap[key]);
    }
    return result;
  }

  getAllProductIds(): string[] {
    return IAPManager.ALL_PRODUCTS.slice();
  }

  async purchase(productId: string, callback?: (success: boolean, productId: string) => void): Promise<void> {
    if (!this.initialized) {
      Logger.error('IAPManager', 'Not initialized');
      callback?.(false, productId);
      return;
    }

    if (PurchaseStatusManager.getInstance().getState() === PurchaseState.PURCHASING) {
      Logger.warn('IAPManager', 'Purchase already in progress');
      callback?.(false, productId);
      return;
    }

    if (this.isGameUnlocked(this.productIdToGameType(productId))) {
      Logger.info('IAPManager', `Already unlocked: ${productId}`);
      callback?.(true, productId);
      return;
    }

    this.purchaseCallback = callback || null;
    PurchaseStatusManager.getInstance().setState(PurchaseState.PURCHASING, productId);

    try {
      // STUB: Simulate successful purchase
      Logger.info('IAPManager', `Purchase (stub) completed: ${productId}`);
      await this.deliverProduct(productId);
      PurchaseStatusManager.getInstance().setState(PurchaseState.COMPLETED);
      this.purchaseCallback?.(true, productId);
    } catch (err) {
      Logger.error('IAPManager', 'createPurchase failed', err);
      PurchaseStatusManager.getInstance().setState(PurchaseState.FAILED);
      this.purchaseCallback?.(false, productId);
    }
    this.purchaseCallback = null;
  }

  private async deliverProduct(productId: string): Promise<void> {
    if (productId === 'unlock_all') {
      this.unlockedGames.push(GameType.JOINT_DRAWING);
      this.unlockedGames.push(GameType.WORD_CHAIN);
      Logger.info('IAPManager', 'Unlocked ALL games');
    } else {
      const gameType: GameType | null = IAPManager.PRODUCT_GAME_MAP[productId] || null;
      if (gameType) {
        if (!this.unlockedGames.includes(gameType as string)) {
          this.unlockedGames.push(gameType as string);
        }
        Logger.info('IAPManager', `Unlocked: ${gameType}`);
      }
    }

    await this.saveConsumablesToLocal();
    AppStorage.setOrCreate('iap_unlocked', JSON.stringify(this.unlockedGames.slice()));
  }

  private async restoreConsumablesFromLocal(): Promise<void> {
    try {
      const stored: string | undefined = AppStorage.get<string>('iap_unlocked');
      if (stored) {
        const games: string[] = JSON.parse(stored) as string[];
        for (const g of games) {
          if (!this.unlockedGames.includes(g)) {
            this.unlockedGames.push(g);
          }
        }
        Logger.info('IAPManager', `Restored ${games.length} consumables from local`);
      }
    } catch (err) {
      Logger.error('IAPManager', 'restoreConsumablesFromLocal failed', err);
    }
  }

  private async saveConsumablesToLocal(): Promise<void> {
    AppStorage.setOrCreate('iap_unlocked', JSON.stringify(this.unlockedGames.slice()));
  }

  isGameUnlocked(gameType: GameType): boolean {
    if (this.FREE_GAMES.includes(gameType)) return true;
    return this.unlockedGames.includes(gameType as string);
  }

  getUnlockedGames(): GameType[] {
    const result: GameType[] = this.FREE_GAMES.slice();
    for (const g of this.unlockedGames) {
      result.push(g as GameType);
    }
    return result;
  }

  getProductPrice(productId: string): string {
    const info: StubProductInfo | undefined = this.productInfoMap[productId];
    if (info) {
      return `¥${info.price} ${info.currency}`;
    }
    const fallback: Record<string, string> = {
      'unlock_drawing':   '¥6.00',
      'unlock_wordchain': '¥6.00',
      'unlock_all':       '¥9.00',
      'theme_pack_1':     '¥3.00',
      'theme_pack_2':     '¥3.00'
    };
    return fallback[productId] || '¥0.00';
  }

  getProductName(productId: string): string {
    const info: StubProductInfo | undefined = this.productInfoMap[productId];
    if (info && info.name) return info.name;
    const names: Record<string, string> = {
      'unlock_drawing':   '解锁合体绘画',
      'unlock_wordchain': '解锁词语接龙',
      'unlock_all':       '解锁全部游戏',
      'theme_pack_1':     '极简主题包',
      'theme_pack_2':     '自然主题包'
    };
    return names[productId] || productId;
  }

  isAvailable(): boolean {
    return this.initialized;
  }

  isSandbox(): boolean {
    return true;
  }

  private productIdToGameType(productId: string): GameType {
    return IAPManager.PRODUCT_GAME_MAP[productId] || GameType.RHYTHM_SYNC;
  }
}
