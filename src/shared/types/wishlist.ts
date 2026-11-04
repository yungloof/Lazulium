export interface WishlistItem {
  appId: number;                    // AppID da Steam: é de lá que vêm nome e preço
  name: string;
  imageUrl?: string;                // Jogos novos não têm a imagem no endereço antigo da CDN: vem da própria loja
  source: 'steam' | 'manual';       // 'steam': sai daqui quando sai da lista de desejos da conta
  addedAt: string;                  // ISO timestamp
  priceCents?: number;              // Preço de agora, em centavos
  initialCents?: number;            // Preço sem desconto
  discountPercent?: number;
  priceLabel?: string;              // "R$ 199,90", como a loja escreve
  isFree?: boolean;
  noPrice?: boolean;                // Ainda não lançado ou sem venda no Brasil
  lowestCents?: number;             // Menor preço que o Lazulium já viu
  targetCents?: number;             // Avisar quando chegar neste preço
  notifiedCents?: number;           // Último preço avisado: a mesma promoção não avisa duas vezes
  checkedAt?: string;
}

export interface WishlistState {
  items: WishlistItem[];
  lastSyncAt?: string;
  warning?: string;                 // O que aconteceu e o que fazer
}
