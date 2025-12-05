import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Cache for permissions to avoid repeated API calls
const permissionsCache = {
  dean: null,
  instructor: null,
  lastFetch: {
    dean: null,
    instructor: null,
  },
};

const CACHE_DURATION = 30000; // 30 seconds

/**
 * Hook to check if a user has permission for a specific feature
 * @param {string} featureName - The feature to check permission for
 * @param {string} userRole - The user's role ('dean' or 'instructor')
 * @returns {object} { hasPermission: boolean, loading: boolean, error: string | null, refetch: function }
 */
export function usePermission(featureName, userRole) {
  const [hasPermission, setHasPermission] = useState(true); // Default to true for better UX
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPermissions = useCallback(async () => {
    if (!userRole || !featureName) {
      setHasPermission(false);
      setLoading(false);
      return;
    }

    try {
      // Check cache first
      const now = Date.now();
      const lastFetch = permissionsCache.lastFetch[userRole];
      const cachedPermissions = permissionsCache[userRole];

      if (cachedPermissions && lastFetch && now - lastFetch < CACHE_DURATION) {
        // Use cached data
        const permission = cachedPermissions[featureName];
        setHasPermission(permission !== false); // Default to true if not explicitly false
        setLoading(false);
        return;
      }

      // Fetch from API
      setLoading(true);
      const response = await axios.get(`http://localhost:5000/api/rbac/permissions/${userRole}`);

      if (response.data.success) {
        // Update cache
        permissionsCache[userRole] = response.data.permissions;
        permissionsCache.lastFetch[userRole] = now;

        const permission = response.data.permissions[featureName];
        setHasPermission(permission !== false); // Default to true if not explicitly false
      } else {
        setHasPermission(false);
        setError('Failed to fetch permissions');
      }
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError(err.message);
      // On error, default to true to avoid blocking the UI
      setHasPermission(true);
    } finally {
      setLoading(false);
    }
  }, [featureName, userRole]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    hasPermission,
    loading,
    error,
    refetch: fetchPermissions,
  };
}

/**
 * Hook to get all permissions for a role
 * @param {string} userRole - The user's role ('dean' or 'instructor')
 * @returns {object} { permissions: object, loading: boolean, error: string | null, refetch: function }
 */
export function useAllPermissions(userRole) {
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categories, setCategories] = useState({});
  const [labels, setLabels] = useState({});

  const fetchPermissions = useCallback(async () => {
    if (!userRole) {
      setLoading(false);
      return;
    }

    try {
      // Check cache first
      const now = Date.now();
      const lastFetch = permissionsCache.lastFetch[userRole];
      const cachedPermissions = permissionsCache[userRole];

      if (cachedPermissions && lastFetch && now - lastFetch < CACHE_DURATION) {
        // Use cached data
        setPermissions(cachedPermissions);
        setLoading(false);
        return;
      }

      // Fetch from API
      setLoading(true);
      const response = await axios.get(`http://localhost:5000/api/rbac/permissions/${userRole}`);

      if (response.data.success) {
        // Update cache
        permissionsCache[userRole] = response.data.permissions;
        permissionsCache.lastFetch[userRole] = now;

        setPermissions(response.data.permissions);
        setCategories(response.data.categories || {});
        setLabels(response.data.labels || {});
      } else {
        setError('Failed to fetch permissions');
      }
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userRole]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    categories,
    labels,
    loading,
    error,
    refetch: fetchPermissions,
  };
}

/**
 * Clear permissions cache (useful after updates)
 */
export function clearPermissionsCache() {
  permissionsCache.dean = null;
  permissionsCache.instructor = null;
  permissionsCache.lastFetch.dean = null;
  permissionsCache.lastFetch.instructor = null;
}

/**
 * Simple function to check permission (synchronous, uses cache)
 * @param {string} featureName - The feature to check
 * @param {string} userRole - The user's role
 * @returns {boolean} - Whether the user has permission
 */
export function can(featureName, userRole) {
  if (!userRole || !featureName) return false;
  
  const cachedPermissions = permissionsCache[userRole];
  if (!cachedPermissions) return true; // Default to true if not loaded yet
  
  const permission = cachedPermissions[featureName];
  return permission !== false; // Default to true if not explicitly false
}

export default usePermission;

