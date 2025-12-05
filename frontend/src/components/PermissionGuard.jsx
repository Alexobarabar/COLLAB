import React from 'react';
import { usePermission } from '../hooks/usePermission';

/**
 * Component that conditionally renders children based on permission
 * @param {object} props
 * @param {string} props.feature - The feature name to check permission for
 * @param {string} props.role - The user's role ('dean' or 'instructor')
 * @param {React.ReactNode} props.children - The content to render if permission is granted
 * @param {React.ReactNode} props.fallback - Optional content to render if permission is denied
 * @param {boolean} props.showLoading - Whether to show loading state (default: false)
 * @returns {React.ReactNode}
 */
const PermissionGuard = ({ feature, role, children, fallback = null, showLoading = false }) => {
  const { hasPermission, loading } = usePermission(feature, role);

  if (loading && showLoading) {
    return <div style={{ opacity: 0.5 }}>Loading...</div>;
  }

  if (!hasPermission) {
    return fallback;
  }

  return <>{children}</>;
};

export default PermissionGuard;

