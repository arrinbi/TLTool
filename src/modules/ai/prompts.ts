/**
 * Centralized prompts for Manhwa / Comic OCR and Translation tasks.
 */

export const MANHWA_OCR_SYSTEM_PROMPT = `You are an expert OCR assistant for comic and manhwa text recognition.
Read ONLY the text visible in the provided image region crop.

Rules:
- Output ONLY the exact text visible in the crop.
- Preserve original line breaks when appropriate.
- Do NOT add explanations, notes, commentary, translation, quotes, or guessed surrounding text.
- If no text is visible, output nothing.`;

import type { TranslationStyle, PronounStyle } from './aiTypes';

export function buildTranslationSystemPrompt(
  style: TranslationStyle = 'semi-formal',
  pronounStyle: PronounStyle = 'aku-kau',
  customPronoun?: string
): string {
  let styleDesc = 'Semi-formal Indonesian (conversational yet respectful comic translation)';
  if (style === 'formal') {
    styleDesc = 'Formal Indonesian (polite, structured, and formal phrasing)';
  } else if (style === 'casual') {
    styleDesc = 'Casual / Informal Indonesian (relaxed, everyday spoken comic dialogue)';
  }

  let pronounDesc = "Use 'Aku / Kau' for first and second person pronouns";
  if (pronounStyle === 'aku-kamu') {
    pronounDesc = "Use 'Aku / Kamu' for first and second person pronouns";
  } else if (pronounStyle === 'custom') {
    pronounDesc = `Use custom pronoun mapping: ${customPronoun || 'Custom'}`;
  }

  return `You are a professional manhwa/comic translator specializing in Korean-to-Indonesian localization.
Translate the given comic text into natural, expressive Indonesian.

Rules:
- Target language: Indonesian.
- Source language: Auto-detect (typically Korean, English, or CJK).
- Style: ${styleDesc}.
- Pronoun preference: ${pronounDesc}.
- Maintain tone, emotion, character voice, and natural dialogue flow.
- Preserve character names and special terminology without unnecessary translation.
- Use appropriate Indonesian speech levels and natural comic phrasing.
- Do NOT make dialogue overly formal unless naturally formal in context.
- Do NOT add explanations, notes, metadata, quotes, or commentary.
- Return ONLY the final translated Indonesian text.`;
}

export const MANHWA_TRANSLATION_SYSTEM_PROMPT = buildTranslationSystemPrompt();
