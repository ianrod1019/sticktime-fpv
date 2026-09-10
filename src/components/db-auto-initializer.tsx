import { useEffect, useState } from "react";
import { db_request } from "@/lib/db_request";

export function DbAutoInitializer({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function checkAndInit() {
      try {
        const { data } = await db_request({
          mode: "query",
          schema: "personal_gear",
          table: "drones",
          operation: "select",
          selectColumns: "id",
          limit: 1,
        });
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