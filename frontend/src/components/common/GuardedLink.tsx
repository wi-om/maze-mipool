import type { MouseEvent, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { toast } from "sonner";
import { useNavigationLockOptional } from "../../context/NavigationLockContext";

const DEFAULT_MESSAGE = "Finish Confirm & Commit before leaving this page.";

export function useNavigationGuard() {
  const lock = useNavigationLockOptional();
  const locked = lock?.locked ?? false;
  const message = lock?.lockReason || DEFAULT_MESSAGE;

  const blockIfLocked = (event?: MouseEvent) => {
    if (!locked) return false;
    event?.preventDefault();
    event?.stopPropagation();
    toast.warning(message);
    return true;
  };

  return { locked, message, blockIfLocked };
}

/** Link that cannot navigate while confirm-payout lock is active. */
export function GuardedLink({ children, onClick, ...props }: LinkProps & { children?: ReactNode }) {
  const { blockIfLocked } = useNavigationGuard();

  return (
    <Link
      {...props}
      onClick={(e) => {
        if (blockIfLocked(e)) return;
        onClick?.(e);
      }}
    >
      {children}
    </Link>
  );
}
