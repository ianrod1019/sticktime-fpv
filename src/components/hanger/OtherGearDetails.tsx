import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Box,
  Settings,
  Tag,
  Activity,
  Shield,
  Zap,
  Cpu,
  Radio,
} from "lucide-react";
import { HangerItem } from "@/hooks/useHangerItem";

interface OtherGearDetailsProps {
  item: HangerItem;
}

export function OtherGearDetails({ item }: OtherGearDetailsProps) {
  const isAsNeeded = item.service_interval_minutes <= 0;
  const servicePct = isAsNeeded
    ? 0
    : Math.min(
        100,
        Math.round(
          (item.minutes_since_service / item.service_interval_minutes) * 100,
        ),
      );

  const genericProperties: Array<{ label: string; value: string }> = [
    { label: "Item Category", value: "Other Gear" },
    { label: "Custom Property 1", value: "Not recorded" },
    { label: "Custom Property 2", value: "Not recorded" },
    { label: "Custom Property 3", value: "Not recorded" },
    { label: "Notes", value: item.notes ?? "No notes recorded" },
  ];

  const customFields: Array<{ label: string; value: string }> = [
    { label: "Field 1 (Label)", value: "Custom value" },
    { label: "Field 2 (Label)", value: "Custom value" },
    { label: "Field 3 (Label)", value: "Custom value" },
    { label: "Field 4 (Label)", value: "Custom value" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Box className="h-4 w-4" /> Generic Properties
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {genericProperties.map((prop) => (
                <div
                  key={prop.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                    {prop.label}
                  </span>
                  <span className="font-mono text-sm text-foreground text-right">
                    {prop.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-medium">Status:</span>
              {isAsNeeded ? (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 border-primary/30 text-primary"
                >
                  Service as needed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-2 py-0">
                  Service due in{" "}
                  {Math.max(
                    0,
                    item.service_interval_minutes - item.minutes_since_service,
                  )}{" "}
                  min
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Tag className="h-4 w-4" /> Custom Metadata Fields
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {customFields.map((field) => (
                <div
                  key={field.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                    {field.label}
                  </span>
                  <span className="font-mono text-sm text-foreground">
                    {field.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Activity className="h-4 w-4" /> Usage &amp; Service History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Total Usage
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {item.total_minutes} min
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Service Wear
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {servicePct}%
              </div>
            </div>
            <div className="bg-muted/30 border border-primary/10 rounded-lg p-3">
              <div className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-1">
                Crash Count
              </div>
              <div className="font-mono font-medium text-sm text-foreground">
                {item.crash_count}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Service Interval
              </span>
              <span className="font-mono text-sm text-foreground">
                {item.service_interval_minutes} min
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                Pack Count
              </span>
              <span className="font-mono text-sm text-foreground">
                {item.pack_count}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-primary font-medium">Status:</span>
              {isAsNeeded ? (
                <Badge
                  variant="outline"
                  className="text-[10px] px-2 py-0 border-primary/30 text-primary"
                >
                  Service as needed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] px-2 py-0">
                  Service due in{" "}
                  {Math.max(
                    0,
                    item.service_interval_minutes - item.minutes_since_service,
                  )}{" "}
                  min
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Settings className="h-4 w-4" /> Configuration &amp; Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Metadata Enabled
                </span>
                <span className="font-mono text-sm text-foreground">Yes</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Custom Properties
                </span>
                <span className="font-mono text-sm text-foreground">
                  4 fields
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Last Updated
                </span>
                <span className="font-mono text-sm text-foreground">
                  Recent
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Shield className="h-4 w-4" /> Notes &amp; Observations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Condition
                </span>
                <span className="font-mono text-sm text-foreground">Good</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Storage
                </span>
                <span className="font-mono text-sm text-foreground">Dry</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  Warranty
                </span>
                <span className="font-mono text-sm text-foreground">
                  Unknown
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Zap className="h-4 w-4" /> Quick Reference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge
              variant="outline"
              className="text-[10px] px-2 py-0 border-primary/30 text-primary"
            >
              Custom metadata enabled
            </Badge>
            <span>
              Use this section to display any additional custom properties
              associated with this gear item.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
