import type { TextRegion } from '../../types';

export interface TypesettingStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

/**
 * Modular interface for Automatic Typesetting engine.
 * Future extension: Canvas/SVG text wrapping, auto font sizing, arc text warping.
 */
export interface TypesettingModule {
  applyTypesetting(
    ctx: CanvasRenderingContext2D,
    region: TextRegion,
    style: TypesettingStyle
  ): Promise<void>;
}

export class StubTypesettingModule implements TypesettingModule {
  async applyTypesetting(
    ctx: CanvasRenderingContext2D,
    region: TextRegion,
    style: TypesettingStyle
  ): Promise<void> {
    const textToRender = region.translation || region.text;
    if (!textToRender) return;

    ctx.save();
    ctx.font = `${style.fontSize}px ${style.fontFamily}`;
    ctx.fillStyle = style.color;
    ctx.textAlign = style.align;
    ctx.textBaseline = 'middle';

    const centerX = region.bbox.x + region.bbox.width / 2;
    const centerY = region.bbox.y + region.bbox.height / 2;

    ctx.fillText(textToRender, centerX, centerY);
    ctx.restore();
  }
}

export const typesettingModule = new StubTypesettingModule();
