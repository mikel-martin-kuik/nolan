import React, { useState, useCallback } from 'react';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import {
  Compass, RefreshCw, ArrowLeft, ChevronRight, ChevronDown,
  Circle, CheckCircle2, Clock, Briefcase, Wrench, FileText, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoadmap, type RoadmapSection, type RoadmapTab } from '@/hooks';
import { invoke } from '@/lib/api';
import { useToastStore } from '@/store/toastStore';

interface RoadmapViewerProps {
  onBack?: () => void;
}

const TAB_CONFIG: Record<RoadmapTab, { label: string; icon: typeof FileText; description: string }> = {
  'roadmap.md': {
    label: 'Overview',
    icon: Compass,
    description: 'Quick reference'
  },
  'business_roadmap.md': {
    label: 'Business',
    icon: Briefcase,
    description: 'Strategy & Market'
  },
  'product_roadmap.md': {
    label: 'Product',
    icon: Wrench,
    description: 'Features & Technical'
  }
};

const StatusIcon = ({ status }: { status: 'not-started' | 'in-progress' | 'completed' }) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case 'in-progress':
      return <Clock className="w-4 h-4 text-yellow-500" />;
    default:
      return <Circle className="w-4 h-4 text-muted-foreground" />;
  }
};

const ProgressBar = ({ progress, className }: { progress: number; className?: string }) => (
  <div className={cn("h-1.5 bg-muted rounded-full overflow-hidden", className)}>
    <div
      className={cn(
        "h-full rounded-full transition-all duration-300",
        progress === 100 ? "bg-green-500" : progress > 0 ? "bg-yellow-500" : "bg-muted-foreground/30"
      )}
      style={{ width: `${progress}%` }}
    />
  </div>
);

interface NavItemProps {
  section: RoadmapSection;
  activeId: string | null;
  onNavigate: (id: string) => void;
  depth?: number;
}

const NavItem = ({ section, activeId, onNavigate, depth = 0 }: NavItemProps) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = section.children.length > 0;
  const isActive = activeId === section.id;

  if (section.level === 1) {
    return (
      <>
        {section.children.map(child => (
          <NavItem
            key={child.id}
            section={child}
            activeId={activeId}
            onNavigate={onNavigate}
            depth={0}
          />
        ))}
      </>
    );
  }

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer text-sm transition-colors",
          isActive ? "bg-primary/10 text-primary" : "hover:bg-accent text-muted-foreground hover:text-foreground",
          depth > 0 && "ml-3"
        )}
        onClick={() => {
          onNavigate(section.id);
          if (hasChildren) setExpanded(!expanded);
        }}
      >
        {hasChildren ? (
          expanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />
        ) : (
          <StatusIcon status={section.status} />
        )}
        <span className="truncate flex-1">{section.title}</span>
        {section.progress !== undefined && section.progress > 0 && (
          <span className={cn(
            "text-xs font-medium",
            section.progress === 100 ? "text-green-500" : "text-yellow-500"
          )}>
            {section.progress}%
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="mt-0.5">
          {section.children.map(child => (
            <NavItem
              key={child.id}
              section={child}
              activeId={activeId}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export function RoadmapViewer({ onBack }: RoadmapViewerProps) {
  const [updating, setUpdating] = useState(false);
  const { success: showSuccess, error: showError } = useToastStore();

  const {
    content,
    loading,
    error,
    sections,
    summaryItems,
    summaryLabel,
    currentVersion,
    overallProgress,
    activeTab,
    availableFiles,
    activeSection,
    setActiveSection,
    handleTabChange,
    loadRoadmap,
  } = useRoadmap();

  const handleUpdateRoadmap = useCallback(async () => {
    setUpdating(true);
    try {
      await invoke('trigger_cron_agent', { name: 'cron-roadmap' });
      showSuccess('Roadmap update started');
    } catch (err) {
      showError(`Failed to trigger roadmap update: ${err}`);
    } finally {
      setUpdating(false);
    }
  }, [showSuccess, showError]);

  const handleNavigate = useCallback((id: string) => {
    setActiveSection(id);
  }, [setActiveSection]);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const roadmapFiles: RoadmapTab[] = ['roadmap.md', 'business_roadmap.md', 'product_roadmap.md'];
    const matchedFile = roadmapFiles.find(f => href === f || href.endsWith('/' + f));

    if (matchedFile && availableFiles.includes(matchedFile)) {
      e.preventDefault();
      handleTabChange(matchedFile);
    }
  }, [availableFiles, handleTabChange]);

  return (
    <div className="glass-card rounded-xl h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 hover:bg-accent rounded transition-colors -ml-1"
                title="Back"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <Compass className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Roadmap</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
              {currentVersion}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{overallProgress}% complete</span>
              <ProgressBar progress={overallProgress} className="w-16" />
            </div>
            <button
              onClick={handleUpdateRoadmap}
              disabled={updating}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium hover:bg-accent rounded transition-colors disabled:opacity-50"
              title="Update roadmap"
            >
              <Sparkles className={cn("w-3.5 h-3.5", updating && "animate-pulse")} />
              <span>Update</span>
            </button>
            <button
              onClick={() => loadRoadmap()}
              disabled={loading}
              className="p-1.5 hover:bg-accent rounded transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        {availableFiles.length > 1 && (
          <div className="flex items-center gap-1 mt-3 p-1 bg-muted/50 rounded-lg">
            {availableFiles.map((file) => {
              const config = TAB_CONFIG[file];
              const Icon = config.icon;
              return (
                <button
                  key={file}
                  onClick={() => handleTabChange(file)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all",
                    activeTab === file
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center max-w-sm">
              <p className="text-sm text-red-500 mb-3">{error}</p>
              <button
                onClick={() => loadRoadmap()}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {content && !loading && !error && (
          <>
            {/* Navigation Sidebar */}
            <div className="w-64 border-r border-border flex-shrink-0 overflow-y-auto p-3">
              {summaryItems.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                    {summaryLabel}
                  </div>
                  <div className="space-y-1.5">
                    {summaryItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50"
                      >
                        <StatusIcon status={item.status} />
                        <span className="text-xs flex-1 truncate">
                          {item.name.replace('Phase ', 'P').replace(/^P\d: /, '')}
                        </span>
                        <span className={cn(
                          "text-xs font-medium tabular-nums",
                          item.progress === 100 ? "text-green-500" : item.progress > 0 ? "text-yellow-500" : "text-muted-foreground"
                        )}>
                          {item.progress}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Section Navigation */}
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                Navigation
              </div>
              <div className="space-y-0.5">
                {sections.map(section => (
                  <NavItem
                    key={section.id}
                    section={section}
                    activeId={activeSection}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto" onClick={handleContentClick}>
              <div className="p-6 prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-sm
                prose-h2:text-lg prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:mt-8
                prose-h3:text-base prose-h3:text-primary
                prose-table:text-sm
                prose-li:my-0.5
                [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
                [&_a[href$='.md']]:text-primary [&_a[href$='.md']]:underline [&_a[href$='.md']]:cursor-pointer
              ">
                <MessageRenderer content={content} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
