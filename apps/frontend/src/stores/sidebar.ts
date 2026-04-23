import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  /** Desktop rail collapsed state — persisted to localStorage */
  collapsed: boolean;
  /** Mobile Sheet open state — NOT persisted (always false on fresh load) */
  mobileOpen: boolean;

  toggle: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      mobileOpen: false,

      toggle() {
        set((state) => ({ collapsed: !state.collapsed }));
      },

      openMobile() {
        set({ mobileOpen: true });
      },

      closeMobile() {
        set({ mobileOpen: false });
      },
    }),
    {
      name: 'streaming-chat.sidebar',
      // mobileOpen is NOT persisted — always starts false on page load
      partialize: (state) => ({ collapsed: state.collapsed }),
    },
  ),
);
