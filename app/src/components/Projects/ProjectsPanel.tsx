import { useEffect, useState } from 'react';
import { ProjectList } from './ProjectList';
import { ProjectFileViewer } from './ProjectFileViewer';
import { useProjects } from '@/hooks';
import { useNavigationStore } from '@/store/navigationStore';
import { Plus, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export function ProjectsPanel() {
  const {
    stats,
    isLoading,
    error,
    selectedProject,
    selectedFile,
    activeTab,
    currentProjects,
    groupedProjects,
    selectedFileCompletion,
    isWorkflowFile,
    setActiveTab,
    setSelectedProject,
    handleFileSelect,
  } = useProjects();

  const { context, clearContext } = useNavigationStore();

  // Mobile: track whether to show file viewer (vs project list)
  const [showMobileViewer, setShowMobileViewer] = useState(false);

  // Wrap file select to show viewer on mobile
  const handleMobileFileSelect = (projectName: string, fileName: string | null) => {
    if (fileName) {
      handleFileSelect(projectName, fileName);
      setShowMobileViewer(true);
    }
  };

  // Handle deep-linking from navigation context
  useEffect(() => {
    if (context.projectName) {
      // Find which tab contains the project
      const projectName = context.projectName;

      // Check in each tab group
      if (groupedProjects.inprogress.some(p => p.name === projectName)) {
        setActiveTab('inprogress');
      } else if (groupedProjects.pending.some(p => p.name === projectName)) {
        setActiveTab('pending');
      } else if (groupedProjects.complete.some(p => p.name === projectName)) {
        setActiveTab('complete');
      }

      // Select the project
      setSelectedProject(projectName);
      clearContext();
    }
  }, [context.projectName, groupedProjects, setActiveTab, setSelectedProject, clearContext]);

  return (
    <div className="h-full flex flex-col gap-2 sm:gap-4">
      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden gap-2 sm:gap-4 min-h-0">
        {/* Left: Project List with Tabs */}
        <div className={cn(
          "flex flex-col overflow-hidden",
          // Desktop: fixed width sidebar
          "md:w-[320px] md:flex-shrink-0",
          // Mobile: full width, hide when viewing file
          "w-full",
          showMobileViewer && "hidden md:flex"
        )}>
          {/* Header with New Button and Tabs */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2 sm:mb-3">
            <Button size="sm" onClick={() => {/* TODO: Create project */}} className="w-full sm:w-auto">
              <Plus className="w-3.5 h-3.5 mr-1" />
              New
            </Button>
            <div className="flex items-center gap-1 p-1 glass-card rounded-lg flex-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab('inprogress')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
                  activeTab === 'inprogress' && "bg-foreground/10 text-foreground",
                  activeTab !== 'inprogress' && "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Active</span>
                {stats.active > 0 && (
                  <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.active}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
                  activeTab === 'pending' && "bg-foreground/10 text-foreground",
                  activeTab !== 'pending' && "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Queued</span>
                {stats.queued > 0 && (
                  <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.queued}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('complete')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-all whitespace-nowrap",
                  activeTab === 'complete' && "bg-foreground/10 text-foreground",
                  activeTab !== 'complete' && "text-muted-foreground hover:text-foreground"
                )}
              >
                <span>Done</span>
                {stats.done > 0 && (
                  <span className="text-[10px] px-1 rounded bg-foreground/10">{stats.done}</span>
                )}
              </button>
            </div>
          </div>

          <ProjectList
            projects={currentProjects}
            isLoading={isLoading}
            error={error ? String(error) : null}
            selectedProject={selectedProject}
            selectedFile={selectedFile}
            onFileSelect={handleMobileFileSelect}
            activeTab={activeTab}
          />
        </div>

        {/* Right: File Viewer */}
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden",
          // Mobile: full width, hide when not viewing file
          !showMobileViewer && "hidden md:flex"
        )}>
          {/* Mobile back button */}
          <div className="flex md:hidden items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMobileViewer(false)}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to projects
            </Button>
          </div>
          <ProjectFileViewer
            project={selectedProject}
            file={selectedFile}
            isWorkflowFile={isWorkflowFile}
            fileCompletion={selectedFileCompletion}
          />
        </div>
      </div>
    </div>
  );
}
