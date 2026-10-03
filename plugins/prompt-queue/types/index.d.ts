export type QueuedPrompt = { id: string; text: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-queue': {
      items: QueuedPrompt[]
      isBusy: boolean
      releasing: string | null
    }
  }
}
