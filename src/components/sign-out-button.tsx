import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        className="flex w-full items-center justify-start gap-0 group-hover:gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={onClick}
      >
        <LogOut className="h-4 w-4 shrink-0" />
      </Button>
    </div>
  );
}