import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, MapPin, Route as RouteIcon, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SIM_PLATFORMS } from "@/lib/fpv";

export const Route = createFileRoute("/_authenticated/spots")({
  head: () => ({
    meta: [
      { title: "Spots & tracks — StickTime FPV" },
      { name: "description", content: "Map your flying locations and the tracks or sim scenarios you fly there." },
      { property: "og:title", content: "Spots & tracks — StickTime FPV" },
      {
        property: "og:description",
        content: "Map your flying locations and the tracks or sim scenarios you fly there.",
      },
    ],
  }),
  component: Spots;
});

function Spots() {
  return null;
}
