import { ShieldCheck } from "lucide-react";

    export function SecurityBadge() {
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-md border border-border/50">
          <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          <span>Supabase Auth: Passwords securely hashed with <b>Argon2 / bcrypt</b> (Server-Side)</span>
        </div>
      );
    }
