// Custom hooks barrel export
export { useAuth } from './useAuth';
export { useScheduledAgents, type UseScheduledAgentsResult, type GroupedScheduledAgents } from './useScheduledAgents';
export { usePredefinedAgents, type UsePredefinedAgentsResult } from './usePredefinedAgents';
export { useAgentTemplates, type UseAgentTemplatesResult } from './useAgentTemplates';
export { useEventAgents, type UseEventAgentsResult } from './useEventAgents';
export { useFetchData, type UseFetchDataOptions, type UseFetchDataResult } from './useFetchData';
export { useFreeAgentMessages } from './useFreeAgentMessages';
export { usePollingEffect, type UsePollingEffectOptions } from './usePollingEffect';
export { useDebouncedCallback, useDebouncedFn, type UseDebouncedCallbackOptions } from './useDebouncedCallback';
export { useProjects, type UseProjectsResult, type GroupedProjects, type ProjectStats } from './useProjects';
export { useRoadmap, type UseRoadmapResult, type RoadmapSection, type PhaseInfo, type RoadmapTab } from './useRoadmap';
export { useTeamMessages } from './useTeamMessages';
export { useUsageStats, type UseUsageStatsResult, type DateRange, type TimelineChartData, type TimelineBar } from './useUsageStats';
export { useAgentStats, type UseAgentStatsResult, type DateRange as AgentDateRange } from './useAgentStats';
export { useExecutionMetrics, type UseExecutionMetricsResult, type MetricsDateRange } from './useExecutionMetrics';
export { useWorkflowStatus, type AgentWithWorkflow, type WorkflowStatusResult } from './useWorkflowStatus';
export { useSpeechToText, type UseSpeechToTextResult } from './useSpeechToText';
export { useFileBrowser, type UseFileBrowserResult } from './useFileBrowser';

// Layered state management hooks (React Query)
export {
  useTeams,
  useAvailableTeams,
  useTeamConfig,
  useAllTeamConfigs,
  useDeleteTeam,
  teamKeys,
  type UseTeamsResult,
} from './useTeams';

export {
  useDepartments,
  useDepartmentsConfig,
  useTeamInfos,
  useSaveDepartments,
  departmentKeys,
  type UseDepartmentsResult,
} from './useDepartments';

export {
  useAgents,
  useAgentStatus,
  useLaunchTeam,
  useKillTeam,
  useSpawnAgent,
  useStartAgent,
  useKillInstance,
  useKillAllInstances,
  agentKeys,
  type UseAgentsResult,
} from './useAgents';
