import clsx, { type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced as typeof debounced & { cancel: () => void };
}

// Utility function to check if a slot is still bookable based on cutoff time
export function isSlotBookable(
  selectedDate: string, // Format: 'YYYY-MM-DD' or 'MM/dd/yyyy'
  slotTime: string, // Format: 'HH:mm'
  cutoffTimeHours: number = 24
): { isBookable: boolean; reason?: string } {
  try {
    // Parse the selected date
    let bookingDate: Date;
    
    if (selectedDate.includes('/')) {
      // Handle MM/dd/yyyy format
      const [month, day, year] = selectedDate.split('/').map(Number);
      bookingDate = new Date(year, month - 1, day);
    } else {
      // Handle YYYY-MM-DD format
      bookingDate = new Date(selectedDate);
    }
    
    // Parse slot time
    const [hours, minutes] = slotTime.split(':').map(Number);
    
    // Create the full slot datetime
    const slotDateTime = new Date(bookingDate);
    slotDateTime.setHours(hours, minutes, 0, 0);
    
    // Get current time (browser's local time)
    const now = new Date();
    
    // Calculate cutoff time
    const cutoffDateTime = new Date(slotDateTime);
    cutoffDateTime.setHours(cutoffDateTime.getHours() - cutoffTimeHours);
    
    // Check if current time is past the cutoff
    if (now >= cutoffDateTime) {
      const hoursUntilSlot = Math.ceil((slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60));
      
      if (hoursUntilSlot <= 0) {
        return {
          isBookable: false,
          reason: 'This tour has already started or passed'
        };
      } else {
        return {
          isBookable: false,
          reason: `Booking closed. Must book at least ${cutoffTimeHours} hours before tour time`
        };
      }
    }
    
    return { isBookable: true };
  } catch (error) {
    console.error('Error checking slot bookability:', error);
    return {
      isBookable: false,
      reason: 'Error validating booking time'
    };
  }
}