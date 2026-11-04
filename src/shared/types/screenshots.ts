// 'steam': F12 da Steam (inclusive jogos não-Steam adicionados à Steam)
// 'gamebar': Win+Alt+PrtScn (Xbox Game Bar, Vídeos\Capturas)
// 'custom': imagens anexadas pelo usuário no Lazulium
export type ScreenshotSource = 'steam' | 'gamebar' | 'custom';

// Captura salva no jogo errado (ex: Spacewar, usado para abrir jogos fora da Steam).
// Só muda onde ela aparece: o arquivo continua na pasta de origem.
export interface ScreenshotMove {
  id: string;
  fromGameId: string;               // Jogo que a encontra no disco
  toGameId: string;
}

export interface ScreenshotTaken {
  gameId: string;
  gameTitle: string;
  fileName: string;
  width: number;
  height: number;
  warning?: string;                 // Saiu preta: o que fazer
}

export interface GameScreenshots {
  gameId: string;
  title: string;
  count: number;
  latestAt: string;
  preview: Screenshot[];            // As mais recentes
}

export interface Screenshot {
  id: string;                       // Opaco; o main resolve de volta para o arquivo
  source: ScreenshotSource;
  url: string;                      // lazulium-media://...
  thumbUrl: string;
  fileName: string;
  takenAt: string;                  // ISO timestamp
}
