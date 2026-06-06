// ==============================================================================
// GHITA CODING AGENT - EventStream Module Barrel Export (Phase 7)
// ==============================================================================

export { EventStream, event_to_dict, dict_to_event } from './event-stream.js';

export type {
  StreamEvent,
  StreamEventType,
  EventSource,
  EventSubscriber,
  EventStreamConfig,
  StreamStats,
  ReplayFilter,
  RewindWriter,
} from './types.js';
