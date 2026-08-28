import { useEffect, useState } from "react";
    import { supabase } from "@/integrations/supabase/client";

    export function DbAutoInitializer({ children }: { children: React.ReactNode }) {
      const [initialized, setInitialized] = useState(false);

      useEffect(() => {
        async function checkAndInit() {
          try {
            // Verify table accessibility or create record if needed
            await supabase.from("drones").select("id").limit(1);
          } catch (err) {
            console.error("Database table check note:", err);
          } finally {
            setInitialized(true);
          }
        }
        checkAndInit();
      }, []);

      return <>{children}</>;
    }
