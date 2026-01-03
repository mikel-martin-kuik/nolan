import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { Session, SessionDetail } from '@/types/sessions';

export function useSessions(
  project?: string,
  fromDate?: string,
  toDate?: string
) {
  return useQuery({
    queryKey: ['sessions', project, fromDate, toDate],
    queryFn: async () => {
      const sessions = await invoke<Session[]>('get_sessions', {
        project,
        fromDate,
        toDate,
      });
      return sessions;
    },
  });
}

export function useSessionDetail(sessionId: string | null) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const detail = await invoke<SessionDetail>('get_session_detail', {
        sessionId,
      });
      return detail;
    },
    enabled: !!sessionId,
  });
}

export async function exportSessionHtml(
  sessionId: string,
  outputPath: string
): Promise<string> {
  return await invoke<string>('export_session_html', {
    sessionId,
    outputPath,
  });
}

export async function exportSessionMarkdown(
  sessionId: string,
  outputPath: string
): Promise<string> {
  return await invoke<string>('export_session_markdown', {
    sessionId,
    outputPath,
  });
}
