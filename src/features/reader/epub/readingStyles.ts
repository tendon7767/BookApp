import { readerFonts, readingColors, type ReadingSettings } from '../readingSettings'

export function readingStyles(settings: ReadingSettings) {
  const colors = readingColors(settings)
  // Settings are normalized enums/numbers/hex colors, never arbitrary book/user CSS.
  return `
    html, body { background: ${colors.background} !important; color: ${colors.foreground} !important; }
    body, body p, body div, body li, body span, body td, body blockquote {
      font-family: ${readerFonts[settings.fontFamily].css} !important;
      font-size: ${settings.fontSize}px !important;
      line-height: ${settings.lineHeight} !important;
      color: ${colors.foreground} !important;
      background-color: transparent !important;
    }
    body h1, body h2, body h3, body h4, body h5, body h6 {
      font-family: ${readerFonts[settings.fontFamily].css} !important;
      color: ${colors.foreground} !important; line-height: 1.4 !important;
    }
    body h1 { font-size: ${settings.fontSize * 1.5}px !important; }
    body h2 { font-size: ${settings.fontSize * 1.3}px !important; }
    body h3, body h4, body h5, body h6 { font-size: ${settings.fontSize * 1.1}px !important; }
    body p { margin-top: 0 !important; margin-bottom: ${settings.paragraphSpacing}em !important; }
    img, svg { max-width: 100% !important; object-fit: contain; }
  `
}
