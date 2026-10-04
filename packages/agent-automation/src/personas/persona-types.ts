import type { AutomationEngine } from "../types.js";

export interface PersonaProfile {
  id: string;
  name: string;
  role: string;
  title: string;
  preferredEngine: AutomationEngine;
  inspectionFocus: string[];
  systemPromptVoice: string;
  tolerance: {
    allowRetries: number;
    failFast: boolean;
    requireScreenshots: boolean;
  };
}
