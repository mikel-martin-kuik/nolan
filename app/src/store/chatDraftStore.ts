import { create } from 'zustand';

interface ChatDraftState {
  // Map of session -> draft message text
  drafts: Map<string, string>;

  // Actions
  getDraft: (session: string) => string;
  setDraft: (session: string, text: string) => void;
  clearDraft: (session: string) => void;
}

export const useChatDraftStore = create<ChatDraftState>((set, get) => ({
  drafts: new Map(),

  getDraft: (session) => get().drafts.get(session) ?? '',

  setDraft: (session, text) =>
    set((state) => {
      const newDrafts = new Map(state.drafts);
      if (text) {
        newDrafts.set(session, text);
      } else {
        newDrafts.delete(session);
      }
      return { drafts: newDrafts };
    }),

  clearDraft: (session) =>
    set((state) => {
      const newDrafts = new Map(state.drafts);
      newDrafts.delete(session);
      return { drafts: newDrafts };
    }),
}));
