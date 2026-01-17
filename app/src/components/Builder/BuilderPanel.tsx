import { useNavigationStore, type BuilderSubTab } from '../../store/navigationStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings2, Users, GitBranch } from 'lucide-react';
import { TriggerSettings } from './TriggerSettings';
import { TeamDesigner } from './TeamDesigner';
import { PipelineEditor } from './PipelineEditor';

export function BuilderPanel() {
  const builderSubTab = useNavigationStore((state) => state.builderSubTab);
  const setBuilderSubTab = useNavigationStore((state) => state.setBuilderSubTab);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 border-b">
        <h1 className="text-lg sm:text-xl font-semibold">Builder</h1>
      </div>

      {/* Tab Navigation */}
      <Tabs
        value={builderSubTab}
        onValueChange={(v) => setBuilderSubTab(v as BuilderSubTab)}
        className="flex-1 flex flex-col"
      >
        <div className="px-2 sm:px-4 border-b overflow-x-auto">
          <TabsList className="h-10">
            <TabsTrigger value="pipelines" className="gap-1 sm:gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="hidden sm:inline">Pipelines</span>
              <span className="sm:hidden text-xs">Pipes</span>
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1 sm:gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Teams</span>
              <span className="sm:hidden text-xs">Teams</span>
            </TabsTrigger>
            <TabsTrigger value="triggers" className="gap-1 sm:gap-2">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Triggers</span>
              <span className="sm:hidden text-xs">Trig</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-2 sm:p-4">
          <TabsContent value="pipelines" className="m-0 h-full">
            <PipelineEditor />
          </TabsContent>

          <TabsContent value="teams" className="m-0 h-full">
            <TeamDesigner />
          </TabsContent>

          <TabsContent value="triggers" className="m-0 h-full">
            <div className="max-w-2xl">
              <TriggerSettings />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
