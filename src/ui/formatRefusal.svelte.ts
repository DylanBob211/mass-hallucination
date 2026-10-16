/** Why the last Format was refused, shown on the status line until the next edit. UI state. */
export class FormatRefusalState {
  reason = $state<string | undefined>(undefined);
}
