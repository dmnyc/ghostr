import { create } from 'zustand'
import { useSettingsStore } from './settingsStore'

type Role = 'delegate' | 'admin'
type View = 'main' | 'settings' | 'ghost-notes'

const ROLE_STORAGE_KEY = 'ghostr-active-role'

interface UIStore {
  activeRole: Role
  currentView: View
  isLoginModalOpen: boolean
  isSubmitDialogOpen: boolean
  isPublishDialogOpen: boolean
  whatsNewOpen: boolean

  initializeRole: () => void
  setActiveRole: (role: Role) => void
  toggleRole: () => void
  resetRoleToDefault: () => void
  setCurrentView: (view: View) => void
  setLoginModalOpen: (open: boolean) => void
  setSubmitDialogOpen: (open: boolean) => void
  setPublishDialogOpen: (open: boolean) => void
  setWhatsNewOpen: (open: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeRole: 'delegate',
  currentView: 'main',
  isLoginModalOpen: false,
  isSubmitDialogOpen: false,
  isPublishDialogOpen: false,
  whatsNewOpen: false,

  initializeRole: () => {
    // Check for persisted role first (page reload case)
    const savedRole = sessionStorage.getItem(ROLE_STORAGE_KEY) as Role | null
    if (savedRole && (savedRole === 'delegate' || savedRole === 'admin')) {
      set({ activeRole: savedRole })
      return
    }
    // Otherwise use default (fresh login case)
    const defaultRole = useSettingsStore.getState().defaultRole
    set({ activeRole: defaultRole })
    sessionStorage.setItem(ROLE_STORAGE_KEY, defaultRole)
  },

  setActiveRole: (role) => {
    sessionStorage.setItem(ROLE_STORAGE_KEY, role)
    set({ activeRole: role })
  },

  toggleRole: () => set((state) => {
    const newRole = state.activeRole === 'delegate' ? 'admin' : 'delegate'
    sessionStorage.setItem(ROLE_STORAGE_KEY, newRole)
    return { activeRole: newRole }
  }),

  resetRoleToDefault: () => {
    sessionStorage.removeItem(ROLE_STORAGE_KEY)
    const defaultRole = useSettingsStore.getState().defaultRole
    set({ activeRole: defaultRole })
  },

  setCurrentView: (view) => set({ currentView: view }),

  setLoginModalOpen: (open) => set({ isLoginModalOpen: open }),
  setSubmitDialogOpen: (open) => set({ isSubmitDialogOpen: open }),
  setPublishDialogOpen: (open) => set({ isPublishDialogOpen: open }),
  setWhatsNewOpen: (open) => set({ whatsNewOpen: open }),
}))
