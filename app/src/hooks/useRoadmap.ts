import { useEffect, useState, useMemo, useCallback } from 'react';
import { invoke } from '@/lib/api';

export interface RoadmapSection {
  id: string;
  title: string;
  level: number;
  content: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress?: number;
  children: RoadmapSection[];
}

export interface PhaseInfo {
  name: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
}

export type RoadmapTab = 'roadmap.md' | 'business_roadmap.md' | 'product_roadmap.md';

export interface UseRoadmapResult {
  content: string;
  loading: boolean;
  error: string | null;
  sections: RoadmapSection[];
  phases: PhaseInfo[];
  pillars: PhaseInfo[];
  summaryItems: PhaseInfo[];
  summaryLabel: string;
  currentVersion: string;
  overallProgress: number;
  activeTab: RoadmapTab;
  availableFiles: RoadmapTab[];
  activeSection: string | null;
  setActiveSection: (id: string | null) => void;
  handleTabChange: (tab: RoadmapTab) => void;
  loadRoadmap: (filename?: RoadmapTab) => Promise<void>;
}

function createSection(title: string, level: number): RoadmapSection {
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
}

function detectStatus(text: string): 'not-started' | 'in-progress' | 'completed' {
  if (text.includes('✅ IMPLEMENTED') || text.includes('✅')) return 'completed';
  if (text.includes('🟡') || text.includes('In Progress') || text.includes('Partial')) return 'in-progress';
  if (text.includes('🔴') || text.includes('Not Started') || text.includes('Not Implemented')) return 'not-started';
  return 'not-started';
}

function calculateProgress(text: string): number {
  const checkboxes = text.match(/\[[ x]\]/gi) || [];
  const checked = checkboxes.filter(c => c.toLowerCase() === '[x]').length;
  const total = checkboxes.length;
  if (total === 0) {
    const done = (text.match(/✅/g) || []).length;
    const notDone = (text.match(/⬜/g) || []).length;
    const totalMarkers = done + notDone;
    return totalMarkers > 0 ? Math.round((done / totalMarkers) * 100) : 0;
  }
  return Math.round((checked / total) * 100);
}

function parseRoadmap(content: string): RoadmapSection[] {
  const lines = content.split('\n');
  const sections: RoadmapSection[] = [];
  const stack: RoadmapSection[] = [];
  let currentContent: string[] = [];

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

function extractPillars(sections: RoadmapSection[]): PhaseInfo[] {
  const pillars: PhaseInfo[] = [];

  for (const section of sections) {
    if (section.title.includes('P1:') || section.title.includes('P2:') ||
        section.title.includes('P3:') || section.title.includes('P4:')) {
      pillars.push({
        name: section.title,
        status: section.status,
        progress: section.progress || 0
      });
    }
    for (const child of section.children) {
      if (child.title.includes('P1:') || child.title.includes('P2:') ||
          child.title.includes('P3:') || child.title.includes('P4:')) {
        pillars.push({
          name: child.title,
          status: child.status,
          progress: child.progress || 0
        });
      }
    }
  }

  return pillars;
}

/**
 * Hook for loading and parsing roadmap content.
 *
 * Handles multiple roadmap files (overview, business, product),
 * parses markdown into sections, and extracts phase/pillar progress.
 */
export function useRoadmap(): UseRoadmapResult {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RoadmapTab>('roadmap.md');
  const [availableFiles, setAvailableFiles] = useState<RoadmapTab[]>(['roadmap.md']);

  const loadRoadmapFiles = useCallback(async () => {
    try {
      const files = await invoke<string[]>('list_roadmap_files');
      setAvailableFiles(files as RoadmapTab[]);
    } catch {
      setAvailableFiles(['roadmap.md']);
    }
  }, []);

  const loadRoadmap = useCallback(async (filename: RoadmapTab = activeTab) => {
    setLoading(true);
    setError(null);
    try {
      const roadmapContent = await invoke<string>('read_roadmap', { filename });
      setContent(roadmapContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const handleTabChange = useCallback((tab: RoadmapTab) => {
    setActiveTab(tab);
    setActiveSection(null);
    loadRoadmap(tab);
  }, [loadRoadmap]);

  const sections = useMemo(() => parseRoadmap(content), [content]);
  const phases = useMemo(() => extractPhases(sections), [sections]);
  const pillars = useMemo(() => extractPillars(sections), [sections]);

  const summaryItems = useMemo(() => {
    if (activeTab === 'business_roadmap.md') return pillars;
    if (activeTab === 'product_roadmap.md') return phases;
    return phases.length > 0 ? phases : pillars;
  }, [activeTab, phases, pillars]);

  const summaryLabel = useMemo(() => {
    if (activeTab === 'business_roadmap.md') return 'Pillars';
    if (activeTab === 'product_roadmap.md') return 'Phases';
    return phases.length > 0 ? 'Phases' : 'Pillars';
  }, [activeTab, phases]);

  const currentVersion = useMemo(() => {
    const match = content.match(/Current State \((v[\d.]+)\)/);
    return match ? match[1] : 'v0.x';
  }, [content]);

  const overallProgress = useMemo(() => {
    if (summaryItems.length === 0) return 0;
    const total = summaryItems.reduce((sum, p) => sum + p.progress, 0);
    return Math.round(total / summaryItems.length);
  }, [summaryItems]);

  useEffect(() => {
    const init = async () => {
      try {
        await loadRoadmapFiles();
        await loadRoadmap();
      } catch (err) {
        console.error('Failed to initialize roadmap:', err);
      }
    };
    init();
  }, [loadRoadmapFiles, loadRoadmap]);

  return {
    content,
    loading,
    error,
    sections,
    phases,
    pillars,
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
  };
}
