import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

type Role = 'delegate' | 'admin'

interface UIStore {
  activeRole: Role
  currentView: 'main' | 'settings'
  isLoginModalOpen: boolean
  isSubmitDialogOpen: boolean
  isPublishDialogOpen: boolean

  initializeRole: () => void
  setActiveRole: (role: Role) => void
  toggleRole: () => void
  setCurrentView: (view: 'main' | 'settings') => void
  setLoginModalOpen: (open: boolean) => void
  setSubmitDialogOpen: (open: boolean) => void
  setPublishDialogOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRole: 'delegate',
  currentView: 'main',
  isLoginModalOpen: false,
  isSubmitDialogOpen: false,
  isPublishDialogOpen: false,

  initializeRole: () => {
    const defaultRole = useSettingsStore.getState().defaultRole
    set({ activeRole: defaultRole })
  },

  setActiveRole: (role) => set({ activeRole: role }),

  toggleRole: () => set((state) => ({
    activeRole: state.activeRole === 'delegate' ? 'admin' : 'delegate',
  })),

  setCurrentView: (view) => set({ currentView: view }),

  setLoginModalOpen: (open) => set({ isLoginModalOpen: open }),
  setSubmitDialogOpen: (open) => set({ isSubmitDialogOpen: open }),
  setPublishDialogOpen: (open) => set({ isPublishDialogOpen: open }),
}))
