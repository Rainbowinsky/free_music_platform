import { useCallback } from 'react';
import { useAuth } from '../store/auth';

/**
 * 需要登录的操作守卫：未登录时弹出登录框并返回 false。
 */
export function useRequireLogin() {
  const user = useAuth((s) => s.user);
  const openModal = useAuth((s) => s.openModal);

  return useCallback(
    (action?: () => void | Promise<void>, hint = '登录后即可使用该功能') => {
      if (!user) {
        openModal(hint);
        return false;
      }
      // action 现在大多是异步的后端写入，这里统一接住它的 Promise，
      // 出错由 store 自己的 error 字段呈现，避免出现 unhandled rejection。
      void Promise.resolve(action?.());
      return true;
    },
    [user, openModal],
  );
}
