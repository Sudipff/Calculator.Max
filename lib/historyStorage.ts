export interface CalculationDetails {
  id?: string;
  type: 'Discount' | 'Weight' | 'Unit' | 'EMI' | 'Wishlist' | 'Currency' | 'Age' | 'Calculator' | string;
  details: string;
  result: string;
  timestamp?: string;
  createdAt?: string;
  dbId?: string | number | null;
  syncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  savedAmount?: number;
  isFavorite?: boolean;
}

export interface HistoryItem {
  id: string;
  type: 'Discount' | 'Weight' | 'Unit' | 'EMI' | 'Wishlist' | 'Currency' | 'Age' | 'Calculator' | string;
  details: string;
  result: string;
  timestamp: string;
  createdAt?: string;
  dbId?: string | number | null;
  syncStatus?: 'synced' | 'syncing' | 'local' | 'error';
  savedAmount?: number;
  isFavorite?: boolean;
}

const BASE_STORAGE_KEY = 'retail-calc-history';

export function getStorageKey(userId?: string | null): string {
  if (userId && typeof userId === 'string' && userId.trim()) {
    return `${BASE_STORAGE_KEY}-${userId.trim()}`;
  }
  return `${BASE_STORAGE_KEY}-guest`;
}

/**
 * Retrieves the stored history array from local storage for a specific user ID or guest.
 * If no data exists or an error occurs, returns an empty array.
 */
export function getCalculationHistory(userId?: string | null): HistoryItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const key = getStorageKey(userId);
    let storedData = localStorage.getItem(key);

    // If scoped key has no items yet and no specific user, fallback to base key
    if (!storedData && !userId) {
      storedData = localStorage.getItem(BASE_STORAGE_KEY);
    }

    if (!storedData) {
      return [];
    }
    const parsed = JSON.parse(storedData);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to retrieve calculation history from local storage:', error);
    return [];
  }
}

/**
 * Saves a calculation detail object into local storage for a specific user ID or guest.
 * @param calculationDetails Object containing calculation details
 * @param userId Optional user UID for user-specific history scoping
 * @returns The updated array of history items
 */
export function saveCalculationHistory(
  calculationDetails: CalculationDetails,
  userId?: string | null
): HistoryItem[] {
  const existingHistory = getCalculationHistory(userId);

  const newItem: HistoryItem = {
    id: calculationDetails.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
    type: calculationDetails.type,
    details: calculationDetails.details,
    result: calculationDetails.result,
    createdAt: calculationDetails.createdAt || new Date().toISOString(),
    timestamp: calculationDetails.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    dbId: calculationDetails.dbId,
    syncStatus: calculationDetails.syncStatus || 'local',
    savedAmount: calculationDetails.savedAmount,
    isFavorite: Boolean(calculationDetails.isFavorite),
  };

  // Prepend new calculation to existing array (limiting to last 50 entries)
  const updatedHistory = [newItem, ...existingHistory.filter((item) => item.id !== newItem.id)].slice(0, 50);

  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(updatedHistory));
      if (!userId) {
        localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(updatedHistory));
      }
    } catch (error) {
      console.error('Failed to save calculation history to local storage:', error);
    }
  }

  return updatedHistory;
}

/**
 * Directly overwrites the calculation history for a specific user ID.
 */
export function setCalculationHistory(items: HistoryItem[], userId?: string | null): void {
  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(items.slice(0, 50)));
      if (!userId) {
        localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
      }
    } catch (error) {
      console.error('Failed to set calculation history in local storage:', error);
    }
  }
}

/**
 * Deletes a single calculation history item by ID or item object from local storage for a specific user ID or guest.
 * @param itemOrId The unique ID of the item to delete or the full HistoryItem object
 * @param userId Optional user UID for user-specific history scoping
 * @returns The updated array of history items
 */
export function deleteCalculationHistoryItem(
  itemOrId: string | { id?: string; dbId?: string | number | null; details?: string; result?: string; type?: string },
  userId?: string | null
): HistoryItem[] {
  const existingHistory = getCalculationHistory(userId);
  
  let targetId: string | null = null;
  let targetDbId: string | null = null;
  let targetDetails: string | null = null;
  let targetResult: string | null = null;
  let targetType: string | null = null;

  if (typeof itemOrId === 'string') {
    targetId = itemOrId;
    targetDbId = itemOrId;
  } else if (itemOrId && typeof itemOrId === 'object') {
    targetId = itemOrId.id || null;
    targetDbId = itemOrId.dbId ? itemOrId.dbId.toString() : null;
    targetDetails = itemOrId.details || null;
    targetResult = itemOrId.result || null;
    targetType = itemOrId.type || null;
  }

  const updatedHistory = existingHistory.filter((item) => {
    // Check ID match
    if (targetId && item.id === targetId) return false;
    // Check dbId match
    if (targetDbId && item.dbId && item.dbId.toString() === targetDbId) return false;
    // Check content match
    if (targetDetails && targetResult && item.details === targetDetails && item.result === targetResult) {
      if (!targetType || item.type === targetType) return false;
    }
    return true;
  });

  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(updatedHistory));
      
      // Also clean up base key and guest key if matching items exist there
      const guestKey = `${BASE_STORAGE_KEY}-guest`;
      [BASE_STORAGE_KEY, guestKey].forEach((k) => {
        try {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((item) => {
                if (targetId && item.id === targetId) return false;
                if (targetDbId && item.dbId && item.dbId.toString() === targetDbId) return false;
                if (targetDetails && targetResult && item.details === targetDetails && item.result === targetResult) return false;
                return true;
              });
              localStorage.setItem(k, JSON.stringify(filtered));
            }
          }
        } catch {
          // ignore
        }
      });
    } catch (error) {
      console.error('Failed to delete calculation history item from local storage:', error);
    }
  }

  return updatedHistory;
}

/**
 * Clears the stored calculation history from local storage for a specific user ID or guest.
 */
export function clearCalculationHistory(userId?: string | null): HistoryItem[] {
  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.removeItem(key);
      localStorage.removeItem(BASE_STORAGE_KEY);
      localStorage.removeItem(`${BASE_STORAGE_KEY}-guest`);
    } catch (error) {
      console.error('Failed to clear calculation history from local storage:', error);
    }
  }
  return [];
}

/**
 * Toggles the favorite flag for a calculation history item and persists across local caches.
 */
export function toggleCalculationHistoryFavorite(
  itemId: string,
  userId?: string | null
): HistoryItem[] {
  const existingHistory = getCalculationHistory(userId);
  const updatedHistory = existingHistory.map((item) =>
    item.id === itemId || (item.dbId && item.dbId.toString() === itemId)
      ? { ...item, isFavorite: !item.isFavorite }
      : item
  );

  if (typeof window !== 'undefined') {
    try {
      const key = getStorageKey(userId);
      localStorage.setItem(key, JSON.stringify(updatedHistory.slice(0, 50)));
      if (!userId) {
        localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify(updatedHistory.slice(0, 50)));
      }
    } catch (error) {
      console.error('Failed to update favorite status in local storage:', error);
    }
  }

  return updatedHistory;
}

/**
 * Extracts numeric money saved from calculation details or result string for gamified summaries.
 */
export function parseSavedAmountFromText(type?: string, details?: string, result?: string): number {
  try {
    const combined = `${details || ''} ${result || ''}`;
    
    // 1. Discount specific patterns: Total Savings: $200.00 or Savings: 50
    const savingsMatch = combined.match(/(?:total savings|savings|saved)[\s:]*([^\d\s]+)?\s*([\d,]+(?:\.\d+)?)/i);
    if (savingsMatch && savingsMatch[2]) {
      const parsed = parseFloat(savingsMatch[2].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }

    // 2. Wishlist already saved pattern: Already Saved: 15,000
    const wishlistMatch = combined.match(/(?:already saved|saved amount|saved)[\s:]*([^\d\s]+)?\s*([\d,]+(?:\.\d+)?)/i);
    if (wishlistMatch && wishlistMatch[2]) {
      const parsed = parseFloat(wishlistMatch[2].replace(/,/g, ''));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Ignore regex parsing error
  }
  return 0;
}


