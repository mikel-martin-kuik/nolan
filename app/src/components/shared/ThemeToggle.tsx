import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../lib/theme';
import { Tooltip } from '../ui/tooltip';
import { cn } from '../../lib/utils';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light');
    } else if (theme === 'light') {
      setTheme('system');
    } else {
      setTheme('dark');
    }
  };

  const getTooltipContent = () => {
    switch (theme) {
      case 'dark':
        return 'Dark';
      case 'light':
        return 'Light';
      case 'system':
        return 'System';
    }
  };

  return (
    <Tooltip content={getTooltipContent()} side="right">
      <button
        onClick={toggleTheme}
        className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200",
          "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
      >
        {theme === 'light' ? (
          <Sun className="w-5 h-5" />
        ) : theme === 'dark' ? (
          <Moon className="w-5 h-5" />
        ) : (
          <div className="relative w-5 h-5">
            <Sun className="absolute w-5 h-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute w-5 h-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </div>
        )}
      </button>
    </Tooltip>
  );
}
