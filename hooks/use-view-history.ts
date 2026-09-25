'use client';
import { useEffect, useRef, useState } from 'react';
/** Navigation is deliberately separate from document undo and mission commands. */
export function useViewHistory<T extends object>(
  view: T,
  restore: (view: T) => void,
  scope: string,
) {
  const stack = useRef<T[]>([]),
    previous = useRef(view),
    restoring = useRef(false);
  const priorScope = useRef(scope);
  const [count, setCount] = useState(0);
  const key = JSON.stringify(view);
  useEffect(() => {
    if (scope !== priorScope.current) {
      stack.current = [];
      priorScope.current = scope;
    } else if (restoring.current) restoring.current = false;
    else if (JSON.stringify(previous.current) !== key) {
      stack.current.push(previous.current);
      stack.current = stack.current.slice(-40);
    }
    previous.current = JSON.parse(key) as T;
    setCount(stack.current.length);
  }, [key, scope]);
  return {
    canBack: count > 0,
    back: () => {
      const last = stack.current.pop();
      if (!last) return;
      restoring.current = true;
      previous.current = last;
      setCount(stack.current.length);
      restore(last);
    },
  };
}
