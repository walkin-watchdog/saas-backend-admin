import { usePlatformStore } from '@/stores/platformStore';
import { useCallback } from 'react';

export function useFilters() {
  const {
    searchTerm,
    statusFilter,
    dateFilter,
    setSearchTerm,
    setStatusFilter,
    setDateFilter,
    reset
  } = usePlatformStore();

  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
  }, [setSearchTerm]);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value);
  }, [setStatusFilter]);

  const handleDateChange = useCallback((value: string) => {
    setDateFilter(value);
  }, [setDateFilter]);

  return {
    searchTerm,
    statusFilter,
    dateFilter,
    setSearchTerm: handleSearchChange,
    setStatusFilter: handleStatusChange,
    setDateFilter: handleDateChange,
    reset
  };
}

export function usePagination() {
  const {
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize
  } = usePlatformStore();

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, page));
  }, [setCurrentPage]);

  const nextPage = useCallback(() => {
    setCurrentPage(currentPage + 1);
  }, [setCurrentPage, currentPage]);

  const prevPage = useCallback(() => {
    setCurrentPage(Math.max(1, currentPage - 1));
  }, [setCurrentPage, currentPage]);

  return {
    currentPage,
    pageSize,
    setCurrentPage,
    setPageSize,
    goToPage,
    nextPage,
    prevPage
  };
}

export function useSelection() {
  const {
    selectedItems,
    setSelectedItems,
    addSelectedItem,
    removeSelectedItem,
    clearSelection
  } = usePlatformStore();

  return {
    selectedItems,
    setSelectedItems,
    addSelectedItem,
    removeSelectedItem,
    clearSelection
  };
}