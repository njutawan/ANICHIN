'use client';

import { useEffect, useState } from 'react';
import { Shield, ShieldOff } from 'lucide-react';
import { useMounted } from '@/hooks/use-mounted';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Content Protection Component
 *
 * Features:
 * 1. Disable right-click context menu (prevents "Save image as", "Copy")
 * 2. Disable text selection on non-input elements
 * 3. Disable image drag-and-drop
 * 4. Disable keyboard shortcuts (Ctrl+C, Ctrl+S, Ctrl+U, F12)
 * 5. Show watermark overlay on images
 * 6. Toggle in settings panel (user can enable/disable)
 *
 * Note: This is deterrent, not absolute protection. Determined users
 * can still bypass via DevTools. But it prevents casual copy-paste.
 */

export function ContentProtection() {
  const mounted = useMounted();
  const [enabled, setEnabled] = useState(false);

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('anichin-content-protection');
    setEnabled(saved === 'true');
  }, []);

  // Apply protection when enabled
  useEffect(() => {
    if (!mounted || !enabled) return;

    // 1. Disable right-click
    const handleContextMenu = (e: MouseEvent) => {
      // Allow right-click on inputs, textareas, and admin panel
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        (target.isContentEditable) ||
        target.closest('[data-allow-context]') ||
        target.closest('[contenteditable]') ||
        window.location.pathname.startsWith('/admin')
      ) {
        return;
      }
      e.preventDefault();
      toast.warning('Klik kanan dinonaktifkan untuk melindungi konten', { duration: 2000 });
    };

    // 2. Disable keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Allow in admin panel and inputs
      if (isInput || window.location.pathname.startsWith('/admin')) return;

      // Block Ctrl+C, Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12
      if (
        (e.ctrlKey && (e.key === 'c' || e.key === 'C')) ||
        (e.ctrlKey && (e.key === 's' || e.key === 'S')) ||
        (e.ctrlKey && (e.key === 'u' || e.key === 'U')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) ||
        e.key === 'F12'
      ) {
        // Allow Ctrl+C when text is selected in allowed areas
        if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && window.getSelection()?.toString()) {
          const selection = window.getSelection()?.toString() ?? '';
          if (selection.length < 50) return; // Allow short selections
        }
        e.preventDefault();
        toast.warning('Aksi ini dinonaktifkan untuk melindungi konten', { duration: 2000 });
      }
    };

    // 3. Disable image drag
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
        e.preventDefault();
      }
    };

    // 4. Add CSS for text selection
    const style = document.createElement('style');
    style.id = 'content-protection-css';
    style.textContent = `
      /* Disable text selection on content (but allow on inputs) */
      body:not(.allow-select) p, body:not(.allow-select) span, body:not(.allow-select) h1, body:not(.allow-select) h2, body:not(.allow-select) h3, body:not(.allow-select) h4, body:not(.allow-select) div:not([contenteditable]):not(input):not(textarea) {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
      }
      /* Re-enable for inputs */
      input, textarea, [contenteditable] {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
      /* Disable image drag */
      img {
        -webkit-user-drag: none;
        -webkit-user-select: none;
        pointer-events: auto;
      }
      /* Prevent long-press menu on mobile images */
      img {
        -webkit-touch-callout: none;
      }
    `;
    document.head.appendChild(style);
    document.body.classList.remove('allow-select');

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('dragstart', handleDragStart);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('dragstart', handleDragStart);
      const styleEl = document.getElementById('content-protection-css');
      if (styleEl) styleEl.remove();
      document.body.classList.add('allow-select');
    };
  }, [enabled, mounted]);

  return null;
}

/**
 * Toggle button for settings panel
 */
export function ContentProtectionToggle() {
  const mounted = useMounted();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('anichin-content-protection');
    setEnabled(saved === 'true');
  }, []);

  const toggle = () => {
    const newValue = !enabled;
    setEnabled(newValue);
    localStorage.setItem('anichin-content-protection', String(newValue));
    if (newValue) {
      document.body.classList.remove('allow-select');
      toast.success('Proteksi konten diaktifkan');
    } else {
      document.body.classList.add('allow-select');
      toast.success('Proteksi konten dinonaktifkan');
    }
    // Reload to apply
    setTimeout(() => window.location.reload(), 500);
  };

  if (!mounted) return null;

  return (
    <label className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-foreground/30 cursor-pointer transition-all">
      <div className="flex items-center gap-3">
        {enabled ? (
          <Shield className="h-5 w-5 text-amber-400" />
        ) : (
          <ShieldOff className="h-5 w-5 text-foreground/40" />
        )}
        <div>
          <div className="text-sm font-medium">Proteksi Konten</div>
          <div className="text-xs text-foreground/60 mt-0.5">
            {enabled ? 'Klik kanan & copy dinonaktifkan' : 'Nonaktif — konten bebas di-copy'}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors',
          enabled ? 'bg-amber-500' : 'bg-secondary'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
  );
}
