// ==============================================================================
// GHITA CODING AGENT - OpenClaw Event-Driven Skill Trigger Engine
// ==============================================================================
// Evaluates system & workspace events (file save, git commit, webhook) and triggers
// associated automated skill routines across platforms.
// ==============================================================================

export type SystemEventType =
  | 'file_saved'
  | 'git_committed'
  | 'webhook_received'
  | 'cron_triggered';

export interface EventTrigger {
  id: string;
  eventType: SystemEventType;
  pattern?: string;
  skillId: string;
  enabled: boolean;
}

export class OpenClawTriggerEngine {
  private triggers: Map<string, EventTrigger> = new Map();

  registerTrigger(trigger: EventTrigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  evaluateEvent(eventType: SystemEventType, eventPayloadPath?: string): EventTrigger[] {
    const matched: EventTrigger[] = [];

    for (const trigger of this.triggers.values()) {
      if (!trigger.enabled || trigger.eventType !== eventType) continue;

      if (!trigger.pattern || (eventPayloadPath && eventPayloadPath.includes(trigger.pattern))) {
        matched.push(trigger);
      }
    }

    return matched;
  }
}
