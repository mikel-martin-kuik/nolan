import React, { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
} from '@/components/ui/alert-dialog';
import { CLAUDE_MODELS, type ClaudeModel, type SpawnOptions } from '@/types';
import { ChevronRight, Globe } from 'lucide-react';
import { isBrowserMode } from '@/lib/api';

interface ModelSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (options: SpawnOptions) => void;
}

export const ModelSelectDialog: React.FC<ModelSelectDialogProps> = ({
  open,
  onOpenChange,
  onSelect,
}) => {
  const [chromeEnabled, setChromeEnabled] = useState(false);
  const showChromeOption = !isBrowserMode(); // Chrome DevTools only available in desktop app

  // Reset chrome toggle when dialog closes
  useEffect(() => {
    if (!open) {
      setChromeEnabled(false);
    }
  }, [open]);

  const handleSelect = (model: ClaudeModel) => {
    onSelect({ model, chrome: showChromeOption ? chromeEnabled : undefined });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xs">
        <div className="flex flex-col gap-4">
          {/* Chrome DevTools Toggle - Desktop only */}
          {showChromeOption && (
            <>
              <button
                onClick={() => setChromeEnabled(!chromeEnabled)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors duration-150 text-left
                  ${chromeEnabled
                    ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                    : 'border-border/40 hover:border-border/60 text-muted-foreground'
                  }`}
              >
                <Globe className={`w-4 h-4 ${chromeEnabled ? 'text-blue-400' : 'text-muted-foreground/50'}`} />
                <div className="flex-1">
                  <div className="text-sm font-medium">Chrome DevTools</div>
                  <div className="text-xs text-muted-foreground/60">Browser automation & debugging</div>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors ${chromeEnabled ? 'bg-blue-500' : 'bg-muted'}`}>
                  <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${chromeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </button>

              <div className="border-t border-border/30" />
            </>
          )}

          {/* Model Selection */}
          <div className="flex flex-col gap-2">
            {CLAUDE_MODELS.map((model) => (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg
                  hover:bg-secondary/80 transition-colors duration-150 text-left group"
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                <div className="flex-1">
                  <div className="text-lg text-foreground font-normal">{model.label}</div>
                  <div className="text-sm text-muted-foreground/60">{model.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
