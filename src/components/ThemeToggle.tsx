import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Dark mode"
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        const next = !dark;
        document.documentElement.dataset.theme = next ? 'dark' : 'light';
        setDark(next);
        try {
          localStorage.setItem('underwriting-theme', next ? 'dark' : 'light');
        } catch {
          /* Theme remains usable when storage is unavailable. */
        }
      }}
    >
      {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
      <span>{dark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
