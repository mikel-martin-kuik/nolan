import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { QuickLaunchModal } from './QuickLaunchModal';
import { getRalphDisplayName } from '@/lib/agentIdentity';

export const BrandHeader: React.FC = () => {
  const [showQuickLaunch, setShowQuickLaunch] = useState(false);
  const ralphDisplayName = getRalphDisplayName();

  return (
    <div className="flex items-center justify-between px-2 py-2">
      {/* Logo & Brand - floating, no background */}
      <div className="flex items-center gap-2.5">
        <span className="text-lg font-semibold text-foreground/90 tracking-wide">
          NOLAN
        </span>
      </div>

      {/* Quick Launch Button */}
      <button
        onClick={() => setShowQuickLaunch(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 hover:border-primary/40 transition-colors text-sm font-medium"
        title={`Quick launch ${ralphDisplayName} with Opus`}
      >
        <Zap className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Quick</span>
      </button>

      {/* Quick Launch Modal */}
      <QuickLaunchModal
        open={showQuickLaunch}
        onOpenChange={setShowQuickLaunch}
      />
    </div>
  );
};
