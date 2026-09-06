import { create } from 'zustand'

interface ToastAction {
  label: string
  onClick: () => void
}

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: 'default' | 'destructive'
  action?: ToastAction
}

interface ToastStore {
  toasts: Toast[]
  toast: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  toast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))

    // Auto dismiss: 10s for action toasts, 5s otherwise
    const timeout = toast.action ? 10000 : 5000
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, timeout)
  },
  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },
}))

export function useToast() {
  return useToastStore()
}

export function toast(props: Omit<Toast, 'id'>) {
  useToastStore.getState().toast(props)
}
