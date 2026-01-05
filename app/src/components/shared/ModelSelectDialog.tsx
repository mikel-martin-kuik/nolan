import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
} from '@/components/ui/alert-dialog';
import { CLAUDE_MODELS, type ClaudeModel } from '@/types';
import { ChevronRight } from 'lucide-react';

interface ModelSelectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (model: ClaudeModel) => void;
}

export const ModelSelectDialog: React.FC<ModelSelectDialogProps> = ({
  open,
  onOpenChange,
  onSelect,
}) => {
  const handleSelect = (model: ClaudeModel) => {
    onSelect(model);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-xs">
        <div className="flex flex-col gap-6">
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
      </AlertDialogContent>
    </AlertDialog>
  );
};
