import { create } from 'zustand';

interface PlatformStore {
  // Common filters state
  searchTerm: string;
  statusFilter: string;
  dateFilter: string;
  
  // Pagination
  currentPage: number;
  pageSize: number;
  
  // Selection state
  selectedItems: string[];
  
  // Actions
  setSearchTerm: (term: string) => void;
  setStatusFilter: (status: string) => void;
  setDateFilter: (date: string) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSelectedItems: (items: string[]) => void;
  addSelectedItem: (item: string) => void;
  removeSelectedItem: (item: string) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const usePlatformStore = create<PlatformStore>((set) => ({
  searchTerm: '',
  statusFilter: '',
  dateFilter: '',
  currentPage: 1,
  pageSize: 25,
  selectedItems: [],
  
  setSearchTerm: (term: string) => set({ searchTerm: term, currentPage: 1 }),
  setStatusFilter: (status: string) => set({ statusFilter: status, currentPage: 1 }),
  setDateFilter: (date: string) => set({ dateFilter: date, currentPage: 1 }),
  setCurrentPage: (page: number) => set({ currentPage: page }),
  setPageSize: (size: number) => set({ pageSize: size, currentPage: 1 }),
  setSelectedItems: (items: string[]) => set({ selectedItems: items }),
  addSelectedItem: (item: string) =>
    set((state) => ({
      selectedItems: [...state.selectedItems, item],
    })),
  removeSelectedItem: (item: string) =>
    set((state) => ({
      selectedItems: state.selectedItems.filter((i) => i !== item),
    })),
  clearSelection: () => set({ selectedItems: [] }),
  reset: () => set({ 
    searchTerm: '', 
    statusFilter: '', 
    dateFilter: '', 
    currentPage: 1, 
    selectedItems: [] 
  }),
}));
