import router from '@ohos.router';
import { IAPManager } from '../common/manager/IAPManager';
import { PurchaseConfirmDialog } from '../components/PurchaseConfirmDialog';
import { LightTheme, AppTheme } from '../constants/UIConstants';
import { GameType } from '../common/types/GameTypes';
import { Logger } from '../common/utils/Logger';

@Entry
@Component
struct StorePage {
  @StorageLink('currentTheme') currentTheme: AppTheme = LightTheme;
  @State isLoading: boolean = true;
  @State products: ProductDisplay[] = [];
  @State selectedProduct: ProductDisplay | null = null;
  private iapMgr: IAPManager = IAPManager.getInstance();
  private purchaseDialogCtrl: CustomDialogController | null = null;
  private toastTimerId: number = 0;

  private getTheme(): AppTheme { return this.currentTheme || LightTheme; }

  aboutToAppear(): void { this.loadProducts(); }

  async loadProducts(): Promise<void> {
    this.isLoading = true;
    try {
      const productIds: string[] = this.iapMgr.getAllProductIds();
      const productList: ProductDisplay[] = [];
      for (const productId of productIds) {
        const item: ProductDisplay = {
          productId: productId,
          name: this.iapMgr.getProductName(productId),
          price: this.iapMgr.getProductPrice(productId),
          description: this.getProductDescription(productId),
          isOwned: this.checkOwnership(productId),
          isFree: false
        };
        productList.push(item);
      }
      this.products = productList;
    } catch (err) {
      Logger.error('StorePage', 'loadProducts failed', err);
    } finally {
      this.isLoading = false;
    }
  }

  private getProductDescription(productId: string): string {
    const descs: Record<string, string> = {
      'unlock_drawing': '永久解锁合体绘画游戏，与伙伴一起创作',
      'unlock_wordchain': '永久解锁词语接龙游戏，考验词汇量',
      'unlock_all': '一次性解锁全部游戏，节省 ¥3',
      'theme_pack_1': '3套极简风格画笔 + 2套卡牌皮肤',
      'theme_pack_2': '3套自然风格画笔 + 2套卡牌皮肤'
    };
    return descs[productId] || '';
  }

  private checkOwnership(productId: string): boolean {
    if (productId === 'unlock_all') {
      return this.iapMgr.isGameUnlocked(GameType.JOINT_DRAWING) &&
             this.iapMgr.isGameUnlocked(GameType.WORD_CHAIN);
    }
    if (productId === 'unlock_drawing') return this.iapMgr.isGameUnlocked(GameType.JOINT_DRAWING);
    if (productId === 'unlock_wordchain') return this.iapMgr.isGameUnlocked(GameType.WORD_CHAIN);
    return false;
  }

  build() {
    Column() {
      // 导航栏
      Row() {
        Button() { Text('←').fontSize(20); }
          .type(ButtonType.Normal).backgroundColor(Color.Transparent)
          .width(44).height(44)
          .onClick(() => { router.back(); });
        Text('游戏商店')
          .fontSize(20).fontWeight(FontWeight.Bold)
          .layoutWeight(1).textAlign(TextAlign.Center);
        Button('恢复购买')
          .fontSize(12).backgroundColor(Color.Transparent)
          .fontColor(this.getTheme().brandBlue)
          .onClick(() => { this.restorePurchases(); });
      }
      .width('100%').padding(16);

      if (this.isLoading) {
        Column() {
          LoadingProgress().width(48).height(48).color(this.getTheme().brandBlue);
          Text('加载商品中...').fontSize(14).fontColor(this.getTheme().textSecondary)
            .margin({ top: 12 });
        }
        .width('100%').layoutWeight(1).justifyContent(FlexAlign.Center);
      } else {
        Scroll() {
          Flex({ wrap: FlexWrap.Wrap, justifyContent: FlexAlign.SpaceAround }) {
            ForEach(this.products, (product: ProductDisplay) => {
              Column() {
                Text(product.isOwned ? '✅' : '🎮').fontSize(36).margin({ bottom: 8 });
                Text(product.name).fontSize(16).fontWeight(FontWeight.Bold);
                if (product.description) {
                  Text(product.description).fontSize(11).fontColor(this.getTheme().textSecondary)
                    .textAlign(TextAlign.Center).maxLines(2)
                    .padding({ left: 8, right: 8 }).margin({ top: 4, bottom: 8 });
                }
                if (product.isOwned) {
                  Text('已拥有').fontSize(14).fontColor(this.getTheme().successGreen)
                    .fontWeight(FontWeight.Bold);
                } else {
                  Button(product.price)
                    .fontSize(16).fontWeight(FontWeight.Bold)
                    .backgroundColor(this.getTheme().brandBlue)
                    .fontColor(Color.White)
                    .borderRadius(20).padding({ left: 16, right: 16 })
                    .onClick(() => { this.onPurchaseTap(product); });
                }
              }
              .width('45%').padding(16)
              .backgroundColor(this.getTheme().bgCard)
              .borderRadius(this.getTheme().cardRadius)
              .margin({ bottom: 12 })
              .shadow({ radius: 4, color: this.getTheme().shadow });
            }, (product: ProductDisplay) => product.productId);
          }
          .padding(12);
        }
        .layoutWeight(1);

        // 底部法律声明
        Text('购买将通过华为应用内支付完成。价格可能因地区而异。')
          .fontSize(10).fontColor(this.getTheme().textSecondary)
          .textAlign(TextAlign.Center).padding(8);
      }
    }
    .width('100%').height('100%')
    .backgroundColor(this.getTheme().bgPrimary);
  }

  private onPurchaseTap(product: ProductDisplay): void {
    this.purchaseDialogCtrl = new CustomDialogController({
      builder: PurchaseConfirmDialog({
        productId: product.productId,
        productName: product.name,
        price: product.price,
        description: product.description,
        onConfirm: () => {
          this.iapMgr.purchase(product.productId, (success: boolean, _productId: string) => {
            if (success) {
              this.showToast('购买成功!');
              this.loadProducts(); // 刷新商品状态
            }
          });
        }
      }),
      autoCancel: true,
      customStyle: true
    });
    this.purchaseDialogCtrl.open();
  }

  private async restorePurchases(): Promise<void> {
    try {
      await this.iapMgr.init(getContext(this));
      this.showToast('购买已恢复');
      this.loadProducts();
    } catch (err) {
      this.showToast('恢复失败，请重试');
    }
  }

  private showToast(msg: string): void {
    if (this.toastTimerId) clearTimeout(this.toastTimerId);
    AlertDialog.show({ message: msg, alignment: DialogAlignment.Bottom });
  }
}

interface ProductDisplay {
  productId: string;
  name: string;
  price: string;
  description: string;
  isOwned: boolean;
  isFree: boolean;
}
