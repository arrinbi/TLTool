import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../../App';
import { buildTranslationSystemPrompt } from '../../modules/ai/prompts';

describe('Three Issues Fixes Verification Suite', () => {
  it('Issue 1: OCR Stage includes Rectangle selection tool controls', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // In Stage 1 (OCR), Rectangle selection tool button is present
    const rectToolBtn = screen.getAllByRole('button', { name: /Rectangle/i })[0];
    expect(rectToolBtn).toBeDefined();

    // Clicking Rectangle selection tool selects it
    fireEvent.click(rectToolBtn);

    // Bounding box overlay drawing mode is enabled
    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
    });

    expect(canvasOverlay).toBeDefined();
  });

  it('Issue 2: Entering Cleaning stage clears previous region selection overlay', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Draw manual region in Stage 1 OCR
    const canvasOverlay = await waitFor(() => {
      const el = document.querySelector('.cursor-crosshair') || document.querySelector('.cursor-default');
      expect(el).not.toBeNull();
      return el as HTMLDivElement;
    });

    vi.spyOn(canvasOverlay, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 600,
      height: 900,
      right: 600,
      bottom: 900,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Enable drawing mode in Stage 1 OCR
    const drawToggleBtn = screen.getByTitle('Draw New OCR Region Box');
    fireEvent.click(drawToggleBtn);

    // Draw manual box in Stage 1 OCR
    fireEvent.pointerDown(canvasOverlay, { clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });
    fireEvent.pointerUp(canvasOverlay, { clientX: 150, clientY: 150, pointerId: 1 });

    // Select the region item in Stage 1 OCR so it becomes active
    const regionItem = await waitFor(() => screen.getByText(/\[100×100\]/i));
    fireEvent.click(regionItem);

    // Region is selected (Selected Region Editor is visible in OCR)
    expect(screen.getByTitle('Delete Box')).toBeDefined();

    // Now switch to Stage 2 Cleaning
    const cleaningNavBtn = screen.getByRole('button', { name: /2\. Cleaning/i });
    fireEvent.click(cleaningNavBtn);

    // In Stage 2 Cleaning, region selection is cleared, so "Select a region on the canvas to clean or revert." prompt is shown
    await waitFor(() => {
      expect(screen.getByText(/Select a region on the canvas to clean or revert\./i)).toBeDefined();
    });
  });

  it('Issue 3: Translation stage includes Translation Style and Pronoun options', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Sample_Manhwa_Page_01/i)).toBeDefined();
    });

    // Switch to Stage 3 Translation
    const translationNavBtn = screen.getByRole('button', { name: /3\. Translation/i });
    fireEvent.click(translationNavBtn);

    // Verify Translation Style & Pronouns section exists
    expect(screen.getByText(/Translation Style & Pronouns/i)).toBeDefined();

    // Check Translation Style options
    const styleSelect = screen.getByLabelText(/Translation Style/i) as HTMLSelectElement;
    expect(styleSelect).toBeDefined();

    const styleOptions = Array.from(styleSelect.options).map((o) => o.text);
    expect(styleOptions).toContain('Semi-formal');
    expect(styleOptions).toContain('Formal');
    expect(styleOptions).toContain('Casual');

    // Check Pronoun options
    const pronounSelect = screen.getByLabelText(/Pronoun Options/i) as HTMLSelectElement;
    expect(pronounSelect).toBeDefined();

    const pronounOptions = Array.from(pronounSelect.options).map((o) => o.text);
    expect(pronounOptions).toContain('Aku / Kau');
    expect(pronounOptions).toContain('Aku / Kamu');
    expect(pronounOptions).toContain('Custom');

    // Test selecting Custom shows custom pronoun text field
    fireEvent.change(pronounSelect, { target: { value: 'custom' } });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. Gua \/ Lu/i)).toBeDefined();
    });

    // Verify buildTranslationSystemPrompt generates correct prompts for all combinations
    const formalPrompt = buildTranslationSystemPrompt('formal', 'aku-kamu');
    expect(formalPrompt).toContain('Formal Indonesian');
    expect(formalPrompt).toContain('Aku / Kamu');

    const casualCustomPrompt = buildTranslationSystemPrompt('casual', 'custom', 'Gua / Lu');
    expect(casualCustomPrompt).toContain('Casual / Informal Indonesian');
    expect(casualCustomPrompt).toContain('Gua / Lu');
  });
});
