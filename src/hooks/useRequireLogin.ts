import { useCallback } from 'react';
import { useAuth } from '../store/auth';

/**
 * 需要登录的操作守卫：未登录时弹出登录框并返回 false。
 */
export function useRequireLogin() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);

  return useCallback(
    (action?: () => void, hint = '登录后即可使用该功能') => {
      if (!user) {
        openModal(hint);
        return false;
      }
      action?.();
      return true;
    },
    [user, openModal],
  );
}
