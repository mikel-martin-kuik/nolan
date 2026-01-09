import { useEffect, useState, useMemo, useCallback } from 'react';
import { invoke } from '@/lib/api';
import { MessageRenderer } from '../Sessions/MessageRenderer';
import {
  Compass, RefreshCw, ArrowLeft, ChevronRight, ChevronDown,
  Circle, CheckCircle2, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RoadmapViewerProps {
  onBack?: () => void;
}

interface RoadmapSection {
  id: string;
  title: string;
  level: number;
  content: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress?: number;
  children: RoadmapSection[];
}

interface PhaseInfo {
  name: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
}

// Parse the roadmap content into sections
function parseRoadmap(content: string): RoadmapSection[] {
  const lines = content.split('\n');
  const sections: RoadmapSection[] = [];
  const stack: RoadmapSection[] = [];
  let currentContent: string[] = [];

  const createSection = (title: string, level: number): RoadmapSection => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      id,
      title: title.replace(/[✅🔴🟡⬜🎯📊]/g, '').trim(),
      level,
      content: '',
      status: 'not-started',
      progress: 0,
      children: []
    };
  };

  const detectStatus = (text: string): 'not-started' | 'in-progress' | 'completed' => {
    if (text.includes('✅ IMPLEMENTED') || text.includes('✅')) return 'completed';
    if (text.includes('🟡') || text.includes('In Progress') || text.includes('Partial')) return 'in-progress';
    if (text.includes('🔴') || text.includes('Not Started') || text.includes('Not Implemented')) return 'not-started';
    return 'not-started';
  };

  const calculateProgress = (text: string): number => {
    const checkboxes = text.match(/\[[ x]\]/gi) || [];
    const checked = checkboxes.filter(c => c.toLowerCase() === '[x]').length;
    const total = checkboxes.length;
    if (total === 0) {
      // Check for ✅ and ⬜ markers
      const done = (text.match(/✅/g) || []).length;
      const notDone = (text.match(/⬜/g) || []).length;
      const totalMarkers = done + notDone;
      return totalMarkers > 0 ? Math.round((done / totalMarkers) * 100) : 0;
    }
    return Math.round((checked / total) * 100);
  };

  const finishSection = () => {
    if (stack.length > 0) {
      const section = stack[stack.length - 1];
      section.content = currentContent.join('\n').trim();
      section.status = detectStatus(section.content);
      section.progress = calculateProgress(section.content);
    }
    currentContent = [];
  };

  for (const line of lines) {
    const h1Match = line.match(/^# (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h3Match = line.match(/^### (.+)/);

    if (h1Match) {
      finishSection();
      while (stack.length > 0) stack.pop();
      const section = createSection(h1Match[1], 1);
      sections.push(section);
      stack.push(section);
    } else if (h2Match) {
      finishSection();
      while (stack.length > 1) stack.pop();
      const section = createSection(h2Match[1], 2);
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(section);
      } else {
        sections.push(section);
      }
      stack.push(section);
    } else if (h3Match) {
      finishSection();
      while (stack.length > 2) stack.pop();
      const section = createSection(h3Match[1], 3);
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(section);
      }
      stack.push(section);
    } else {
      currentContent.push(line);
    }
  }
  finishSection();

  return sections;
}

// Extract phase info from sections
function extractPhases(sections: RoadmapSection[]): PhaseInfo[] {
  const phases: PhaseInfo[] = [];

  for (const section of sections) {
    for (const child of section.children) {
      if (child.title.startsWith('Phase')) {
        phases.push({
          name: child.title,
          status: child.status,
          progress: child.progress || 0
        });
      }
    }
  }

  return phases;
}

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

  // Only show level 2 and 3 in nav (skip the top-level title)
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
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const loadRoadmap = async () => {
    setLoading(true);
    setError(null);
    try {
      const roadmapContent = await invoke<string>('read_roadmap');
      setContent(roadmapContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const sections = useMemo(() => parseRoadmap(content), [content]);
  const phases = useMemo(() => extractPhases(sections), [sections]);

  const currentVersion = useMemo(() => {
    const match = content.match(/Current State \((v[\d.]+)\)/);
    return match ? match[1] : 'v0.x';
  }, [content]);

  const overallProgress = useMemo(() => {
    if (phases.length === 0) return 0;
    const total = phases.reduce((sum, p) => sum + p.progress, 0);
    return Math.round(total / phases.length);
  }, [phases]);

  const handleNavigate = useCallback((id: string) => {
    setActiveSection(id);
    const element = document.getElementById(`roadmap-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  useEffect(() => {
    loadRoadmap();
  }, []);

  // Generate content with IDs for navigation
  const contentWithIds = useMemo(() => {
    if (!content) return '';
    return content.replace(/^(#{1,3}) (.+)$/gm, (_match, hashes, title) => {
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').replace(/[✅🔴🟡⬜🎯📊]/g, '');
      return `${hashes} <span id="roadmap-${id}"></span>${title}`;
    });
  }, [content]);

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
              onClick={loadRoadmap}
              disabled={loading}
              className="p-1.5 hover:bg-accent rounded transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-muted-foreground", loading && "animate-spin")} />
            </button>
          </div>
        </div>
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
                onClick={loadRoadmap}
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
              {/* Phase Overview */}
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-2">
                  Phases
                </div>
                <div className="space-y-1.5">
                  {phases.map((phase, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/50"
                    >
                      <StatusIcon status={phase.status} />
                      <span className="text-xs flex-1 truncate">{phase.name.replace('Phase ', 'P')}</span>
                      <span className={cn(
                        "text-xs font-medium tabular-nums",
                        phase.progress === 100 ? "text-green-500" : phase.progress > 0 ? "text-yellow-500" : "text-muted-foreground"
                      )}>
                        {phase.progress}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

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
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-mt-4 prose-sm
                prose-h2:text-lg prose-h2:border-b prose-h2:border-border prose-h2:pb-2 prose-h2:mt-8
                prose-h3:text-base prose-h3:text-primary
                prose-table:text-sm
                prose-li:my-0.5
                [&_code]:text-xs [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
              ">
                <MessageRenderer content={contentWithIds} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
