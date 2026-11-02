// 'steam': F12 da Steam (inclusive jogos não-Steam adicionados à Steam)
// 'gamebar': Win+Alt+PrtScn (Xbox Game Bar, Vídeos\Capturas)
// 'custom': imagens anexadas pelo usuário no Lazulium
export type ScreenshotSource = 'steam' | 'gamebar' | 'custom';

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
