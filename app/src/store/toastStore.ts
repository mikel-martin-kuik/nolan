import { create } from 'zustand';
import type { ToastType } from '../components/shared/Toast';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (type, message, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  success: (message, duration) => {
    useToastStore.getState().addToast('success', message, duration);
  },

  error: (message, duration) => {
    useToastStore.getState().addToast('error', message, duration);
  },

  info: (message, duration) => {
    useToastStore.getState().addToast('info', message, duration);
  },

  warning: (message, duration) => {
    useToastStore.getState().addToast('warning', message, duration);
  },
}));
